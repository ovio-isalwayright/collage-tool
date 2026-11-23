'use strict';
// 打码 / 标注编辑器：马赛克刷、框选打码、方框、箭头、画笔、文字，可撤销
const annModal = document.getElementById('annModal');
const annCv = document.getElementById('annCanvas');
const annCtx = annCv.getContext('2d');
const annText = document.getElementById('annText');
let an = null;            // { base, done, ops, s, onApply, cur }
let annTool = 'mosaic', annColor = '#ff3b30', annSize = 24;

function copyCanvas(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w || src.width; c.height = h || src.height;
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function openAnnotate(src, onApply) {
  const iw = src.width, ih = src.height;
  const base = copyCanvas(src, iw, ih);
  an = { base, done: copyCanvas(base), ops: [], s: 1, onApply, cur: null };
  annText.classList.add('hidden');
  annModal.classList.add('show');
  layoutAnnot();
}
function layoutAnnot() {
  if (!an) return;
  const availW = Math.min(window.innerWidth * 0.92, 1000) - 4;
  an.s = Math.min(1, availW / an.done.width);
  annCv.width = Math.max(1, Math.round(an.done.width * an.s));
  annCv.height = Math.max(1, Math.round(an.done.height * an.s));
  drawAnnot();
}
window.addEventListener('resize', () => { if (annModal.classList.contains('show')) layoutAnnot(); });
function closeAnnotate() { annModal.classList.remove('show'); an = null; annText.classList.add('hidden'); }
function imgPx(v) { return v / an.s; }                    // 显示像素 → 原图像素
function mosaicBlock() { return Math.max(6, Math.round(Math.max(an.done.width, 600) / 70)); }

// ---------- 把一个操作画进原图 ----------
function opBBox(op) {
  if (op.pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    op.pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    const r = op.w / 2 + 2;
    return [x0 - r, y0 - r, x1 + r, y1 + r];
  }
  return [Math.min(op.x0, op.x1), Math.min(op.y0, op.y1), Math.max(op.x0, op.x1), Math.max(op.y0, op.y1)];
}
function applyMosaic(dst, op) {
  const B = op.block, W = dst.width, H = dst.height;
  let [x0, y0, x1, y1] = opBBox(op);
  x0 = Math.max(0, Math.floor(x0 / B) * B); y0 = Math.max(0, Math.floor(y0 / B) * B);
  x1 = Math.min(W, Math.ceil(x1 / B) * B); y1 = Math.min(H, Math.ceil(y1 / B) * B);
  const w = x1 - x0, h = y1 - y0;
  if (w < 1 || h < 1) return;
  // 区域像素化：缩小再放大（关闭平滑）
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.ceil(w / B)); small.height = Math.max(1, Math.ceil(h / B));
  small.getContext('2d').drawImage(dst, x0, y0, w, h, 0, 0, small.width, small.height);
  const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
  const m = mask.getContext('2d');
  m.translate(-x0, -y0);
  if (op.pts) {
    m.lineCap = m.lineJoin = 'round'; m.lineWidth = op.w; m.strokeStyle = '#000';
    m.beginPath(); op.pts.forEach((p, i) => i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y));
    if (op.pts.length === 1) m.lineTo(op.pts[0].x + 0.1, op.pts[0].y);
    m.stroke();
  } else {
    m.fillRect(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1), Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0));
  }
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'source-in';
  m.imageSmoothingEnabled = false;
  m.drawImage(small, 0, 0, small.width * B, small.height * B);
  dst.getContext('2d').drawImage(mask, x0, y0);
}
function drawArrow(c, x0, y0, x1, y1, w) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
  const hl = Math.min(L * 0.45, w * 4.5), hw = w * 2.6;
  const bx = x1 - Math.cos(a) * hl, by = y1 - Math.sin(a) * hl;
  c.lineCap = 'round'; c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(bx, by); c.stroke();
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(bx + Math.sin(a) * hw, by - Math.cos(a) * hw);
  c.lineTo(bx - Math.sin(a) * hw, by + Math.cos(a) * hw);
  c.closePath(); c.fill();
}
function textFont(op) { return `bold ${op.fs}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`; }
function applyOp(dst, op) {
  if (op.t === 'mosaic' || op.t === 'mbox') { applyMosaic(dst, op); return; }
  drawShape(dst.getContext('2d'), op);
}
function drawShape(c, op) {
  c.save();
  c.strokeStyle = c.fillStyle = op.color; c.lineWidth = op.w; c.lineJoin = c.lineCap = 'round';
  if (op.t === 'rect') {
    c.strokeRect(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1), Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0));
  } else if (op.t === 'arrow') {
    drawArrow(c, op.x0, op.y0, op.x1, op.y1, op.w);
  } else if (op.t === 'pen') {
    c.beginPath(); op.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    if (op.pts.length === 1) c.lineTo(op.pts[0].x + 0.1, op.pts[0].y);
    c.stroke();
  } else if (op.t === 'text') {
    c.font = textFont(op); c.textBaseline = 'top';
    c.lineWidth = Math.max(2, op.fs * 0.14); c.strokeStyle = 'rgba(255,255,255,.95)';
    op.text.split('\n').forEach((ln, i) => { c.strokeText(ln, op.x0, op.y0 + i * op.fs * 1.25); c.fillText(ln, op.x0, op.y0 + i * op.fs * 1.25); });
  }
  c.restore();
}
function pushOp(op) { applyOp(an.done, op); an.ops.push(op); drawAnnot(); }
function undoAnnot() {
  if (!an || !an.ops.length) return;
  an.ops.pop();
  an.done = copyCanvas(an.base);
  an.ops.forEach(op => applyOp(an.done, op));
  drawAnnot();
}

