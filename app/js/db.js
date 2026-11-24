/* Persistência local (IndexedDB): estações, fotos (com imagem) e configuração. */
const DB = (() => {
  const NOME = 'jfap-vistoria';
  const VERSAO = 1;
  let dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('estacoes')) db.createObjectStore('estacoes', { keyPath: 'num' });
        if (!db.objectStoreNames.contains('fotos')) {
          const s = db.createObjectStore('fotos', { keyPath: 'id' });
          s.createIndex('estacao', 'estacao');
        }
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }

  async function tx(store, modo, fn) {
    const db = await abrir();
    return new Promise((res, rej) => {
      const t = db.transaction(store, modo);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transação abortada'));
    });
  }

  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  return {
    async todos(store) { return tx(store, 'readonly', s => req2p(s.getAll())); },
    async get(store, key) { return tx(store, 'readonly', s => req2p(s.get(key))); },
    async put(store, val, key) { return tx(store, 'readwrite', s => req2p(key === undefined ? s.put(val) : s.put(val, key))); },
    async del(store, key) { return tx(store, 'readwrite', s => req2p(s.delete(key))); },
    async limpar(store) { return tx(store, 'readwrite', s => req2p(s.clear())); },
    async persistir() {
      try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
      return false;
    },
    async uso() {
      try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) {}
      return null;
    }
  };
})();
