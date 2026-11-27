/* Service worker: mantém o aplicativo disponível sem internet (cache do app). */
const VERSAO = 'vistoria-jfap-v5';
const ARQUIVOS = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/data.js', 'js/db.js', 'js/calc.js', 'js/fotos.js', 'js/app.js', 'js/export.js', 'js/nuvem.js',
  'vendor/exceljs.min.js', 'vendor/jszip.min.js',
  'modelo/modelo_vistoria_JFAP.xlsx',
  'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* rede primeiro (para receber atualizações), cache se estiver offline */
self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET' || !ev.request.url.startsWith(self.location.origin)) return;
  ev.respondWith(
    fetch(ev.request).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then(c => c.put(ev.request, cp)); }
      return r;
    }).catch(() => caches.match(ev.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
