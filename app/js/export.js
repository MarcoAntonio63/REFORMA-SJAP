/* Exportações: planilha original preenchida (ExcelJS), relatório para PDF,
   ZIP de fotos, pacote completo e backup/restauração (JSON). */
const Export = (() => {
  const A = () => window.App;
  const MODELO = 'modelo/Planilha_Unificada_Vistoria_JFAP_REV2.xlsx';

  const scripts = {};
  function carregarScript(src) {
    return scripts[src] ||= new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { delete scripts[src]; rej(new Error('Falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  const carimboData = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const nomesFotos = (num, k) => A().fotosDe(num, k).map(f => String(f.num).padStart(3, '0')).join(', ');

  /* ------------------------------------------------------------ Excel */
  async function gerarXlsx({ fotos = true, prog = () => {} } = {}) {
    const { EST, st, D, S, faixaFotos, textoQuesito, dataBR, dataHoraBR, nomeItem } = A();
    prog('Carregando biblioteca de planilhas…');
    await carregarScript('vendor/exceljs.min.js');
    prog('Lendo planilha modelo…');
    const buf = await (await fetch(MODELO)).arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    wb.calcProperties = Object.assign(wb.calcProperties || {}, { fullCalcOnLoad: true });

    const set = (ws, ref, v) => { if (v === undefined || v === null || v === '') return; ws.getCell(ref).value = v; };
    const eFormula = c => c.type === ExcelJS.ValueType.Formula || (c.value && typeof c.value === 'object' && 'formula' in c.value);

    for (const e of EST) {
      prog(`Preenchendo estação ${String(e.num).padStart(2, '0')}…`);
      const ws = wb.getWorksheet(e.aba); if (!ws) continue;
      const s = st(e.num);
      if (e.linhaIdent) {
        const r = e.linhaIdent;
        set(ws, 'A' + r, dataBR(s.ident.data)); set(ws, 'C' + r, s.ident.vistoriador); set(ws, 'E' + r, s.ident.acompanhante);
        set(ws, 'G' + r, s.ident.inicio); set(ws, 'I' + r, s.ident.termino);
      }
      if (e.linhaAnotacoes) set(ws, 'A' + e.linhaAnotacoes, s.anot);

      for (const b of e.blocos) {
        const ativo = Calc.blocoAtivo(s, b);
        if (b.condicional && s.cond[b.codigo]) {
          const c = ws.getCell('A' + b.linhaTitulo);
          c.value = `${b.titulo} — condição confirmada em campo: ${s.cond[b.codigo] === 'sim' ? 'SIM' : 'NÃO (bloco não pontuado)'}`;
        }
        for (const it of b.itens) {
          const r = it.linha; const k = Calc.chave(b, it); const v = s.r[k] || {};
          const nf = nomesFotos(e.num, k);
          if (b.tipo === 'ViP') {
            set(ws, 'D' + r, v.s); set(ws, 'E' + r, v.obs); set(ws, 'F' + r, v.alerta); set(ws, 'G' + r, nf);
            continue;
          }
          if (!it.sub) {
            const tq = textoQuesito(it);
            const cC = ws.getCell('C' + r), cD = ws.getCell('D' + r);
            if (tq.pergunta && (eFormula(cC) || !cC.value)) cC.value = tq.pergunta;
            if (tq.observar && (eFormula(cD) || !cD.value)) cD.value = tq.observar;
          }
          if (!ativo) {
            set(ws, 'E' + r, 'N/A — Não se aplica');
            set(ws, 'G' + r, 'Condição não confirmada em campo.' + (v.obs ? ' ' + v.obs : ''));
            set(ws, 'H' + r, '—'); set(ws, 'J' + r, nf);
            continue;
          }
          if (Calc.ehCalculado(b, it)) {
            const n = Calc.notaCalculada(s, b, it);
            if (n !== null) { set(ws, 'E' + r, 'Média de ' + Calc.subsDe(b, it).map(x => x.codigo).join(', ')); ws.getCell('F' + r).value = Math.round(n * 100) / 100; }
            set(ws, 'G' + r, v.obs); set(ws, 'J' + r, nf);
            continue;
          }
          set(ws, 'E' + r, v.a);
          const n = Calc.notaDe(v.a); if (n !== null) ws.getCell('F' + r).value = n;
          set(ws, 'G' + r, v.obs); set(ws, 'H' + r, v.prio); set(ws, 'I' + r, v.alerta); set(ws, 'J' + r, nf);
        }
      }

      const lf = e.linhasFechamento || {};
      const F = (rot, val) => { if (lf[rot]) set(ws, 'C' + lf[rot], val); };
      F('Verificado P01–P09', s.fech.verP); F('Verificado ViP', s.fech.verV);
      F('Observações gerais da estação', s.fech.obs); F('Pendências / retornar', s.fech.pend);
      F('Fotos da estação (faixa de numeração)', faixaFotos(e.num));
      const linAss = lf['Assinatura do vistoriador'];
      if (linAss && (s.fech.assin || s.fech.assinNome)) {
        ws.getCell('C' + linAss).value = [s.fech.assinNome || s.ident.vistoriador, s.fech.assin ? 'assinatura digital colhida no aplicativo' : ''].filter(Boolean).join(' — ');
        if (s.fech.assin) {
          ws.getRow(linAss).height = 48;
          const id = wb.addImage({ base64: s.fech.assin, extension: 'png' });
          ws.addImage(id, { tl: { col: 6, row: linAss - 1 }, ext: { width: 200, height: 60 }, editAs: 'oneCell' });
        }
      }
    }

    // ÍNDICE: status
    const wi = wb.getWorksheet('ÍNDICE');
    if (wi) {
      for (let r = 3; r <= 30; r++) {
        const aba = wi.getCell('I' + r).value;
        const e = EST.find(x => x.aba === aba);
        if (e) wi.getCell('H' + r).value = A().STATUS_TXT[Calc.resumoEstacao(e, st(e.num)).status];
      }
    }

    // Textos dos quesitos completados pelo usuário
    const textos = Object.entries(S.cfg.textos || {}).filter(([, t]) => t && (t.pergunta || t.observar));

    // FOTOS
    const lista = [...S.fotos].sort((a, b) => a.num - b.num);
    if (lista.length) {
      const wf = wb.addWorksheet('FOTOS', { views: [{ state: 'frozen', ySplit: 2 }] });
      wf.columns = [{ width: 7 }, { width: 18 }, { width: 30 }, { width: 38 }, { width: 34 }, { width: 17 }, { width: fotos ? 44 : 4 }];
      wf.mergeCells('A1:G1');
      wf.getCell('A1').value = 'REGISTRO FOTOGRÁFICO — numeração única JFAP_L<estação>_F<foto>';
      wf.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      wf.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      const cab = wf.getRow(2);
      ['Nº', 'Arquivo', 'Estação', 'Item vinculado', 'Legenda', 'Data/hora', fotos ? 'Foto' : ''].forEach((t, i) => { const c = cab.getCell(i + 1); c.value = t; c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; });
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i]; const r = i + 3;
        if (fotos) prog(`Inserindo foto ${i + 1} de ${lista.length}…`);
        const e = A().porNum[f.estacao];
        const row = wf.getRow(r);
        row.values = [String(f.num).padStart(3, '0'), f.id, `${String(f.estacao).padStart(2, '0')} — ${e.ambiente}`, nomeItem(f.estacao, f.chave), f.legenda || '', dataHoraBR(f.ts)];
        row.alignment = { vertical: 'top', wrapText: true };
        if (fotos) {
          const red = await Fotos.reduzir(f.blob, 720, 0.72);
          const b64 = await Fotos.blobParaDataURL(red);
          const prop = (f.altura || 3) / (f.largura || 4);
          const w = 300, hgt = Math.round(w * prop);
          row.height = Math.max(20, hgt * 0.75 + 6);
          const id = wb.addImage({ base64: b64, extension: 'jpeg' });
          wf.addImage(id, { tl: { col: 6, row: r - 1 }, ext: { width: w, height: hgt }, editAs: 'oneCell' });
        }
      }
    }
    if (textos.length) {
      const wt = wb.addWorksheet('TEXTOS_QUESITOS');
      wt.columns = [{ header: 'Código', width: 10 }, { header: 'Pergunta de avaliação', width: 70 }, { header: 'O que observar', width: 70 }];
      textos.sort((a, b) => a[0].localeCompare(b[0], 'pt', { numeric: true })).forEach(([c, t]) => wt.addRow([c, t.pergunta || '', t.observar || '']).alignment = { wrapText: true, vertical: 'top' });
      wt.getRow(1).font = { bold: true };
    }

    prog('Gerando arquivo…');
    const out = await wb.xlsx.writeBuffer();
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function xlsx(opts) {
    const blob = await gerarXlsx(opts);
    baixar(blob, `Vistoria_JFAP_preenchida_${carimboData()}.xlsx`);
  }

  /* ------------------------------------------------------------ ZIP de fotos */
  function csvFotos() {
    const { S, porNum, nomeItem, dataHoraBR } = A();
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const linhas = [['Nº', 'Arquivo', 'Estação', 'Ambiente', 'Item', 'Legenda', 'Data/hora'].map(q).join(';')];
    [...S.fotos].sort((a, b) => a.num - b.num).forEach(f => linhas.push([String(f.num).padStart(3, '0'), f.id + '.jpg', f.estacao, porNum[f.estacao].ambiente, nomeItem(f.estacao, f.chave), f.legenda, dataHoraBR(f.ts)].map(q).join(';')));
    return '﻿' + linhas.join('\r\n');
  }

  async function adicionarFotos(zip, pasta, prog) {
    const { S } = A();
    const dir = zip.folder(pasta);
    S.fotos.forEach(f => dir.file(f.id + '.jpg', f.blob));
    dir.file('indice_fotos.csv', csvFotos());
    prog(`${S.fotos.length} foto(s) adicionadas…`);
  }

  async function zipFotos({ prog = () => {} } = {}) {
    if (!A().S.fotos.length) throw new Error('Não há fotos para exportar.');
    await carregarScript('vendor/jszip.min.js');
    const zip = new JSZip();
    await adicionarFotos(zip, 'fotos', prog);
    prog('Compactando…');
    baixar(await zip.generateAsync({ type: 'blob' }), `Fotos_Vistoria_JFAP_${carimboData()}.zip`);
  }

  /* ------------------------------------------------------------ Backup */
  async function gerarBackup(prog = () => {}) {
    const { S } = A();
    const partes = [];
    partes.push(`{"app":"vistoria-jfap","versao":1,"criado":${JSON.stringify(new Date().toISOString())},"cfg":${JSON.stringify(S.cfg)},"estacoes":${JSON.stringify(Object.values(S.est))},"fotos":[`);
    for (let i = 0; i < S.fotos.length; i++) {
      const f = S.fotos[i];
      prog(`Backup: foto ${i + 1} de ${S.fotos.length}…`);
      const { blob, thumb, ...meta } = f;
      meta.blob = await Fotos.blobParaDataURL(blob);
      meta.thumb = thumb ? await Fotos.blobParaDataURL(thumb) : '';
      partes.push((i ? ',' : '') + JSON.stringify(meta));
    }
    partes.push(']}');
    return new Blob(partes, { type: 'application/json' });
  }
  async function backup({ prog = () => {} } = {}) {
    baixar(await gerarBackup(prog), `Backup_Vistoria_JFAP_${carimboData()}.json`);
  }

  async function restaurar(file, prog = () => {}) {
    prog('Lendo backup…');
    const dados = JSON.parse(await file.text());
    if (dados.app !== 'vistoria-jfap') throw new Error('arquivo não é um backup deste aplicativo');
    await DB.limpar('estacoes'); await DB.limpar('fotos');
    for (const e of dados.estacoes || []) await DB.put('estacoes', e);
    let n = 0;
    for (const f of dados.fotos || []) {
      prog(`Restaurando foto ${++n}…`);
      f.blob = await Fotos.dataURLParaBlob(f.blob);
      f.thumb = f.thumb ? await Fotos.dataURLParaBlob(f.thumb) : null;
      await DB.put('fotos', f);
    }
    if (dados.cfg) await DB.put('config', dados.cfg, 'cfg');
    return n;
  }

  /* ------------------------------------------------------------ Pacote */
  async function pacote({ prog = () => {} } = {}) {
    await carregarScript('vendor/jszip.min.js');
    const zip = new JSZip();
    zip.file(`Vistoria_JFAP_preenchida.xlsx`, await gerarXlsx({ fotos: true, prog }));
    if (A().S.fotos.length) await adicionarFotos(zip, 'fotos', prog);
    zip.file('backup_app.json', await gerarBackup(prog));
    prog('Compactando pacote…');
    baixar(await zip.generateAsync({ type: 'blob' }), `Pacote_Vistoria_JFAP_${carimboData()}.zip`);
  }

  /* ------------------------------------------------------------ Relatório (impressão/PDF) */
  async function relatorio({ vazias = false, prog = () => {} } = {}) {
    const { EST, st, D, S, h, nl, pct, num1, pad2, fotosDe, faixaFotos, textoQuesito, nomeItem, dataBR, dataHoraBR, STATUS_TXT, corNota, corPrio } = A();
    const urls = [];
    const rs = EST.map(e => ({ e, s: st(e.num), r: Calc.resumoEstacao(e, st(e.num)) }));
    const sel = rs.filter(x => vazias || x.r.status !== 'nao' || fotosDe(x.e.num).length);
    const datas = rs.map(x => x.s.ident.data).filter(Boolean).sort();
    const equipe = [...new Set(rs.flatMap(x => [x.s.ident.vistoriador]).filter(Boolean))];
    const acomp = [...new Set(rs.map(x => x.s.ident.acompanhante).filter(Boolean))];
    const mg = Calc.media(rs.map(x => x.r.mediaGeral).filter(m => m !== null));
    const alertas = rs.reduce((a, x) => a + x.r.alertas, 0);

    async function img(f, lado) {
      const b = await Fotos.reduzir(f.blob, lado, 0.8);
      const u = URL.createObjectURL(b); urls.push(u); return u;
    }

    let html = `
      <section class="r-capa">
        <p class="r-org">${h(D.leiame.orgao)}</p>
        <h1>Relatório de Vistoria por Estação</h1>
        <h2>${h(D.leiame.titulo)}</h2>
        <p>${h(D.leiame.endereco)}</p>
        <table class="r-tab r-id">
          <tr><th>Período da vistoria</th><td>${datas.length ? (dataBR(datas[0]) + (datas.length > 1 && datas[datas.length - 1] !== datas[0] ? ' a ' + dataBR(datas[datas.length - 1]) : '')) : '—'}</td></tr>
          <tr><th>Vistoriador(es)</th><td>${h(equipe.join('; ') || '—')}</td></tr>
          <tr><th>Acompanhante(s)</th><td>${h(acomp.join('; ') || '—')}</td></tr>
          <tr><th>Estações concluídas</th><td>${rs.filter(x => x.r.status === 'ok').length} de ${EST.length}</td></tr>
          <tr><th>Média geral P01–P09</th><td>${num1(mg)} ${mg !== null ? '— ' + h(Calc.classificacaoDe(mg)) : ''}</td></tr>
          <tr><th>Alertas críticos</th><td>${alertas}</td></tr>
          <tr><th>Fotos registradas</th><td>${S.fotos.length}</td></tr>
          <tr><th>Emitido em</th><td>${dataHoraBR(Date.now())}</td></tr>
        </table>
      </section>
      <section class="r-sec">
        <h2>Resumo — resultados por estação</h2>
        <table class="r-tab"><thead><tr><th>Estação</th><th>Status</th><th>Cobertura P</th><th>Média</th><th>Alertas</th><th>ViP B/R/C</th><th>Prioridade</th></tr></thead><tbody>
        ${rs.map(({ e, r }) => `<tr><td>${pad2(e.num)} — ${h(e.ambiente)}</td><td>${STATUS_TXT[r.status]}</td><td>${r.temP ? pct(r.coberturaP) : '—'}</td><td class="${corNota(r.mediaGeral)}">${num1(r.mediaGeral)}</td><td>${r.alertas || ''}</td><td>${r.temVip ? `${r.vip.cont.B}/${r.vip.cont.R}/${r.vip.cont.C}` : '—'}</td><td>${h(r.prioridade || '—')}</td></tr>`).join('')}
        </tbody></table>
        <p class="r-nota">Escala 1–5 (5 Muito favorável … 1 Muito desfavorável). Prioridade: ≥4,5 Manter · ≥3,5 Melhoria pontual · ≥2,5 Programar melhoria · &lt;2,5 Intervenção prioritária; alerta crítico prevalece sobre a média. ViP: B = 0, R = 2, C = 5 pontos.</p>
      </section>`;

    for (const { e, s, r } of sel) {
      prog(`Relatório: estação ${pad2(e.num)}…`);
      html += `<section class="r-est">
        <h2>${h(e.titulo)}</h2>
        <p class="r-sub">${h(e.subtitulo)}</p>
        <table class="r-tab r-id"><tr><th>Data</th><td>${dataBR(s.ident.data) || '—'}</td><th>Vistoriador</th><td>${h(s.ident.vistoriador || '—')}</td><th>Acompanhante</th><td>${h(s.ident.acompanhante || '—')}</td><th>Início/término</th><td>${h(s.ident.inicio || '—')} / ${h(s.ident.termino || '—')}</td></tr></table>
        ${Object.entries(e.info).map(([k, v]) => `<p class="r-info"><b>${h(k)}:</b> ${h(v)}</p>`).join('')}
        ${e.foco ? `<p class="r-info"><b>Foco da vistoria:</b> ${h(e.foco)}</p>` : ''}
        <p class="r-res"><b>Resultado:</b> ${STATUS_TXT[r.status]} · ${r.resp}/${r.total} itens · Média P ${num1(r.mediaGeral)} · ${h(r.prioridade || '—')} · Alertas ${r.alertas}${r.temVip ? ` · ViP B${r.vip.cont.B}/R${r.vip.cont.R}/C${r.vip.cont.C} (${r.vip.pontos} pts)` : ''}</p>
        ${e.linhaAnotacoes ? `<h3>Anotações de campo</h3><p>${nl(s.anot) || '—'}</p>` : ''}`;
      for (const b of e.blocos) {
        const rb = Calc.resumoBloco(s, b);
        const ativo = Calc.blocoAtivo(s, b);
        html += `<h3>${h(b.titulo)}</h3>`;
        if (b.condicional) html += `<p class="r-info">Condição confirmada em campo: <b>${s.cond[b.codigo] === 'sim' ? 'Sim' : s.cond[b.codigo] === 'nao' ? 'Não — bloco não pontuado' : 'não informado'}</b></p>`;
        if (b.tipo === 'P') {
          html += `<table class="r-tab"><thead><tr><th>Código</th><th>Indicador / pergunta</th><th>Avaliação</th><th>Nota</th><th>Observação / fragilidade</th><th>Prioridade</th><th>Alerta</th><th>Fotos</th></tr></thead><tbody>
            ${b.itens.map(it => {
              const k = Calc.chave(b, it); const v = s.r[k] || {}; const calc = Calc.ehCalculado(b, it);
              const n = calc ? Calc.notaCalculada(s, b, it) : Calc.notaDe(v.a);
              const tq = textoQuesito(it);
              return `<tr class="${v.alerta === 'Sim' ? 'r-alerta' : ''}"><td>${h(it.codigo)}</td><td><b>${h(it.indicador || '')}</b>${tq.pergunta ? `<br><small>${h(tq.pergunta)}</small>` : ''}</td>
                <td>${ativo ? h(calc ? 'Média dos sub-quesitos' : (v.a || '—')) : 'N/A'}</td><td class="${corNota(n)}">${n === null ? '' : (calc ? num1(n) : n)}</td>
                <td>${nl(v.obs)}</td><td>${h(ativo ? v.prio || '' : '—')}</td><td>${h(v.alerta || '')}</td><td>${h(nomesFotos(e.num, k))}</td></tr>`;
            }).join('')}</tbody></table>
            <p class="r-res">${rb.ativo ? `Cobertura ${pct(rb.cobertura)} · Média ${num1(rb.media)} ${rb.classificacao ? '(' + h(rb.classificacao) + ')' : ''} · Prioridade: ${h(rb.prioridade || '—')} · Alertas: ${rb.alertas}` : 'Bloco não pontuado.'}</p>`;
        } else {
          html += `<table class="r-tab"><thead><tr><th>Código</th><th>Item a verificar</th><th>O que verificar</th><th>Situação</th><th>Observação</th><th>Alerta</th><th>Fotos</th></tr></thead><tbody>
            ${b.itens.map(it => { const k = Calc.chave(b, it); const v = s.r[k] || {}; return `<tr class="${(v.s || '').startsWith('C ') || v.alerta === 'Sim' ? 'r-alerta' : ''}"><td>${h(it.codigo)}</td><td>${h(it.item)}</td><td>${h(it.verificar)}</td><td class="sit-${h((v.s || '').split(' ')[0])}">${h(v.s || '—')}</td><td>${nl(v.obs)}</td><td>${h(v.alerta || '')}</td><td>${h(nomesFotos(e.num, k))}</td></tr>`; }).join('')}
            </tbody></table><p class="r-res">Cobertura ${pct(rb.cobertura)} · B ${rb.cont.B} · R ${rb.cont.R} · C ${rb.cont.C} · NA ${rb.cont.NA} · NI ${rb.cont.NI} · ${rb.pontos} pontos</p>`;
        }
      }
      html += `<h3>Fechamento</h3><table class="r-tab r-id">
        <tr><th>Verificado P01–P09</th><td>${h(s.fech.verP || '—')}</td><th>Verificado ViP</th><td>${h(s.fech.verV || '—')}</td></tr>
        <tr><th>Observações gerais</th><td colspan="3">${nl(s.fech.obs) || '—'}</td></tr>
        <tr><th>Pendências / retornar</th><td colspan="3">${nl(s.fech.pend) || '—'}</td></tr>
        <tr><th>Fotos da estação</th><td colspan="3">${h(faixaFotos(e.num) || '—')}</td></tr>
        <tr><th>Assinatura do vistoriador</th><td colspan="3">${s.fech.assin ? `<img class="r-assin" src="${s.fech.assin}" alt="Assinatura">` : ''}<br>${h(s.fech.assinNome || s.ident.vistoriador || '')}</td></tr></table>`;
      const fs = fotosDe(e.num);
      if (fs.length) {
        html += `<h3>Registro fotográfico</h3><div class="r-fotos">`;
        for (const f of fs) html += `<figure><img src="${await img(f, 1100)}" alt="${h(f.id)}"><figcaption><b>${h(f.id)}</b> — ${h(nomeItem(e.num, f.chave))}${f.legenda ? '<br>' + h(f.legenda) : ''}<br><small>${dataHoraBR(f.ts)}</small></figcaption></figure>`;
        html += `</div>`;
      }
      html += `</section>`;
    }
    if (!sel.length) html += `<section class="r-sec"><p>Nenhuma estação iniciada. Marque “Incluir estações não iniciadas” para gerar o formulário em branco.</p></section>`;

    const alvo = document.getElementById('print');
    alvo.innerHTML = html;
    prog('Aguardando imagens…');
    await Promise.all(Array.from(alvo.querySelectorAll('img')).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const limpar = () => { window.removeEventListener('afterprint', limpar); setTimeout(() => { alvo.innerHTML = ''; urls.forEach(u => URL.revokeObjectURL(u)); }, 1000); };
    window.addEventListener('afterprint', limpar);
    prog('Abrindo impressão — escolha “Salvar como PDF”.');
    window.print();
  }

  return { xlsx, gerarXlsx, zipFotos, backup, restaurar, pacote, relatorio };
})();
