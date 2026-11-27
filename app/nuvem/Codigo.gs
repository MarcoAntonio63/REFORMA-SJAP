/**
 * Vistoria JFAP — recebedor de envios para o Google Drive (Google Apps Script).
 *
 * Instalação (uma vez, na conta Google que vai guardar os arquivos):
 *  1. Acesse https://script.google.com → Novo projeto. Apague o conteúdo e cole este arquivo.
 *  2. Troque o CODIGO_EQUIPE abaixo por uma senha da equipe (ex.: jfap-vistoria-2026-xyz).
 *  3. Implantar → Nova implantação → tipo "App da Web":
 *       Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *  4. Autorize o acesso ao Drive e copie a "URL do app da Web" (termina em /exec).
 *  5. No app (Mais → Configurações → Equipe e nuvem), cole a URL e o código da equipe.
 *
 * Os arquivos ficam em "Meu Drive / Vistoria JFAP / Vistoriador N /" (fotos, dados.json e planilha).
 */
const CODIGO_EQUIPE = 'TROQUE-ESTE-CODIGO';
const PASTA_RAIZ = 'Vistoria JFAP';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== CODIGO_EQUIPE) return saida({ ok: false, erro: 'Código da equipe inválido' });
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const raiz = pasta(PASTA_RAIZ, DriveApp.getRootFolder());
      const sub = req.vistoriador === 'EQUIPE' ? pasta('Consolidado', raiz) : pasta('Vistoriador ' + Number(req.vistoriador), raiz);
      if (req.acao === 'foto') {
        const fotos = pasta('fotos', sub);
        const nome = String(req.nome).replace(/[^\w.\-]/g, '_');
        let arq = primeiro(fotos, nome);
        if (!arq) arq = fotos.createFile(Utilities.newBlob(Utilities.base64Decode(req.base64), 'image/jpeg', nome));
        if (req.legenda) arq.setDescription(String(req.legenda));
        return saida({ ok: true, id: arq.getId(), url: arq.getUrl() });
      }
      if (req.acao === 'dados') {
        const arq = primeiro(sub, 'dados.json');
        if (arq) arq.setContent(req.json); else sub.createFile('dados.json', req.json, 'application/json');
        return saida({ ok: true });
      }
      if (req.acao === 'planilha') {
        const nome = String(req.nome).replace(/[^\w.\-]/g, '_');
        const antigo = primeiro(sub, nome);
        if (antigo) antigo.setTrashed(true);
        const arq = sub.createFile(Utilities.newBlob(Utilities.base64Decode(req.base64), MIME_XLSX, nome));
        return saida({ ok: true, url: arq.getUrl() });
      }
      return saida({ ok: false, erro: 'Ação desconhecida' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return saida({ ok: false, erro: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.token !== CODIGO_EQUIPE) return saida({ ok: false, erro: 'Código da equipe inválido' });
  const raiz = pasta(PASTA_RAIZ, DriveApp.getRootFolder());
  if (p.acao === 'equipe') {
    const equipe = [];
    const subs = raiz.getFolders();
    while (subs.hasNext()) {
      const s = subs.next();
      const m = s.getName().match(/^Vistoriador (\d+)$/);
      if (!m) continue;
      const d = primeiro(s, 'dados.json');
      if (!d) continue;
      const links = {};
      const pf = s.getFoldersByName('fotos');
      if (pf.hasNext()) { const it = pf.next().getFiles(); while (it.hasNext()) { const f = it.next(); links[f.getName()] = f.getUrl(); } }
      equipe.push({ vistoriador: Number(m[1]), atualizado: d.getLastUpdated().toISOString(), dados: JSON.parse(d.getBlob().getDataAsString()), links: links });
    }
    return saida({ ok: true, equipe: equipe, pasta: raiz.getUrl() });
  }
  return saida({ ok: true, pasta: raiz.getUrl() });
}

function pasta(nome, pai) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}
function primeiro(p, nome) {
  const it = p.getFilesByName(nome);
  return it.hasNext() ? it.next() : null;
}
function saida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