// ---------- 显示 ----------
function drawAnnot() {
  if (!an) return;
  annCtx.setTransform(1, 0, 0, 1, 0, 0);
  annCtx.clearRect(0, 0, annCv.width, annCv.height);
  annCtx.drawImage(an.done, 0, 0, annCv.width, annCv.height);
  const op = an.cur;
  if (!op) return;
  annCtx.setTransform(an.s, 0, 0, an.s, 0, 0);
  if (op.t === 'mosaic') {           // 涂抹预览：半透明笔迹，松手才真正打码
    annCtx.save(); annCtx.globalAlpha = 0.45; annCtx.strokeStyle = '#4f7cff';
    annCtx.lineWidth = op.w; annCtx.lineCap = annCtx.lineJoin = 'round';
    annCtx.beginPath(); op.pts.forEach((p, i) => i ? annCtx.lineTo(p.x, p.y) : annCtx.moveTo(p.x, p.y)); annCtx.stroke();
    annCtx.restore();
  } else if (op.t === 'mbox') {
    annCtx.save(); annCtx.fillStyle = 'rgba(79,124,255,.25)'; annCtx.strokeStyle = '#4f7cff'; annCtx.lineWidth = 2 / an.s;
    annCtx.setLineDash([6 / an.s, 4 / an.s]);
    const x = Math.min(op.x0, op.x1), y = Math.min(op.y0, op.y1), w = Math.abs(op.x1 - op.x0), h = Math.abs(op.y1 - op.y0);
    annCtx.fillRect(x, y, w, h); annCtx.strokeRect(x, y, w, h); annCtx.restore();
  } else drawShape(annCtx, op);
  annCtx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- 交互 ----------
function annPt(e) {
  const r = annCv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * an.done.width / r.width, y: (e.clientY - r.top) * an.done.height / r.height };
}
annCv.addEventListener('pointerdown', e => {
  if (!an) return;
  if (!annText.classList.contains('hidden')) commitText();
  const p = annPt(e), w = imgPx(annSize);
  if (annTool === 'text') { e.preventDefault(); startText(e, p); return; }
  annCv.setPointerCapture(e.pointerId);
  if (annTool === 'mosaic') an.cur = { t:'mosaic', pts:[p], w: w * 1.4, block: mosaicBlock() };
  else if (annTool === 'pen') an.cur = { t:'pen', pts:[p], w: Math.max(1, w / 4), color: annColor };
  else if (annTool === 'mbox') an.cur = { t:'mbox', x0:p.x, y0:p.y, x1:p.x, y1:p.y, block: mosaicBlock() };
  else an.cur = { t: annTool, x0:p.x, y0:p.y, x1:p.x, y1:p.y, w: Math.max(1, w / 4), color: annColor };
  drawAnnot();
});
annCv.addEventListener('pointermove', e => {
  if (!an || !an.cur) return;
  const p = annPt(e);
  if (an.cur.pts) an.cur.pts.push(p); else { an.cur.x1 = p.x; an.cur.y1 = p.y; }
  drawAnnot();
});
function endAnnStroke() {
  if (!an || !an.cur) return;
  const op = an.cur; an.cur = null;
  const tiny = !op.pts && Math.hypot(op.x1 - op.x0, op.y1 - op.y0) < 3;
  if (!tiny) pushOp(op); else drawAnnot();
}
annCv.addEventListener('pointerup', endAnnStroke);
annCv.addEventListener('pointercancel', endAnnStroke);

