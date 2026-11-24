/* Regras de cálculo — reproduzem as fórmulas da aba RESUMO da planilha e
   acrescentam: nota automática, alerta crítico prevalecendo sobre a média,
   blocos condicionais não confirmados e pontuação ViP (B=0, R=2, C=5). */
const Calc = (() => {
  const D = window.VISTORIA_DATA;

  const chave = (bloco, item) => bloco.codigo + '|' + item.codigo;

  function notaDe(aval) {
    if (!aval) return null;
    const n = parseInt(String(aval).charAt(0), 10);
    return n >= 1 && n <= 5 ? n : null;
  }

  function prioridadeDe(m) {
    if (m === null || m === undefined || isNaN(m)) return '';
    if (m >= 4.5) return 'Manter';
    if (m >= 3.5) return 'Melhoria pontual';
    if (m >= 2.5) return 'Programar melhoria';
    return 'Intervenção prioritária';
  }

  function classificacaoDe(m) {
    if (m === null || m === undefined || isNaN(m)) return '';
    if (m >= 4.5) return 'Muito favorável';
    if (m >= 3.5) return 'Favorável';
    if (m >= 2.5) return 'Regular';
    if (m >= 1.5) return 'Desfavorável';
    return 'Muito desfavorável';
  }

  /* Item "agregador" (ex.: P03.1) cuja nota é a média dos sub-quesitos (P03.1a–c). */
  function ehCalculado(bloco, item) {
    return !item.sub && bloco.itens.some(x => x.sub && x.codigo.startsWith(item.codigo));
  }
  function subsDe(bloco, item) {
    return bloco.itens.filter(x => x.sub && x.codigo.startsWith(item.codigo));
  }

  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  function notaCalculada(st, bloco, item) {
    const ns = subsDe(bloco, item).map(s => notaDe((st.r[chave(bloco, s)] || {}).a)).filter(n => n !== null);
    return media(ns);
  }

  function blocoAtivo(st, bloco) {
    return !(bloco.condicional && st.cond && st.cond[bloco.codigo] === 'nao');
  }

  function resumoBloco(st, bloco) {
    const r = st.r || {};
    const ativo = blocoAtivo(st, bloco);
    if (bloco.tipo === 'P') {
      const itens = bloco.itens.filter(it => !ehCalculado(bloco, it));
      let resp = 0, alertas = 0; const notas = [];
      for (const it of itens) {
        const v = r[chave(bloco, it)] || {};
        if (v.a) resp++;
        const n = notaDe(v.a); if (n !== null) notas.push(n);
        if (v.alerta === 'Sim') alertas++;
      }
      const m = media(notas);
      return {
        tipo: 'P', ativo, total: itens.length, resp,
        cobertura: itens.length ? resp / itens.length : 0,
        media: m, alertas,
        classificacao: classificacaoDe(m),
        prioridade: alertas > 0 ? 'Intervenção prioritária' : prioridadeDe(m),
        alertaPrevalece: alertas > 0 && prioridadeDe(m) !== 'Intervenção prioritária' && m !== null
      };
    }
    const cont = { B: 0, R: 0, C: 0, NA: 0, NI: 0 };
    let resp = 0, alertas = 0;
    for (const it of bloco.itens) {
      const v = r[chave(bloco, it)] || {};
      if (v.s) { resp++; cont[v.s.split(' ')[0]]++; }
      if ((v.s || '').startsWith('C ') || v.alerta === 'Sim') alertas++;
    }
    const avaliados = cont.B + cont.R + cont.C;
    return {
      tipo: 'ViP', ativo: true, total: bloco.itens.length, resp,
      cobertura: bloco.itens.length ? resp / bloco.itens.length : 0,
      cont, alertas, pontos: cont.R * 2 + cont.C * 5,
      pontosMax: avaliados * 5,
      indice: avaliados ? (cont.R * 2 + cont.C * 5) / (avaliados * 5) : null
    };
  }

  function resumoEstacao(est, st) {
    const blocos = est.blocos.map(b => ({ bloco: b, res: resumoBloco(st, b) }));
    const pAtivos = blocos.filter(x => x.res.tipo === 'P' && x.res.ativo);
    const vips = blocos.filter(x => x.res.tipo === 'ViP');
    const medias = pAtivos.map(x => x.res.media).filter(m => m !== null);
    const mediaGeral = media(medias);
    const alertasP = pAtivos.reduce((a, x) => a + x.res.alertas, 0);
    const alertasV = vips.reduce((a, x) => a + x.res.alertas, 0);
    const total = pAtivos.reduce((a, x) => a + x.res.total, 0) + vips.reduce((a, x) => a + x.res.total, 0);
    const resp = pAtivos.reduce((a, x) => a + x.res.resp, 0) + vips.reduce((a, x) => a + x.res.resp, 0);
    const condPend = est.blocos.filter(b => b.condicional && !(st.cond && st.cond[b.codigo])).length;
    const cont = { B: 0, R: 0, C: 0, NA: 0, NI: 0 };
    vips.forEach(x => Object.keys(cont).forEach(k => { cont[k] += x.res.cont[k]; }));
    const temConteudo = resp > 0 || (st.anot || '').trim() || (st.fech && (st.fech.obs || st.fech.pend));
    let status = 'nao';
    if (temConteudo) status = 'and';
    if (total > 0 && resp >= total && condPend === 0) status = 'ok';
    if (total === 0 && (st.anot || '').trim()) status = 'ok';
    return {
      blocos, mediaGeral,
      coberturaP: pAtivos.length ? media(pAtivos.map(x => x.res.cobertura)) : null,
      coberturaVip: vips.length ? media(vips.map(x => x.res.cobertura)) : null,
      alertas: alertasP + alertasV, alertasP, alertasV,
      prioridade: alertasP > 0 ? 'Intervenção prioritária' : prioridadeDe(mediaGeral),
      classificacao: classificacaoDe(mediaGeral),
      total, resp, progresso: total ? resp / total : (status === 'ok' ? 1 : 0),
      vip: { cont, pontos: cont.R * 2 + cont.C * 5 },
      condPend, status,
      temP: est.blocos.some(b => b.tipo === 'P'),
      temVip: vips.length > 0
    };
  }

  return { chave, notaDe, prioridadeDe, classificacaoDe, ehCalculado, subsDe, notaCalculada, blocoAtivo, resumoBloco, resumoEstacao, media };
})();
