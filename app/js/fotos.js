/* Captura e processamento de fotos: redimensiona, aplica carimbo de identificação
   (JFAP_Lxx_Fyyy · item · data/hora) e gera miniatura. */
const Fotos = (() => {
  const pad = (n, w) => String(n).padStart(w, '0');
  const nomeArquivo = (estacao, num) => `JFAP_L${pad(estacao, 2)}_F${pad(num, 3)}`;

  async function carregarImagem(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fallback */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Imagem inválida')); };
      img.src = url;
    });
  }

  function canvasDe(img, maxLado) {
    const w0 = img.width, h0 = img.height;
    const k = Math.min(1, maxLado / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  const toBlob = (c, q) => new Promise(res => c.toBlob(res, 'image/jpeg', q));

  function carimbar(c, linhas) {
    const ctx = c.getContext('2d');
    const fs = Math.max(14, Math.round(c.width / 48));
    const pad = Math.round(fs * 0.5);
    const alt = linhas.length * fs * 1.3 + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, c.height - alt, c.width, alt);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = 'top';
    linhas.forEach((l, i) => ctx.fillText(l, pad, c.height - alt + pad + i * fs * 1.3, c.width - pad * 2));
  }

  /* Processa um arquivo de imagem e devolve { blob, thumb, largura, altura } */
  async function processar(file, opts) {
    const img = await carregarImagem(file);
    const c = canvasDe(img, opts.maxLado || 1920);
    if (opts.carimbo) carimbar(c, opts.carimbo);
    const blob = await toBlob(c, opts.qualidade || 0.82);
    const t = canvasDe(c, 360);
    const thumb = await toBlob(t, 0.7);
    if (img.close) img.close();
    return { blob, thumb, largura: c.width, altura: c.height };
  }

  /* Versão reduzida (para Excel/relatório) a partir do blob armazenado */
  async function reduzir(blob, maxLado, q) {
    const img = await carregarImagem(blob);
    const c = canvasDe(img, maxLado);
    if (img.close) img.close();
    return toBlob(c, q || 0.75);
  }

  const blobParaDataURL = b => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b);
  });
  async function dataURLParaBlob(u) { return (await fetch(u)).blob(); }

  return { nomeArquivo, processar, reduzir, blobParaDataURL, dataURLParaBlob, pad };
})();