let textAt = null;
function startText(e, p) {
  const stg = document.getElementById('annStage'), sr = stg.getBoundingClientRect();
  textAt = p;
  annText.value = '';
  annText.style.left = (e.clientX - sr.left + stg.scrollLeft) + 'px';
  annText.style.top = (e.clientY - sr.top + stg.scrollTop) + 'px';
  annText.style.color = annColor;
  annText.style.fontSize = Math.max(14, Math.round(annSize * 0.9)) + 'px';
  annText.classList.remove('hidden');
  annText.focus();
}
function commitText() {
  const v = annText.value.trim();
  annText.classList.add('hidden');
  if (an && v && textAt) pushOp({ t:'text', x0: textAt.x, y0: textAt.y, text: v, fs: Math.max(12, imgPx(annSize) * 0.9), color: annColor });
  textAt = null;
}
annText.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
  if (e.key === 'Escape') { annText.classList.add('hidden'); textAt = null; }
  e.stopPropagation();
});
annText.addEventListener('blur', () => { if (!annText.classList.contains('hidden')) commitText(); });

document.querySelectorAll('#annTools [data-at]').forEach(b => {
  b.onclick = () => {
    annTool = b.dataset.at;
    document.querySelectorAll('#annTools [data-at]').forEach(x => x.classList.toggle('active', x === b));
    annCv.style.cursor = annTool === 'text' ? 'text' : 'crosshair';
  };
});
document.getElementById('annColor').oninput = e => { annColor = e.target.value; };
document.getElementById('annSize').oninput = e => { annSize = +e.target.value; };
document.getElementById('annUndo').onclick = undoAnnot;
document.getElementById('annCancel').onclick = closeAnnotate;
document.getElementById('annOk').onclick = () => {
  if (!an) return;
  if (!annText.classList.contains('hidden')) commitText();
  const out = an.done, cb = an.onApply;
  closeAnnotate();
  cb(out);
};
window.addEventListener('keydown', e => {
  if (!annModal.classList.contains('show')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoAnnot(); }
  else if (e.key === 'Escape' && annText.classList.contains('hidden')) closeAnnotate();
});

// ---------- 入口 ----------
// 对图片库里的某张图打码：直接替换这张图（所有模式里引用它的地方一起更新）
function annotatePhoto(id) {
  const p = photoById(id);
  if (!p) return;
  hidePop();
  openAnnotate(p.img, cv => {
    const url = cv.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
      p.img = img; p.url = url;
      renderTray(); render();
    };
    img.src = url;
  });
}
// 对当前整张结果打码，然后按所选格式导出
document.getElementById('annExportBtn').onclick = () => {
  if (!photos.length) { alert(t('alertNoPhoto')); return; }
  openAnnotate(composeCanvas('png'), cv => exportCanvas(cv));
};
