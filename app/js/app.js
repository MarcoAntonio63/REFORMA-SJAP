/* Aplicativo de Vistoria JFAP — interface, navegação e registro de campo. */
(() => {
  const D = window.VISTORIA_DATA;
  const EST = D.estacoes;
  const porNum = Object.fromEntries(EST.map(e => [e.num, e]));
  const L = D.listas;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const view = $('#view');

  const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = v => h(v).replace(/\n/g, '<br>');
  const pct = x => x === null || x === undefined ? '—' : Math.round(x * 100) + '%';
  const num1 = x => x === null || x === undefined ? '—' : x.toFixed(2).replace('.', ',');
  const pad2 = n => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const agora = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
  const dataHoraBR = ts => { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

  /* ------------------------------------------------------------------ estado */
  const CFG_PADRAO = {
    proxFoto: 1, carimbo: true, maxLado: 1920, qualidade: 0.82,
    vistoriadorPadrao: '', acompanhantePadrao: '', textos: {}, filtroPav: 'Todos'
  };
  const S = { cfg: { ...CFG_PADRAO }, est: {}, fotos: [], thumbs: new Map(), alvoFoto: null };

  function novoEstado(num) {
    return {
      num, ident: { data: '', vistoriador: '', acompanhante: '', inicio: '', termino: '' },
      cond: {}, r: {}, anot: '', fech: { verP: '', verV: '', obs: '', pend: '', assin: '', assinNome: '' }, upd: 0
    };
  }
  const st = num => (S.est[num] ||= novoEstado(num));

  const timers = {};
  function salvarEst(num) {
    st(num).upd = Date.now();
    indicador('pendente');
    clearTimeout(timers[num]);
    timers[num] = setTimeout(async () => {
      try { await DB.put('estacoes', S.est[num]); indicador('ok'); } catch (e) { indicador('erro'); toast('Erro ao salvar: ' + e.message); }
    }, 350);
  }
  async function salvarCfg() { await DB.put('config', S.cfg, 'cfg'); }
  function flush() { Object.keys(timers).forEach(n => { clearTimeout(timers[n]); DB.put('estacoes', S.est[n]); }); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function indicador(s) {
    const el = $('#saveInd');
    el.className = 'save-ind ' + s;
    el.title = s === 'ok' ? 'Tudo salvo neste dispositivo' : s === 'erro' ? 'Erro ao salvar' : 'Salvando…';
  }

  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* --------------------------------------------------------- auxiliares UI */
  const grupoPav = e => {
    const p = e.pavimento || '';
    if (p.startsWith('Térreo')) return 'Térreo';
    if (p.startsWith('1º')) return '1º pavimento';
    if (p.startsWith('2º')) return '2º pavimento';
    return 'Edificação / técnica';
  };
  const GRUPOS = ['Todos', 'Térreo', '1º pavimento', '2º pavimento', 'Edificação / técnica'];

  const corNota = n => n === null || n === undefined ? 'nx' : 'n' + Math.max(1, Math.min(5, Math.round(n)));
  const corPrio = p => ({ 'Manter': 'p1', 'Melhoria pontual': 'p2', 'Programar melhoria': 'p3', 'Intervenção prioritária': 'p4' }[p] || 'p0');
  const STATUS_TXT = { nao: 'Não iniciada', and: 'Em andamento', ok: 'Concluída' };

  function textoQuesito(it) {
    const t = S.cfg.textos[it.codigo] || {};
    return { pergunta: it.pergunta || t.pergunta || '', observar: it.observar || t.observar || '', custom: !it.pergunta };
  }

  const fotosDe = (num, k) => S.fotos.filter(f => f.estacao === num && (k === undefined || f.chave === k)).sort((a, b) => a.num - b.num);
  const listaNums = fs => fs.map(f => Fotos.pad(f.num, 3)).join(', ');
  function faixaFotos(num) {
    const fs = fotosDe(num);
    if (!fs.length) return '';
    const a = fs[0].num, b = fs[fs.length - 1].num;
    return a === b ? Fotos.pad(a, 3) : `${Fotos.pad(a, 3)} a ${Fotos.pad(b, 3)} (${fs.length} fotos)`;
  }

  function thumbURL(f) {
    if (!S.thumbs.has(f.id)) S.thumbs.set(f.id, URL.createObjectURL(f.thumb || f.blob));
    return S.thumbs.get(f.id);
  }

  function topo(t, sub, voltar) {
    $('#tituloTopo').textContent = t;
    $('#subtituloTopo').textContent = sub || '';
    $('#btnVoltar').hidden = !voltar;
    document.title = t === 'Vistoria JFAP' ? t : `${t} — Vistoria JFAP`;
  }
  function abaAtiva(tab) { $$('.bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab)); }

  /* ================================================================ ROTAS */
  async function rota() {
    const hsh = location.hash.replace(/^#/, '') || '/';
    const p = hsh.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    view.onclick = view.oninput = view.onchange = null;
    if (p[0] === 'e' && porNum[+p[1]]) return telaEstacao(+p[1], p[2]);
    if (p[0] === 'resumo') return telaResumo();
    if (p[0] === 'fotos') return telaFotos(p[1] ? +p[1] : null);
    if (p[0] === 'exportar') return telaExportar();
    if (p[0] === 'mais') return telaMais();
    if (p[0] === 'ref') return telaRef(p[1]);
    if (p[0] === 'quesitos') return telaQuesitos();
    if (p[0] === 'config') return telaConfig();
    return telaLista();
  }
  window.addEventListener('hashchange', rota);
  $('#btnVoltar').addEventListener('click', () => {
    const hsh = location.hash;
    if (hsh.startsWith('#/ref') || hsh.startsWith('#/quesitos') || hsh.startsWith('#/config')) location.hash = '#/mais';
    else location.hash = '#/';
  });

  /* ======================================================= LISTA DE ESTAÇÕES */
  function telaLista() {
    topo('Vistoria JFAP', 'Prédio Sede — Macapá/AP');
    abaAtiva('estacoes');
    const resumos = EST.map(e => ({ e, r: Calc.resumoEstacao(e, st(e.num)) }));
    const concl = resumos.filter(x => x.r.status === 'ok').length;
    const tot = resumos.reduce((a, x) => a + x.r.total, 0);
    const resp = resumos.reduce((a, x) => a + x.r.resp, 0);
    const alertas = resumos.reduce((a, x) => a + x.r.alertas, 0);
    const f = S.cfg.filtroPav || 'Todos';

    view.innerHTML = `
      <section class="kpis">
        <div class="kpi"><b>${concl}<small>/${EST.length}</small></b><span>estações concluídas</span></div>
        <div class="kpi"><b>${pct(tot ? resp / tot : 0)}</b><span>itens avaliados (${resp}/${tot})</span></div>
        <div class="kpi ${alertas ? 'alerta' : ''}"><b>${alertas}</b><span>alertas críticos</span></div>
        <div class="kpi"><b>${S.fotos.length}</b><span>fotos</span></div>
      </section>
      <div class="toolbar">
        <input type="search" id="busca" placeholder="Buscar estação, setor ou código…" autocomplete="off">
      </div>
      <div class="chips" role="tablist">${GRUPOS.map(g => `<button class="chip ${g === f ? 'on' : ''}" data-pav="${h(g)}">${h(g)}</button>`).join('')}</div>
      <p class="dica">Percurso recomendado: Térreo → 1º pavimento → 2º pavimento → Cobertura → Casa de máquinas.</p>
      <div class="lista-est">${resumos.map(({ e, r }) => cardEstacao(e, r, f)).join('')}</div>`;

    $('#busca').addEventListener('input', ev => {
      const q = ev.target.value.trim().toLowerCase();
      $$('.est-card').forEach(c => { c.hidden = (q && !c.dataset.busca.includes(q)) || (!q && c.dataset.oculto === '1'); });
    });
  }

  function cardEstacao(e, r, filtro) {
    const nf = fotosDe(e.num).length;
    const oculto = filtro !== 'Todos' && grupoPav(e) !== filtro;
    const busca = [e.num, e.titulo, e.ambiente, e.pavimento, e.parametrosAplicaveis, e.vipAplicaveis].join(' ').toLowerCase();
    return `<a class="est-card st-${r.status}" href="#/e/${e.num}" data-busca="${h(busca)}" data-oculto="${oculto ? 1 : 0}" ${oculto ? 'hidden' : ''}>
      <span class="est-num">${pad2(e.num)}</span>
      <span class="est-info">
        <strong>${h(e.ambiente)}</strong>
        <small>${h(e.pavimento)} · ${h(e.tipoVerificacao)}</small>
        <span class="barra"><i style="width:${Math.round(r.progresso * 100)}%"></i></span>
        <span class="tags">
          <em class="tag s-${r.status}">${STATUS_TXT[r.status]}</em>
          ${r.mediaGeral !== null ? `<em class="tag ${corNota(r.mediaGeral)}">Média ${num1(r.mediaGeral)}</em>` : ''}
          ${r.alertas ? `<em class="tag alerta">⚠ ${r.alertas}</em>` : ''}
          ${nf ? `<em class="tag">📷 ${nf}</em>` : ''}
          ${r.condPend ? `<em class="tag cond">${r.condPend} condicional</em>` : ''}
        </span>
      </span>
    </a>`;
  }

  /* ============================================================== ESTAÇÃO */
  function telaEstacao(num, alvo) {
    const e = porNum[num];
    const s = st(num);
    topo(`Estação ${pad2(num)}`, e.ambiente, true);
    abaAtiva('estacoes');
    const idx = EST.indexOf(e);
    const ant = EST[idx - 1], prox = EST[idx + 1];
    const blocosP = e.blocos.map((b, i) => [b, i]).filter(([b]) => b.tipo === 'P');
    const blocosV = e.blocos.map((b, i) => [b, i]).filter(([b]) => b.tipo === 'ViP');

    view.innerHTML = `
      <section class="est-head">
        <h1>${h(e.titulo)}</h1>
        <p>${h(e.subtitulo)}</p>
        <div id="estSum">${resumoTopoEst(e)}</div>
      </section>

      <details class="card" ${s.ident.data ? '' : 'open'}>
        <summary>Identificação da vistoria</summary>
        <div class="grid2">
          <label>Data da vistoria<input type="date" data-id="data" value="${h(s.ident.data)}"></label>
          <label>Vistoriador<input type="text" data-id="vistoriador" value="${h(s.ident.vistoriador)}" placeholder="${h(S.cfg.vistoriadorPadrao)}" autocomplete="name"></label>
          <label>Acompanhante<input type="text" data-id="acompanhante" value="${h(s.ident.acompanhante)}" placeholder="${h(S.cfg.acompanhantePadrao)}"></label>
          <label>Hora início<span class="inline"><input type="time" data-id="inicio" value="${h(s.ident.inicio)}"><button type="button" class="btn sm" data-agora="inicio">Agora</button></span></label>
          <label>Hora término<span class="inline"><input type="time" data-id="termino" value="${h(s.ident.termino)}"><button type="button" class="btn sm" data-agora="termino">Agora</button></span></label>
        </div>
      </details>

      <details class="card">
        <summary>Ficha do local</summary>
        <dl class="ficha">${Object.entries(e.info).map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('')}
          <dt>Pavimento / área</dt><dd>${h(e.pavimento)}</dd>
          <dt>Tipo de verificação</dt><dd>${h(e.tipoVerificacao)}</dd>
          <dt>Nº de quesitos (ÍNDICE)</dt><dd>${h(e.nQuesitos)}</dd></dl>
      </details>

      ${e.foco ? `<div class="card foco"><h3>Foco da vistoria neste local</h3><p>${nl(e.foco)}</p></div>` : ''}

      <div class="acoes-foto card">
        <div><strong>Fotos gerais do local</strong><small>Fotos da estação: ${h(faixaFotos(num) || 'nenhuma')}</small></div>
        <div class="fotos-row" data-k="">${miniaturas(num, '')}
          <button class="btn foto" data-act="cam" data-k="">📷 Fotografar</button>
          <button class="btn sec sm" data-act="gal" data-k="">Galeria</button>
        </div>
      </div>

      <h2 class="sec-tit">Parâmetros P01–P09</h2>
      ${e.registroLivre ? `<div class="aviso">${h(e.registroLivre)}</div>` : ''}
      ${e.linhaAnotacoes ? `<div class="card"><label>Anotações de campo<textarea data-campo="anot" rows="6" placeholder="Registro livre do percurso / observações">${h(s.anot)}</textarea></label></div>` : ''}
      ${blocosP.map(([b, i]) => blocoHTML(e, b, i)).join('')}

      ${blocosV.length ? `<h2 class="sec-tit">Itens ViP — Vistoria predial</h2>` : ''}
      ${blocosV.map(([b, i]) => blocoHTML(e, b, i)).join('')}

      <h2 class="sec-tit">Fechamento</h2>
      <div class="card" id="fech">${fechamentoHTML(e)}</div>
      ${e.notas ? `<p class="notas">${h(e.notas).replace('insira a imagem na célula pelo menu nativo do aplicativo', 'use o botão 📷 de cada item — a numeração é automática')}</p>` : ''}

      <nav class="nav-est">
        ${ant ? `<a class="btn sec" href="#/e/${ant.num}">← ${pad2(ant.num)}</a>` : '<span></span>'}
        <button class="btn sec" data-act="pendente">Próximo item pendente</button>
        ${prox ? `<a class="btn sec" href="#/e/${prox.num}">${pad2(prox.num)} →</a>` : '<span></span>'}
      </nav>`;

    iniciarAssinatura(num);
    if (alvo) { const el = document.getElementById(decodeURIComponent(alvo)); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('destaque'); } }
  }

  function resumoTopoEst(e) {
    const r = Calc.resumoEstacao(e, st(e.num));
    return `<div class="barra grande"><i style="width:${Math.round(r.progresso * 100)}%"></i></div>
      <div class="tags">
        <em class="tag s-${r.status}">${STATUS_TXT[r.status]} · ${r.resp}/${r.total} itens</em>
        ${r.temP ? `<em class="tag ${corNota(r.mediaGeral)}">Média P: ${num1(r.mediaGeral)}</em>` : ''}
        ${r.prioridade ? `<em class="tag ${corPrio(r.prioridade)}">${h(r.prioridade)}</em>` : ''}
        ${r.temVip ? `<em class="tag">ViP B ${r.vip.cont.B} · R ${r.vip.cont.R} · C ${r.vip.cont.C}</em>` : ''}
        ${r.alertas ? `<em class="tag alerta">⚠ ${r.alertas} alerta(s) crítico(s)</em>` : ''}
        ${r.condPend ? `<em class="tag cond">${r.condPend} bloco(s) condicional(is) a confirmar</em>` : ''}
      </div>`;
  }

  function resumoBlocoHTML(e, b) {
    const r = Calc.resumoBloco(st(e.num), b);
    if (!r.ativo) return `<em class="tag">Não pontuado (condição não confirmada)</em>`;
    if (r.tipo === 'P') {
      return `<em class="tag">Cobertura ${pct(r.cobertura)}</em>
        <em class="tag ${corNota(r.media)}">Média ${num1(r.media)}${r.classificacao ? ' · ' + h(r.classificacao) : ''}</em>
        ${r.prioridade ? `<em class="tag ${corPrio(r.prioridade)}">${h(r.prioridade)}${r.alertaPrevalece ? ' (alerta prevalece)' : ''}</em>` : ''}
        ${r.alertas ? `<em class="tag alerta">⚠ ${r.alertas}</em>` : ''}`;
    }
    return `<em class="tag">Cobertura ${pct(r.cobertura)}</em>
      <em class="tag n5">B ${r.cont.B}</em><em class="tag n3">R ${r.cont.R}</em><em class="tag n1">C ${r.cont.C}</em>
      <em class="tag">NA ${r.cont.NA} · NI ${r.cont.NI}</em><em class="tag">Pontos ${r.pontos}</em>
      ${r.alertas ? `<em class="tag alerta">⚠ ${r.alertas}</em>` : ''}`;
  }

  function blocoHTML(e, b, i) {
    const s = st(e.num);
    const ativo = Calc.blocoAtivo(s, b);
    const c = s.cond[b.codigo] || '';
    return `<section class="bloco ${b.tipo === 'P' ? 'bp' : 'bv'} ${ativo ? '' : 'off'}" id="b${i}" data-bi="${i}">
      <header class="bloco-h">
        <h3>${h(b.titulo)}</h3>
        <div class="tags" id="bs${i}">${resumoBlocoHTML(e, b)}</div>
        ${b.condicional ? `<div class="cond-q">
          <span>Bloco condicional — a condição se confirmou em campo?</span>
          <span class="seg mini">
            <button data-cond="sim" data-bi="${i}" class="${c === 'sim' ? 'on' : ''}">Sim, pontuar</button>
            <button data-cond="nao" data-bi="${i}" class="${c === 'nao' ? 'on' : ''}">Não</button>
          </span></div>` : ''}
      </header>
      ${b.tipo === 'P' && b.itens.some(it => !textoQuesito(it).pergunta) ? `<p class="aviso peq">Os textos de “Pergunta de avaliação” e “O que observar” deste parâmetro não constam na planilha (células com fórmulas quebradas). Toque em ✎ para incluí-los — valem para todas as estações.</p>` : ''}
      <div class="itens">${b.itens.map(it => itemHTML(e, b, it, ativo)).join('')}</div>
    </section>`;
  }

  function miniaturas(num, k) {
    return fotosDe(num, k).map(f => `<button class="thumb" data-foto="${h(f.id)}" title="${h(f.id)}"><img src="${thumbURL(f)}" alt="Foto ${f.num}" loading="lazy"><span>${Fotos.pad(f.num, 3)}</span></button>`).join('');
  }

  function blocoFotos(e, k, dis) {
    const fs = fotosDe(e.num, k);
    return `<div class="fotos-row">${miniaturas(e.num, k)}
      <button class="btn foto sm" data-act="cam" data-k="${h(k)}" ${dis}>📷 Foto</button>
      <button class="btn sec sm" data-act="gal" data-k="${h(k)}" ${dis}>Galeria</button>
      <span class="evid">Fotos / Evidências (nº): <b>${fs.length ? listaNums(fs) : '—'}</b></span></div>`;
  }

  function itemHTML(e, b, it, ativo) {
    const s = st(e.num);
    const k = Calc.chave(b, it);
    const v = s.r[k] || {};
    const dis = ativo ? '' : 'disabled';
    const domId = 'i-' + k.replace(/[^A-Za-z0-9]/g, '_');

    if (b.tipo === 'ViP') {
      const sit = v.s || '';
      return `<article class="item vip ${sit ? 'sit-' + sit.split(' ')[0] : ''}" data-k="${h(k)}" data-bi="${e.blocos.indexOf(b)}" id="${domId}">
        <div class="item-h"><span class="cod">${h(it.codigo)}</span><span class="ind">${h(it.item)}</span></div>
        <p class="perg">${h(it.verificar)}</p>
        <div class="seg sit" role="radiogroup" aria-label="Situação">${L.situacao.map(o => {
          const c = o.split(' ')[0];
          return `<button data-sit="${h(o)}" class="s${c} ${sit === o ? 'on' : ''}" title="${h(o)}" ${dis}>${c}</button>`;
        }).join('')}</div>
        ${sit ? `<div class="aval-txt">${h(sit)}${sit.startsWith('C ') ? ' — conta como alerta crítico' : ''}</div>` : ''}
        <textarea data-f="obs" rows="2" placeholder="Observação" ${dis}>${h(v.obs)}</textarea>
        <label class="alerta-tg"><input type="checkbox" data-f="alerta" ${v.alerta === 'Sim' ? 'checked' : ''} ${dis}> Alerta crítico?</label>
        ${blocoFotos(e, k, dis)}
      </article>`;
    }

    const tq = textoQuesito(it);
    const calc = Calc.ehCalculado(b, it);
    const nota = calc ? Calc.notaCalculada(s, b, it) : Calc.notaDe(v.a);
    const cab = `<div class="item-h"><span class="cod">${h(it.codigo)}</span><span class="ind">${h(it.indicador || (it.sub ? 'Sub-quesito' : ''))}</span>
        <span class="nota ${corNota(nota)}" title="Nota">${nota === null ? '–' : (calc ? num1(nota) : nota)}</span></div>`;
    const textos = `
      ${tq.pergunta ? `<p class="perg">${nl(tq.pergunta)}${tq.custom ? ` <button class="lnk" data-editq="${h(it.codigo)}">✎</button>` : ''}</p>`
        : `<p class="perg vazio">Pergunta de avaliação não consta na planilha. <button class="lnk" data-editq="${h(it.codigo)}">✎ Incluir texto</button></p>`}
      ${tq.observar ? `<details class="obsv"><summary>O que observar</summary><p>${nl(tq.observar)}</p></details>` : ''}`;

    if (calc) {
      const subs = Calc.subsDe(b, it).map(x => x.codigo);
      return `<article class="item calc" data-k="${h(k)}" data-bi="${e.blocos.indexOf(b)}" id="${domId}">${cab}${textos}
        <div class="aval-txt">Nota calculada automaticamente pela média de ${h(subs.join(', '))}${nota !== null ? ' — ' + h(Calc.classificacaoDe(nota)) : ''}.</div>
        <textarea data-f="obs" rows="2" placeholder="Observação / fragilidade" ${dis}>${h(v.obs)}</textarea>
        ${blocoFotos(e, k, dis)}
      </article>`;
    }

    const a = v.a || '';
    return `<article class="item ${a ? 'resp' : ''} ${v.alerta === 'Sim' ? 'com-alerta' : ''}" data-k="${h(k)}" data-bi="${e.blocos.indexOf(b)}" id="${domId}">${cab}${textos}
      <div class="seg aval" role="radiogroup" aria-label="Avaliação">${L.avaliacao.map(o => {
        const c = o.split(' ')[0];
        return `<button data-aval="${h(o)}" class="a${c.replace('/', '')} ${a === o ? 'on' : ''}" title="${h(o)}" ${dis}>${h(c)}</button>`;
      }).join('')}</div>
      ${a ? `<div class="aval-txt">${h(a)}${Calc.notaDe(a) !== null ? ' · Nota ' + Calc.notaDe(a) : ''}</div>` : ''}
      <textarea data-f="obs" rows="2" placeholder="Observação / fragilidade" ${dis}>${h(v.obs)}</textarea>
      <div class="linha2">
        <label>Prioridade sugerida
          <select data-f="prio" ${dis}><option value=""></option>${L.prioridade.map(o => `<option ${v.prio === o ? 'selected' : ''}>${h(o)}</option>`).join('')}</select>
        </label>
        <label class="alerta-tg"><input type="checkbox" data-f="alerta" ${v.alerta === 'Sim' ? 'checked' : ''} ${dis}> Alerta crítico?</label>
      </div>
      ${blocoFotos(e, k, dis)}
    </article>`;
  }

  function fechamentoHTML(e) {
    const s = st(e.num);
    const r = Calc.resumoEstacao(e, s);
    const pRes = r.blocos.filter(x => x.res.tipo === 'P' && x.res.ativo);
    const autoP = !r.temP ? 'Não se aplica (sem P01–P09)' : `${pct(r.coberturaP)} dos quesitos avaliados`;
    const autoV = !r.temVip ? 'Não se aplica' : `${pct(r.coberturaVip)} dos itens ViP avaliados`;
    const opts = (val) => ['', 'Sim', 'Parcial', 'Não', 'Não se aplica'].map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('');
    const sug = (cob, tem) => !tem ? 'Não se aplica' : cob >= 1 ? 'Sim' : cob > 0 ? 'Parcial' : 'Não';
    return `
      <div class="grid2">
        <label>Verificado P01–P09 <small>(${h(autoP)})</small>
          <select data-fech="verP">${opts(s.fech.verP || '')}</select>
          ${!s.fech.verP ? `<button type="button" class="lnk" data-fsug="verP" data-v="${sug(r.coberturaP || 0, r.temP && pRes.length)}">Usar sugestão: ${sug(r.coberturaP || 0, r.temP && pRes.length)}</button>` : ''}
        </label>
        <label>Verificado ViP <small>(${h(autoV)})</small>
          <select data-fech="verV">${opts(s.fech.verV || '')}</select>
          ${!s.fech.verV ? `<button type="button" class="lnk" data-fsug="verV" data-v="${sug(r.coberturaVip || 0, r.temVip)}">Usar sugestão: ${sug(r.coberturaVip || 0, r.temVip)}</button>` : ''}
        </label>
      </div>
      <label>Observações gerais da estação<textarea data-fech="obs" rows="3">${h(s.fech.obs)}</textarea></label>
      <label>Pendências / retornar<textarea data-fech="pend" rows="2">${h(s.fech.pend)}</textarea></label>
      <label>Fotos da estação (faixa de numeração)<input type="text" readonly value="${h(faixaFotos(e.num) || 'Nenhuma foto registrada')}"></label>
      <div class="assin">
        <span>Assinatura do vistoriador</span>
        <canvas id="assinCanvas" width="600" height="180" aria-label="Área de assinatura"></canvas>
        <div class="linha2">
          <input type="text" data-fech="assinNome" placeholder="Nome do vistoriador" value="${h(s.fech.assinNome || s.ident.vistoriador || S.cfg.vistoriadorPadrao)}">
          <button type="button" class="btn sec sm" data-act="limparAssin">Limpar assinatura</button>
        </div>
      </div>`;
  }

  function iniciarAssinatura(num) {
    const c = $('#assinCanvas'); if (!c) return;
    const ctx = c.getContext('2d');
    const s = st(num);
    const fundo = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = '#ccd'; ctx.beginPath(); ctx.moveTo(20, c.height - 35); ctx.lineTo(c.width - 20, c.height - 35); ctx.stroke(); };
    fundo();
    if (s.fech.assin) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, c.width, c.height); im.src = s.fech.assin; }
    let des = false, ult = null;
    const pos = ev => { const r = c.getBoundingClientRect(); return [(ev.clientX - r.left) * c.width / r.width, (ev.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', ev => { des = true; ult = pos(ev); c.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    c.addEventListener('pointermove', ev => {
      if (!des) return; const p = pos(ev);
      ctx.strokeStyle = '#102a5c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ult[0], ult[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ult = p;
    });
    const fim = () => { if (!des) return; des = false; s.fech.assin = c.toDataURL('image/png'); if (!s.fech.assinNome) s.fech.assinNome = s.ident.vistoriador || S.cfg.vistoriadorPadrao; salvarEst(num); };
    c.addEventListener('pointerup', fim); c.addEventListener('pointercancel', fim);
    c._limpar = () => { fundo(); s.fech.assin = ''; salvarEst(num); };
  }

  /* --------------------------------------------- atualização parcial da tela */
  function numAtual() { const m = location.hash.match(/^#\/e\/(\d+)/); return m ? +m[1] : null; }

  function atualizarItem(num, k) {
    const e = porNum[num];
    const card = $(`.item[data-k="${CSS.escape(k)}"]`);
    if (!card) return;
    const bi = +card.dataset.bi;
    const b = e.blocos[bi];
    const it = b.itens.find(x => Calc.chave(b, x) === k);
    const temp = document.createElement('div');
    temp.innerHTML = itemHTML(e, b, it, Calc.blocoAtivo(st(num), b));
    card.replaceWith(temp.firstElementChild);
    // item agregador (ex.: P03.1) depende dos sub-quesitos
    if (it.sub) b.itens.filter(x => Calc.ehCalculado(b, x) && it.codigo.startsWith(x.codigo)).forEach(x => atualizarItem(num, Calc.chave(b, x)));
    atualizarResumos(num, bi);
  }
  function atualizarResumos(num, bi) {
    const e = porNum[num];
    if (bi !== undefined) { const el = $('#bs' + bi); if (el) el.innerHTML = resumoBlocoHTML(e, e.blocos[bi]); }
    const t = $('#estSum'); if (t) t.innerHTML = resumoTopoEst(e);
  }
  function atualizarBloco(num, bi) {
    const e = porNum[num];
    const el = $('#b' + bi);
    const temp = document.createElement('div');
    temp.innerHTML = blocoHTML(e, e.blocos[bi], bi);
    el.replaceWith(temp.firstElementChild);
    atualizarResumos(num);
  }
  function atualizarFotosEst(num, k) {
    if (k) atualizarItem(num, k);
    const geral = $('.acoes-foto');
    if (geral) {
      geral.querySelector('small').textContent = 'Fotos da estação: ' + (faixaFotos(num) || 'nenhuma');
      if (!k) { const row = geral.querySelector('.fotos-row'); $$('.thumb', row).forEach(t => t.remove()); row.insertAdjacentHTML('afterbegin', miniaturas(num, '')); }
    }
    const fx = $('#fech input[readonly]'); if (fx) fx.value = faixaFotos(num) || 'Nenhuma foto registrada';
  }

  function marcarInicio(num) {
    const s = st(num);
    let mud = false;
    if (!s.ident.data) { s.ident.data = hoje(); mud = true; }
    if (!s.ident.inicio) { s.ident.inicio = agora(); mud = true; }
    if (!s.ident.vistoriador && S.cfg.vistoriadorPadrao) { s.ident.vistoriador = S.cfg.vistoriadorPadrao; mud = true; }
    if (!s.ident.acompanhante && S.cfg.acompanhantePadrao) { s.ident.acompanhante = S.cfg.acompanhantePadrao; mud = true; }
    if (mud) ['data', 'inicio', 'vistoriador', 'acompanhante'].forEach(f => { const i = $(`[data-id="${f}"]`); if (i) i.value = s.ident[f]; });
  }

  /* ------------------------------------------------------ eventos da tela */
  view.addEventListener('click', async ev => {
    const t = ev.target.closest('button, [data-foto]');
    if (!t) return;
    const num = numAtual();

    if (t.dataset.pav) { S.cfg.filtroPav = t.dataset.pav; salvarCfg(); return telaLista(); }

    if (t.dataset.aval && num) {
      const k = t.closest('.item').dataset.k; const s = st(num);
      const v = s.r[k] ||= {};
      v.a = v.a === t.dataset.aval ? '' : t.dataset.aval;
      if (!v.prio || v.prioAuto) { const n = Calc.notaDe(v.a); v.prio = n === null ? (v.a.startsWith('N/A') ? '—' : '') : Calc.prioridadeDe(n); v.prioAuto = true; }
      marcarInicio(num); salvarEst(num); return atualizarItem(num, k);
    }
    if (t.dataset.sit && num) {
      const k = t.closest('.item').dataset.k; const s = st(num);
      const v = s.r[k] ||= {};
      v.s = v.s === t.dataset.sit ? '' : t.dataset.sit;
      if (v.s.startsWith('C ') && !v.alerta) { v.alerta = 'Sim'; v.alertaAuto = true; }
      else if (!v.s.startsWith('C ') && v.alertaAuto) { v.alerta = ''; v.alertaAuto = false; }
      marcarInicio(num); salvarEst(num); return atualizarItem(num, k);
    }
    if (t.dataset.cond && num) {
      const bi = +t.dataset.bi; const b = porNum[num].blocos[bi]; const s = st(num);
      s.cond[b.codigo] = s.cond[b.codigo] === t.dataset.cond ? '' : t.dataset.cond;
      marcarInicio(num); salvarEst(num); return atualizarBloco(num, bi);
    }
    if (t.dataset.agora && num) {
      const s = st(num); s.ident[t.dataset.agora] = agora();
      if (!s.ident.data) s.ident.data = hoje();
      $(`[data-id="${t.dataset.agora}"]`).value = s.ident[t.dataset.agora];
      $('[data-id="data"]').value = s.ident.data;
      return salvarEst(num);
    }
    if (t.dataset.fsug && num) {
      st(num).fech[t.dataset.fsug] = t.dataset.v; salvarEst(num);
      $('#fech').innerHTML = fechamentoHTML(porNum[num]); return iniciarAssinatura(num);
    }
    if (t.dataset.editq) return editarQuesito(t.dataset.editq);
    if (t.dataset.foto) return abrirFoto(t.dataset.foto);

    const act = t.dataset.act;
    if ((act === 'cam' || act === 'gal') && num) {
      S.alvoFoto = { num, k: t.dataset.k || '' };
      const inp = act === 'cam' ? $('#inCamera') : $('#inGaleria');
      inp.value = ''; inp.click(); return;
    }
    if (act === 'limparAssin') { const c = $('#assinCanvas'); if (c && c._limpar) c._limpar(); return; }
    if (act === 'pendente' && num) return irPendente(num);
  });

  view.addEventListener('input', ev => {
    const t = ev.target; const num = numAtual(); if (!num) return;
    const s = st(num);
    if (t.dataset.id) { s.ident[t.dataset.id] = t.value; return salvarEst(num); }
    if (t.dataset.f === 'obs') { const k = t.closest('.item').dataset.k; (s.r[k] ||= {}).obs = t.value; return salvarEst(num); }
    if (t.dataset.campo === 'anot') { s.anot = t.value; marcarInicio(num); return salvarEst(num); }
    if (t.dataset.fech && t.tagName !== 'SELECT') { s.fech[t.dataset.fech] = t.value; return salvarEst(num); }
  });
  view.addEventListener('change', ev => {
    const t = ev.target; const num = numAtual(); if (!num) return;
    const s = st(num);
    if (t.dataset.f === 'prio') { const k = t.closest('.item').dataset.k; const v = s.r[k] ||= {}; v.prio = t.value; v.prioAuto = false; return salvarEst(num); }
    if (t.dataset.f === 'alerta') {
      const k = t.closest('.item').dataset.k; const v = s.r[k] ||= {};
      v.alerta = t.checked ? 'Sim' : 'Não'; v.alertaAuto = false;
      salvarEst(num); return atualizarItem(num, k);
    }
    if (t.dataset.fech && t.tagName === 'SELECT') { s.fech[t.dataset.fech] = t.value; salvarEst(num); $('#fech').innerHTML = fechamentoHTML(porNum[num]); return iniciarAssinatura(num); }
  });

  function irPendente(num) {
    const e = porNum[num]; const s = st(num);
    for (const [bi, b] of e.blocos.entries()) {
      if (b.condicional && !s.cond[b.codigo]) { const el = $('#b' + bi); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return pisca(el); }
      if (!Calc.blocoAtivo(s, b)) continue;
      for (const it of b.itens) {
        if (b.tipo === 'P' && Calc.ehCalculado(b, it)) continue;
        const v = s.r[Calc.chave(b, it)] || {};
        if (!(b.tipo === 'P' ? v.a : v.s)) {
          const el = $(`.item[data-k="${CSS.escape(Calc.chave(b, it))}"]`);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return pisca(el);
        }
      }
    }
    toast('Nenhum item pendente nesta estação ✔');
  }
  function pisca(el) { el.classList.remove('destaque'); void el.offsetWidth; el.classList.add('destaque'); }

  /* ================================================================ FOTOS */
  async function receberArquivos(files) {
    const alvo = S.alvoFoto; if (!alvo || !files.length) return;
    const e = porNum[alvo.num];
    let codItem = 'Geral do local';
    if (alvo.k) codItem = alvo.k.split('|')[1];
    for (const file of files) {
      let n = S.cfg.proxFoto;
      while (S.fotos.some(f => f.num === n)) n++;
      S.cfg.proxFoto = n + 1; await salvarCfg();
      const id = Fotos.nomeArquivo(alvo.num, n);
      toast(`Processando foto ${Fotos.pad(n, 3)}…`, 8000);
      try {
        const ts = Date.now();
        const proc = await Fotos.processar(file, {
          maxLado: S.cfg.maxLado, qualidade: S.cfg.qualidade,
          carimbo: S.cfg.carimbo ? [`${id} · ${codItem}`, `Estação ${pad2(alvo.num)} — ${e.ambiente} · ${dataHoraBR(ts)}`] : null
        });
        const reg = { id, num: n, estacao: alvo.num, chave: alvo.k, legenda: '', ts, blob: proc.blob, thumb: proc.thumb, largura: proc.largura, altura: proc.altura, nomeOriginal: file.name || '' };
        await DB.put('fotos', reg);
        S.fotos.push(reg);
        marcarInicio(alvo.num); salvarEst(alvo.num);
        toast(`Foto ${Fotos.pad(n, 3)} salva (${id})`);
        if (numAtual() === alvo.num) atualizarFotosEst(alvo.num, alvo.k);
      } catch (err) { toast('Não foi possível processar a imagem: ' + err.message, 5000); }
    }
  }
  $('#inCamera').addEventListener('change', ev => receberArquivos(Array.from(ev.target.files)));
  $('#inGaleria').addEventListener('change', ev => receberArquivos(Array.from(ev.target.files)));

  function nomeItem(num, k) {
    if (!k) return 'Geral do local';
    const [bc, ic] = k.split('|');
    const b = porNum[num].blocos.find(x => x.codigo === bc);
    const it = b && b.itens.find(x => x.codigo === ic);
    return it ? `${ic} — ${it.indicador || it.item || (it.pergunta || '').slice(0, 60)}` : ic;
  }

  function abrirModal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-box">${html}</div>`; m.hidden = false; document.body.classList.add('sem-scroll'); return m; }
  function fecharModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; document.body.classList.remove('sem-scroll'); }
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal' || ev.target.closest('[data-fechar]')) fecharModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

  function abrirFoto(id) {
    const f = S.fotos.find(x => x.id === id); if (!f) return;
    const e = porNum[f.estacao];
    const url = URL.createObjectURL(f.blob);
    const opcoes = [['', 'Geral do local']].concat(e.blocos.flatMap(b => b.itens.map(it => [Calc.chave(b, it), nomeItem(e.num, Calc.chave(b, it))])));
    const m = abrirModal(`
      <div class="foto-view"><img src="${url}" alt="${h(id)}"></div>
      <div class="foto-meta">
        <h3>${h(id)}</h3>
        <p>Estação ${pad2(e.num)} — ${h(e.ambiente)}<br>${dataHoraBR(f.ts)} · ${f.largura}×${f.altura}px</p>
        <label>Item vinculado<select id="fItem">${opcoes.map(([k, t]) => `<option value="${h(k)}" ${k === f.chave ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></label>
        <label>Legenda / descrição<textarea id="fLeg" rows="2">${h(f.legenda)}</textarea></label>
        <div class="linha2">
          <a class="btn sec sm" href="${url}" download="${h(id)}.jpg">Baixar</a>
          <button class="btn perigo sm" id="fDel">Excluir</button>
          <button class="btn sm" id="fOk">Salvar</button>
        </div>
      </div>`);
    const fechar = () => { URL.revokeObjectURL(url); fecharModal(); };
    m.querySelector('#fOk').onclick = async () => {
      const antiga = f.chave;
      f.legenda = m.querySelector('#fLeg').value; f.chave = m.querySelector('#fItem').value;
      await DB.put('fotos', f); fechar(); toast('Foto atualizada');
      if (numAtual() === f.estacao) { atualizarFotosEst(f.estacao, antiga); if (antiga !== f.chave) atualizarFotosEst(f.estacao, f.chave); if (!antiga || !f.chave) telaEstacao(f.estacao); }
      else if (location.hash.startsWith('#/fotos')) rota();
    };
    m.querySelector('#fDel').onclick = async () => {
      if (!confirm(`Excluir a foto ${id}? A numeração das demais fotos não será alterada.`)) return;
      await DB.del('fotos', f.id);
      S.fotos = S.fotos.filter(x => x.id !== f.id);
      if (S.thumbs.has(f.id)) { URL.revokeObjectURL(S.thumbs.get(f.id)); S.thumbs.delete(f.id); }
      fechar(); toast('Foto excluída');
      if (numAtual() === f.estacao) telaEstacao(f.estacao); else rota();
    };
  }

  function telaFotos(filtro) {
    topo('Fotos', `${S.fotos.length} foto(s) registrada(s)`);
    abaAtiva('fotos');
    const grupos = EST.filter(e => !filtro || e.num === filtro).map(e => ({ e, fs: fotosDe(e.num) })).filter(g => g.fs.length);
    view.innerHTML = `
      <div class="toolbar">
        <select id="filtroFotos"><option value="">Todas as estações</option>${EST.map(e => `<option value="${e.num}" ${filtro === e.num ? 'selected' : ''}>${pad2(e.num)} — ${h(e.ambiente)}</option>`).join('')}</select>
      </div>
      <p class="dica">Nomenclatura: JFAP_L&lt;estação&gt;_F&lt;nº da foto&gt; — numeração única e crescente para todo o prédio. Próxima foto: <b>${Fotos.pad(S.cfg.proxFoto, 3)}</b>.</p>
      ${grupos.length ? grupos.map(({ e, fs }) => `
        <section class="card">
          <h3><a href="#/e/${e.num}">Estação ${pad2(e.num)} — ${h(e.ambiente)}</a> <small>(${fs.length})</small></h3>
          <div class="galeria">${fs.map(f => `<button class="gthumb" data-foto="${h(f.id)}"><img src="${thumbURL(f)}" alt="" loading="lazy"><span>${Fotos.pad(f.num, 3)} · ${h(f.chave ? f.chave.split('|')[1] : 'Geral')}</span></button>`).join('')}</div>
        </section>`).join('') : `<div class="vazio-grande">Nenhuma foto ainda. Abra uma estação e toque em 📷 em qualquer item.</div>`}`;
    $('#filtroFotos').addEventListener('change', ev => { location.hash = ev.target.value ? '#/fotos/' + ev.target.value : '#/fotos'; });
  }

  /* =============================================================== RESUMO */
  function telaResumo() {
    topo('Resumo', 'Resultados por estação (P01–P09 e ViP)');
    abaAtiva('resumo');
    const rs = EST.map(e => ({ e, r: Calc.resumoEstacao(e, st(e.num)) }));
    const medias = rs.map(x => x.r.mediaGeral).filter(m => m !== null);
    const mg = Calc.media(medias);
    const alertas = rs.reduce((a, x) => a + x.r.alertas, 0);
    const vipC = rs.reduce((a, x) => { Object.keys(a).forEach(k => { a[k] += x.r.vip.cont[k]; }); return a; }, { B: 0, R: 0, C: 0, NA: 0, NI: 0 });

    // média por parâmetro em todo o prédio
    const porParam = {};
    rs.forEach(({ e, r }) => r.blocos.forEach(({ bloco, res }) => {
      if (res.tipo !== 'P' || !res.ativo || res.media === null) return;
      (porParam[bloco.codigo] ||= []).push(res.media);
    }));
    const nomeParam = Object.fromEntries(D.parametros.map(p => [p.codigo, p.nome]));

    // alertas críticos
    const listaAlertas = [];
    rs.forEach(({ e }) => {
      const s = st(e.num);
      e.blocos.forEach((b, bi) => {
        if (!Calc.blocoAtivo(s, b)) return;
        b.itens.forEach(it => {
          const k = Calc.chave(b, it); const v = s.r[k]; if (!v) return;
          if (v.alerta === 'Sim' || (b.tipo === 'ViP' && (v.s || '').startsWith('C '))) listaAlertas.push({ e, b, it, v, k });
        });
      });
    });
    const pend = rs.filter(({ e }) => (st(e.num).fech.pend || '').trim());

    view.innerHTML = `
      <section class="kpis">
        <div class="kpi"><b>${rs.filter(x => x.r.status === 'ok').length}<small>/${EST.length}</small></b><span>concluídas</span></div>
        <div class="kpi ${corNota(mg)}"><b>${num1(mg)}</b><span>média geral P</span></div>
        <div class="kpi ${alertas ? 'alerta' : ''}"><b>${alertas}</b><span>alertas críticos</span></div>
        <div class="kpi"><b>${vipC.C}</b><span>itens ViP críticos</span></div>
      </section>

      <section class="card">
        <h3>Média por parâmetro (todo o prédio)</h3>
        ${Object.keys(porParam).length ? `<div class="barras">${Object.keys(porParam).sort().map(c => {
          const m = Calc.media(porParam[c]);
          return `<div class="bl"><span title="${h(nomeParam[c])}">${h(nomeParam[c] || c)}</span><span class="bt"><i class="${corNota(m)}" style="width:${m / 5 * 100}%"></i></span><b>${num1(m)}</b></div>`;
        }).join('')}</div><p class="dica">Escala 1 a 5 · média das médias de cada estação · ${Object.values(porParam).reduce((a, x) => a + x.length, 0)} bloco(s) avaliado(s).</p>` : '<p class="dica">Sem notas registradas ainda.</p>'}
      </section>

      <section class="card">
        <h3>Situação ViP (todo o prédio)</h3>
        <div class="tags"><em class="tag n5">B — Bom: ${vipC.B}</em><em class="tag n3">R — Regular: ${vipC.R}</em><em class="tag n1">C — Crítico: ${vipC.C}</em><em class="tag">NA: ${vipC.NA}</em><em class="tag">NI: ${vipC.NI}</em><em class="tag">Pontos: ${vipC.R * 2 + vipC.C * 5}</em></div>
        <p class="dica">Pontuação ViP conforme LEGENDA_VIP: B = 0, R = 2, C = 5 pontos.</p>
      </section>

      <section class="card">
        <h3>Resultados por estação</h3>
        <div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Estação</th><th>Quesitos P</th><th>Cobertura</th><th>Média</th><th>Alertas</th><th>Prioridade</th></tr></thead>
          <tbody>${rs.map(({ e, r }) => `
            <tr class="linha-est" data-tog="${e.num}"><td><a href="#/e/${e.num}">${pad2(e.num)}</a> ${h(e.ambiente)}</td>
              <td>${r.blocos.filter(x => x.res.tipo === 'P').length}</td><td>${r.temP ? pct(r.coberturaP) : '—'}</td>
              <td class="${corNota(r.mediaGeral)}">${num1(r.mediaGeral)}</td><td>${r.alertas || ''}</td>
              <td><span class="tag ${corPrio(r.prioridade)}">${h(r.prioridade || '—')}</span></td></tr>
            ${r.blocos.map(({ bloco, res }) => `<tr class="sub" data-de="${e.num}" hidden><td>↳ ${h(bloco.tipo === 'P' ? bloco.titulo.split(' (')[0] : bloco.titulo)}</td>
              <td>${res.tipo}</td><td>${res.ativo ? pct(res.cobertura) : 'n/p'}</td>
              <td>${res.tipo === 'P' ? num1(res.media) : `B${res.cont.B}/R${res.cont.R}/C${res.cont.C}`}</td><td>${res.alertas || ''}</td>
              <td>${res.tipo === 'P' ? h(res.ativo ? res.prioridade || '—' : 'Não pontuado') : 'Pontos ' + res.pontos}</td></tr>`).join('')}`).join('')}
          </tbody></table></div>
        <p class="dica">Toque na linha para ver o detalhamento por bloco. Prioridade: ≥4,5 Manter · ≥3,5 Melhoria pontual · ≥2,5 Programar melhoria · &lt;2,5 Intervenção prioritária. Um alerta crítico prevalece sobre a média.</p>
      </section>

      <section class="card">
        <h3>Alertas críticos (${listaAlertas.length})</h3>
        ${listaAlertas.length ? `<ul class="lista-alertas">${listaAlertas.map(({ e, b, it, v, k }) => `<li><a href="#/e/${e.num}/i-${k.replace(/[^A-Za-z0-9]/g, '_')}"><b>${pad2(e.num)} · ${h(it.codigo)}</b> ${h(it.indicador || it.item || '')}</a>
          ${v.s ? `<em class="tag n1">${h(v.s)}</em>` : ''}${v.a ? `<em class="tag">${h(v.a)}</em>` : ''}${v.obs ? `<br><small>${h(v.obs)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="dica">Nenhum alerta crítico registrado.</p>'}
      </section>

      <section class="card">
        <h3>Pendências / retornar (${pend.length})</h3>
        ${pend.length ? `<ul class="lista-alertas">${pend.map(({ e }) => `<li><a href="#/e/${e.num}"><b>${pad2(e.num)}</b> ${h(e.ambiente)}</a><br><small>${nl(st(e.num).fech.pend)}</small></li>`).join('')}</ul>` : '<p class="dica">Nenhuma pendência registrada.</p>'}
      </section>`;

    $$('.linha-est').forEach(tr => tr.addEventListener('click', ev => {
      if (ev.target.closest('a')) return;
      $$(`tr[data-de="${tr.dataset.tog}"]`).forEach(x => { x.hidden = !x.hidden; });
      tr.classList.toggle('aberta');
    }));
  }

  /* ========================================================= MAIS / REFERÊNCIA */
  function telaMais() {
    topo('Mais', 'Referência e configurações');
    abaAtiva('mais');
    view.innerHTML = `
      <nav class="menu">
        <a href="#/ref/leiame"><b>Instruções de uso (LEIA-ME)</b><small>Percurso, escala, legenda das colunas, registro de fotos</small></a>
        <a href="#/ref/indice"><b>Índice das estações</b><small>Pavimento, tipo de verificação, parâmetros e ViP por estação</small></a>
        <a href="#/ref/parametros"><b>Legenda — Parâmetros P01–P09 e escala</b><small>LEGENDA_PARAMETROS</small></a>
        <a href="#/ref/vip"><b>Legenda — Itens ViP por tipologia</b><small>LEGENDA_VIP</small></a>
        <a href="#/ref/metodo"><b>Método e decisões</b><small>METODO_E_DECISOES</small></a>
        <a href="#/quesitos"><b>Textos dos quesitos P02–P09</b><small>Completar perguntas ausentes na planilha</small></a>
        <a href="#/config"><b>Configurações</b><small>Vistoriador padrão, fotos, numeração, dados</small></a>
      </nav>
      <p class="dica">Fonte: ${h(D.fonte)} · ${EST.length} estações · ${EST.reduce((a, e) => a + e.blocos.reduce((x, b) => x + b.itens.length, 0), 0)} itens. Os dados ficam salvos somente neste dispositivo — exporte backups com frequência.</p>`;
  }

  function telaRef(qual) {
    abaAtiva('mais');
    if (qual === 'leiame') {
      topo('Instruções', 'LEIA-ME', true);
      view.innerHTML = `<section class="card ref"><h2>${h(D.leiame.titulo)}</h2><p>${h(D.leiame.orgao)}<br>${h(D.leiame.endereco)}</p>
        ${D.leiame.secoes.map(s => `<h3>${h(s.titulo)}</h3><p>${nl(s.texto)}</p>`).join('')}
        <h3>No aplicativo</h3><p>• As fotos são tiradas pelo botão 📷 de cada item (ou “Fotos gerais do local”), numeradas automaticamente em sequência única (001, 002…) e nomeadas no padrão JFAP_L&lt;estação&gt;_F&lt;foto&gt;. A coluna “Fotos / Evidências (nº)” é preenchida sozinha.<br>• A nota é calculada a partir da avaliação; a prioridade sugerida é preenchida automaticamente e pode ser alterada.<br>• Na exportação Excel, a planilha original é preenchida e as fotos são inseridas na aba FOTOS.</p></section>`;
    } else if (qual === 'indice') {
      topo('Índice das estações', D.titulo ? 'ÍNDICE' : '', true);
      view.innerHTML = `<section class="card ref"><h3>${h(D.titulo)}</h3><div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nº</th><th>Pavimento/Área</th><th>Ambiente/Conjunto</th><th>Tipo</th><th>Parâmetros aplicáveis</th><th>Itens ViP aplicáveis</th><th>Nº quesitos</th><th>Status</th></tr></thead>
        <tbody>${EST.map(e => { const r = Calc.resumoEstacao(e, st(e.num)); return `<tr><td><a href="#/e/${e.num}">${e.num}</a></td><td>${h(e.pavimento)}</td><td>${h(e.ambiente)}</td><td>${h(e.tipoVerificacao)}</td><td>${h(e.parametrosAplicaveis)}</td><td>${h(e.vipAplicaveis)}</td><td>${h(e.nQuesitos)}</td><td><span class="tag s-${r.status}">${STATUS_TXT[r.status]}</span></td></tr>`; }).join('')}
        <tr><td colspan="6" style="text-align:right"><b>Total de quesitos:</b></td><td><b>${EST.reduce((a, e) => a + (e.nQuesitos || 0), 0)}</b></td><td></td></tr></tbody></table></div></section>`;
    } else if (qual === 'parametros') {
      topo('Legenda — Parâmetros', 'P01–P09 e escala de notas', true);
      view.innerHTML = `<section class="card ref"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Código</th><th>Nome completo do parâmetro</th><th>Aplicação</th></tr></thead>
        <tbody>${D.parametros.map(p => `<tr><td>${h(p.codigo)}</td><td>${h(p.nome)}</td><td>${h(p.aplicacao)}</td></tr>`).join('')}</tbody></table></div>
        <h3>Escala de notas</h3><div class="tabela-wrap"><table class="tabela"><tbody>${D.escala.map(x => `<tr><td class="${/^\d$/.test(x.valor) ? 'n' + x.valor : ''}"><b>${h(x.valor)}</b></td><td>${h(x.descricao)}</td></tr>`).join('')}</tbody></table></div></section>`;
    } else if (qual === 'vip') {
      topo('Legenda — ViP', 'Itens por tipologia', true);
      const tips = [...new Set(D.vip.itens.map(i => i.tipologia))];
      view.innerHTML = `<section class="card ref"><p>${h(D.vip.escala)}</p>${tips.map(t => `<h3>${h(t)}</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Código</th><th>Item a verificar</th><th>O que verificar</th></tr></thead><tbody>${D.vip.itens.filter(i => i.tipologia === t).map(i => `<tr><td>${h(i.codigo)}</td><td>${h(i.item)}</td><td>${h(i.verificar)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</section>`;
    } else if (qual === 'metodo') {
      topo('Método e decisões', 'METODO_E_DECISOES', true);
      view.innerHTML = `<section class="card ref"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Tema</th><th>Decisão / referência</th></tr></thead><tbody>${D.metodo.map(m => `<tr><td><b>${h(m.tema)}</b></td><td>${h(m.decisao)}</td></tr>`).join('')}</tbody></table></div></section>`;
    } else location.hash = '#/mais';
  }

  function codigosSemTexto() {
    const m = new Map();
    EST.forEach(e => e.blocos.forEach(b => { if (b.tipo === 'P') b.itens.forEach(it => { if (!it.pergunta && !m.has(it.codigo)) m.set(it.codigo, it.indicador); }); }));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true }));
  }

  function telaQuesitos() {
    topo('Textos dos quesitos', 'P02–P09', true);
    abaAtiva('mais');
    const cods = codigosSemTexto();
    view.innerHTML = `<div class="aviso">Na planilha REV2, as colunas “Pergunta de avaliação” e “O que observar” dos parâmetros P02–P09 contêm fórmulas quebradas (referências a células inexistentes), por isso os textos oficiais não aparecem. Cole aqui os textos do formulário oficial: eles serão exibidos em todas as estações e gravados na planilha exportada.</div>
      ${cods.map(([c, ind]) => { const t = S.cfg.textos[c] || {}; return `<section class="card"><h3>${h(c)} — ${h(ind)}</h3>
        <label>Pergunta de avaliação<textarea data-tq="${h(c)}" data-campo-q="pergunta" rows="3">${h(t.pergunta)}</textarea></label>
        <label>O que observar<textarea data-tq="${h(c)}" data-campo-q="observar" rows="3">${h(t.observar)}</textarea></label></section>`; }).join('')}`;
    let tm;
    view.oninput = ev => {
      const t = ev.target; if (!t.dataset.tq) return;
      (S.cfg.textos[t.dataset.tq] ||= {})[t.dataset.campoQ] = t.value;
      clearTimeout(tm); tm = setTimeout(() => { salvarCfg(); indicador('ok'); }, 400); indicador('pendente');
    };
  }

  function editarQuesito(cod) {
    const ind = (codigosSemTexto().find(x => x[0] === cod) || [])[1] || '';
    const t = S.cfg.textos[cod] || {};
    const m = abrirModal(`<h3>${h(cod)} — ${h(ind)}</h3>
      <p class="dica">Texto do formulário oficial (vale para todas as estações).</p>
      <label>Pergunta de avaliação<textarea id="qP" rows="4">${h(t.pergunta)}</textarea></label>
      <label>O que observar<textarea id="qO" rows="4">${h(t.observar)}</textarea></label>
      <div class="linha2"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" id="qOk">Salvar</button></div>`);
    m.querySelector('#qOk').onclick = async () => {
      S.cfg.textos[cod] = { pergunta: m.querySelector('#qP').value.trim(), observar: m.querySelector('#qO').value.trim() };
      await salvarCfg(); fecharModal(); rota();
    };
  }

  async function telaConfig() {
    topo('Configurações', '', true);
    abaAtiva('mais');
    const uso = await DB.uso();
    const c = S.cfg;
    view.innerHTML = `
      <section class="card">
        <h3>Equipe</h3>
        <label>Vistoriador padrão<input type="text" data-cfg="vistoriadorPadrao" value="${h(c.vistoriadorPadrao)}"></label>
        <label>Acompanhante padrão<input type="text" data-cfg="acompanhantePadrao" value="${h(c.acompanhantePadrao)}"></label>
        <p class="dica">Preenchidos automaticamente ao iniciar cada estação.</p>
      </section>
      <section class="card">
        <h3>Fotos</h3>
        <label class="alerta-tg"><input type="checkbox" data-cfg="carimbo" ${c.carimbo ? 'checked' : ''}> Gravar carimbo na foto (nome JFAP_Lxx_Fyyy, item, estação, data e hora)</label>
        <label>Resolução máxima<select data-cfg="maxLado">${[1280, 1600, 1920, 2560, 3264].map(v => `<option value="${v}" ${+c.maxLado === v ? 'selected' : ''}>${v}px</option>`).join('')}</select></label>
        <label>Qualidade JPEG<select data-cfg="qualidade">${[0.6, 0.7, 0.82, 0.9].map(v => `<option value="${v}" ${+c.qualidade === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
        <label>Próximo número de foto<input type="number" min="1" data-cfg="proxFoto" value="${c.proxFoto}"></label>
        <p class="dica">Útil para continuar uma sequência iniciada em outro aparelho. Números já usados são pulados automaticamente.</p>
      </section>
      <section class="card">
        <h3>Armazenamento</h3>
        <p>${uso ? `Em uso: ${(uso.usage / 1048576).toFixed(1)} MB de ${(uso.quota / 1048576).toFixed(0)} MB disponíveis.` : 'Informação indisponível neste navegador.'}</p>
        <button class="btn perigo" id="apagarTudo">Apagar todos os dados da vistoria</button>
      </section>`;
    view.onchange = async ev => {
      const t = ev.target; const k = t.dataset.cfg; if (!k) return;
      c[k] = t.type === 'checkbox' ? t.checked : (['maxLado', 'qualidade', 'proxFoto'].includes(k) ? +t.value : t.value);
      await salvarCfg(); toast('Configuração salva');
    };
    $('#apagarTudo').onclick = async () => {
      if (!confirm('Apagar TODAS as respostas e fotos deste dispositivo? Faça um backup antes.')) return;
      if (prompt('Digite APAGAR para confirmar') !== 'APAGAR') return;
      await DB.limpar('estacoes'); await DB.limpar('fotos');
      S.est = {}; S.fotos = []; S.thumbs.forEach(u => URL.revokeObjectURL(u)); S.thumbs.clear();
      S.cfg.proxFoto = 1; await salvarCfg();
      toast('Dados apagados'); location.hash = '#/';
    };
  }

  /* ============================================================ EXPORTAR (UI) */
  async function telaExportar() {
    topo('Exportar', 'Planilha, relatório, fotos e backup');
    abaAtiva('exportar');
    const uso = await DB.uso();
    view.innerHTML = `
      <section class="card exp">
        <h3>Planilha Excel preenchida (.xlsx)</h3>
        <p>Preenche a planilha original (mesmas abas, formatação, listas e fórmulas do RESUMO) com todas as respostas, notas, prioridades, alertas e números das fotos. As fotos vão para a aba <b>FOTOS</b>.</p>
        <label class="alerta-tg"><input type="checkbox" id="xFotos" checked> Incluir as fotos na planilha</label>
        <button class="btn" data-exp="xlsx">Gerar planilha</button>
      </section>
      <section class="card exp">
        <h3>Relatório de vistoria (PDF)</h3>
        <p>Relatório com resumo, resultados por estação, alertas, fechamento, assinatura e fotos. Use “Salvar como PDF” na janela de impressão.</p>
        <label class="alerta-tg"><input type="checkbox" id="rVazias"> Incluir estações não iniciadas</label>
        <button class="btn" data-exp="pdf">Gerar relatório</button>
      </section>
      <section class="card exp">
        <h3>Fotos (.zip)</h3>
        <p>Todas as fotos nomeadas no padrão JFAP_L&lt;estação&gt;_F&lt;foto&gt;.jpg, com índice CSV (estação, item, legenda, data/hora).</p>
        <button class="btn" data-exp="zip">Baixar fotos</button>
      </section>
      <section class="card exp">
        <h3>Pacote completo (.zip)</h3>
        <p>Planilha preenchida + fotos + backup do aplicativo, em um único arquivo.</p>
        <button class="btn" data-exp="pacote">Gerar pacote</button>
      </section>
      <section class="card exp">
        <h3>Backup e transferência</h3>
        <p>Salve um backup (.json com fotos) para não perder dados ou para continuar em outro aparelho.</p>
        <div class="linha2"><button class="btn" data-exp="backup">Salvar backup</button><button class="btn sec" data-exp="restaurar">Restaurar backup</button></div>
        <p class="dica">${uso ? `Armazenamento em uso: ${(uso.usage / 1048576).toFixed(1)} MB.` : ''}</p>
      </section>
      <div id="expStatus" class="dica"></div>`;
    view.onclick = async ev => {
      const b = ev.target.closest('[data-exp]'); if (!b) return;
      const tipo = b.dataset.exp;
      const status = $('#expStatus');
      const prog = msg => { status.textContent = msg; };
      $$('[data-exp]').forEach(x => { x.disabled = true; });
      try {
        flush();
        if (tipo === 'xlsx') await Export.xlsx({ fotos: $('#xFotos').checked, prog });
        if (tipo === 'pdf') await Export.relatorio({ vazias: $('#rVazias').checked, prog });
        if (tipo === 'zip') await Export.zipFotos({ prog });
        if (tipo === 'pacote') await Export.pacote({ prog });
        if (tipo === 'backup') await Export.backup({ prog });
        if (tipo === 'restaurar') { $('#inBackup').value = ''; $('#inBackup').click(); }
        if (tipo !== 'restaurar') prog('Concluído ✔');
      } catch (err) { console.error(err); prog('Erro: ' + err.message); toast('Erro: ' + err.message, 5000); }
      $$('[data-exp]').forEach(x => { x.disabled = false; });
    };
  }

  $('#inBackup').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (!confirm('Restaurar este backup substituirá as respostas e fotos atuais deste dispositivo. Continuar?')) return;
    try {
      const n = await Export.restaurar(f, msg => { const s = $('#expStatus'); if (s) s.textContent = msg; });
      await carregar();
      toast(`Backup restaurado: ${n} foto(s)`);
      location.hash = '#/';
    } catch (err) { toast('Backup inválido: ' + err.message, 5000); }
  });

  /* ============================================================ INICIALIZAÇÃO */
  async function carregar() {
    const [ests, fotos, cfg] = await Promise.all([DB.todos('estacoes'), DB.todos('fotos'), DB.get('config', 'cfg')]);
    S.est = {};
    ests.forEach(x => { S.est[x.num] = Object.assign(novoEstado(x.num), x); S.est[x.num].fech = Object.assign(novoEstado(0).fech, x.fech); });
    S.fotos = fotos;
    S.thumbs.forEach(u => URL.revokeObjectURL(u)); S.thumbs.clear();
    S.cfg = Object.assign({ ...CFG_PADRAO }, cfg || {});
    S.cfg.textos ||= {};
  }

  // API para o módulo de exportação
  window.App = { S, st, porNum, EST, D, fotosDe, faixaFotos, textoQuesito, nomeItem, dataBR, dataHoraBR, carregar, h, nl, pct, num1, pad2, STATUS_TXT, corNota, corPrio };

  (async () => {
    try {
      await carregar();
      DB.persistir();
      indicador('ok');
      rota();
    } catch (err) {
      view.innerHTML = `<div class="aviso">Não foi possível abrir o banco de dados local deste navegador (${h(err.message)}). Verifique se não está em modo privado.</div>`;
    }
  })();
})();
