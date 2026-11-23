'use strict';
// PDF 导出（无依赖：每页嵌一张 JPEG）+ Ctrl+V 粘贴导入 + 轻提示
function canvasJpegBytes(cv) {
  return new Promise(res => cv.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), 'image/jpeg', 0.92));
}
// 太长的图（高 > 宽 × 1.6）按 A4 比例切成多页，适合长聊天记录打印/存档
function pdfPages(cv) {
  if (cv.height <= cv.width * 1.6) return [cv];
  const ph = Math.round(cv.width * 1.414), out = [];
  for (let y = 0; y < cv.height; y += ph) {
    const h = Math.min(ph, cv.height - y), c = document.createElement('canvas');
    c.width = cv.width; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, h);
    x.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
    out.push(c);
  }
  return out;
}
async function makePdf(canvases) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const put = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const n = canvases.length, objs = 2 + n * 3;
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj = (id, body) => { offs[id] = len; put(`${id} 0 obj\n`); body(); put('\nendobj\n'); };
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
  for (let i = 0; i < n; i++) {
    const cv = canvases[i], jpg = await canvasJpegBytes(cv);
    const pw = 595.28, ph = +(cv.height * pw / cv.width).toFixed(2);
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(pid, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    obj(cid, () => put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      put(jpg); put('\nendstream');
    });
  }
  const xref = len;
  let x = `xref\n0 ${objs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  put(x + `trailer\n<< /Size ${objs + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type:'application/pdf' });
}

// ---------- 轻提示 ----------
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- 粘贴导入 ----------
document.addEventListener('paste', e => {
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type === 'text'))) return;
  const files = [...(e.clipboardData ? e.clipboardData.items : [])]
    .filter(it => it.kind === 'file' && it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files).then(() => toast(t('pasteDone')(files.length)));
});
