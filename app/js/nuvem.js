/* Envio periódico para o Google Drive (via Google Apps Script publicado pela equipe).
   - fotos novas: uma a uma, nomeadas JFAP_Lxx_Fyyy.jpg, em "Vistoriador N/fotos"
   - dados.json: todas as respostas do aparelho (substituído a cada envio, só se mudou)
   - planilha do vistoriador: ao concluir uma estação e no "Enviar agora"
   O salvamento no aparelho continua imediato; a nuvem recebe cópias a cada X minutos. */
const Nuvem = (() => {
  const A = () => window.App;
  const cfg = () => (A().S.cfg.nuvem ||= { url: '', token: '', intervalo: 10, ultimoEnvio: 0, hashDados: '', concluidas: '' });
  let enviando = false;
  let pausado = false;
  let status = { estado: 'off', msg: 'Envio para a nuvem não configurado' };

  const configurado = () => !!(cfg().url && cfg().token && A().S.cfg.vistoriadorNum);
  const salvarCfg = () => DB.put('config', A().S.cfg, 'cfg');

  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }

  function pacoteDados() {
    const { S } = A();
    return JSON.stringify({
      app: 'vistoria-jfap', versao: 1, vistoriador: S.cfg.vistoriadorNum, nome: S.cfg.vistoriadorPadrao || '',
      enviado: new Date().toISOString(),
      estacoes: Object.values(S.est),
      fotos: S.fotos.map(({ blob, thumb, ...m }) => m)
    });
  }
  // assinatura só do conteúdo (sem a data de envio)
  const assinatura = () => { const { S } = A(); return hash(JSON.stringify([Object.values(S.est), S.fotos.map(f => [f.id, f.chave, f.legenda])])); };
  const concluidas = () => A().EST.filter(e => Calc.resumoEstacao(e, A().st(e.num)).status === 'ok').map(e => e.num).join(',');

  function pendentes() {
    if (!configurado()) return 0;
    return A().S.fotos.filter(f => !f.enviada).length + (assinatura() !== cfg().hashDados ? 1 : 0);
  }

  async function post(corpo) {
    const c = cfg();
    const r = await fetch(c.url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita pré-verificação CORS no Apps Script
      body: JSON.stringify(Object.assign({ token: c.token, vistoriador: A().S.cfg.vistoriadorNum }, corpo))
    });
    let j; try { j = await r.json(); } catch (e) { throw new Error('Resposta inválida do Google (confira a URL do app da Web)'); }
    if (!j.ok) throw new Error(j.erro || 'Falha no envio');
    return j;
  }
  async function get(params) {
    const c = cfg();
    const u = c.url + (c.url.includes('?') ? '&' : '?') + new URLSearchParams(Object.assign({ token: c.token }, params));
    const r = await fetch(u, { redirect: 'follow' });
    let j; try { j = await r.json(); } catch (e) { throw new Error('Resposta inválida do Google (confira a URL do app da Web)'); }
    if (!j.ok) throw new Error(j.erro || 'Falha na consulta');
    return j;
  }

  function atualizarIndicador() {
    const el = document.getElementById('nuvemInd'); if (!el) return;
    if (!configurado()) { el.hidden = true; return; }
    el.hidden = false;
    const n = pendentes();
    const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    let txt, cls;
    if (status.estado === 'enviando') { txt = '☁ enviando…'; cls = 'env'; }
    else if (status.estado === 'erro') { txt = '☁ ⚠'; cls = 'erro'; }
    else if (n) { txt = `☁ ${n} pend.`; cls = 'pend'; }
    else { txt = cfg().ultimoEnvio ? '☁ ' + hm(cfg().ultimoEnvio) : '☁'; cls = 'ok'; }
    el.textContent = txt; el.className = 'nuvem-ind ' + cls;
    el.title = status.msg || '';
  }
  function definir(estado, msg) { status = { estado, msg }; atualizarIndicador(); document.dispatchEvent(new CustomEvent('nuvem-status')); }

  /* Um ciclo de envio. forcar = envia também a planilha do vistoriador. */
  async function ciclo({ forcar = false, prog = () => {} } = {}) {
    if (!configurado()) { definir('off', 'Envio para a nuvem não configurado'); return { ok: false, motivo: 'config' }; }
    if (enviando || pausado) return { ok: false, motivo: 'ocupado' };
    if (!navigator.onLine) { definir('pend', 'Sem internet — os envios ficam pendentes'); return { ok: false, motivo: 'offline' }; }
    enviando = true;
    definir('enviando', 'Enviando para o Google Drive…');
    const c = cfg();
    let fotosEnv = 0;
    try {
      const { S, porNum, nomeItem } = A();
      const fila = S.fotos.filter(f => !f.enviada).sort((a, b) => a.num - b.num);
      for (const f of fila) {
        prog(`Enviando foto ${++fotosEnv} de ${fila.length}…`);
        const b64 = (await Fotos.blobParaDataURL(f.blob)).split(',')[1];
        const r = await post({ acao: 'foto', nome: f.id + '.jpg', base64: b64, legenda: `${nomeItem(f.estacao, f.chave)}${f.legenda ? ' — ' + f.legenda : ''} (Estação ${porNum[f.estacao].ambiente})` });
        f.enviada = true; f.url = r.url || '';
        await DB.put('fotos', f);
        atualizarIndicador();
      }
      const ass = assinatura();
      if (ass !== c.hashDados) {
        prog('Enviando dados…');
        await post({ acao: 'dados', json: pacoteDados() });
        c.hashDados = ass;
      }
      const conc = concluidas();
      if (forcar || conc !== c.concluidas) {
        prog('Gerando e enviando a planilha…');
        const blob = await Export.gerarXlsx({ fotos: false });
        const b64 = (await Fotos.blobParaDataURL(blob)).split(',')[1];
        await post({ acao: 'planilha', nome: `Vistoria_JFAP_Vistoriador_${A().S.cfg.vistoriadorNum}.xlsx`, base64: b64 });
        c.concluidas = conc;
      }
      c.ultimoEnvio = Date.now();
      await salvarCfg();
      definir('ok', `Último envio às ${new Date(c.ultimoEnvio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${fotosEnv ? ` (${fotosEnv} foto(s))` : ''}`);
      return { ok: true, fotos: fotosEnv };
    } catch (err) {
      c.ultimoEnvio = Date.now();   // tenta de novo no próximo ciclo
      await salvarCfg();
      definir('erro', 'Falha no envio: ' + err.message + ' — nova tentativa no próximo ciclo');
      return { ok: false, motivo: err.message };
    } finally {
      enviando = false;
      atualizarIndicador();
    }
  }

  function tique() {
    atualizarIndicador();
    if (!configurado() || enviando || pausado || !navigator.onLine) return;
    const min = +cfg().intervalo;
    if (!min) return;                                 // somente manual
    // envia no máximo uma vez por intervalo, e só se houver algo novo
    if (Date.now() - (cfg().ultimoEnvio || 0) >= min * 60000 && pendentes() + (concluidas() !== cfg().concluidas ? 1 : 0) > 0) ciclo();
  }

  function iniciar() {
    atualizarIndicador();
    setInterval(tique, 30000);
    setTimeout(tique, 5000);
    window.addEventListener('online', () => setTimeout(tique, 2000));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(tique, 1500); });
  }

  return {
    iniciar, ciclo, get, post, pausar: v => { pausado = v; }, pendentes, configurado, atualizarIndicador,
    status: () => status, cfg,
    async testar() { const j = await get({ acao: 'ping' }); return j.pasta; },
    async equipe() { return get({ acao: 'equipe' }); }
  };
})();
