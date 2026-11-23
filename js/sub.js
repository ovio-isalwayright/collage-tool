'use strict';
// 字幕模式
// ---------- 字幕模式：字幕区选框 ----------
const subCv = document.getElementById('subBandCanvas');
const subCtx = subCv.getContext('2d');
let subDrag = null;
function subEditTarget() {   // 选中了某个字幕条 → 编辑它的独立设置；否则编辑统一设置
  if (mode === 'sub' && selStrip >= 0 && stripOrder[selStrip] != null && !(selStrip === 0 && subFirstFull)) return stripOrder[selStrip];
  return null;
}
function subBandGet() {
  const id = subEditTarget(), o = id != null ? subOv[id] : null;
  return o ? { top:o.top, h:o.h } : { top:subTop, h:subH };
}
function subBandSet(top, h) {
  const id = subEditTarget();
  if (id != null) subOv[id] = { top, h }; else { subTop = top; subH = h; }
}
function subRefPhoto() {
  const tid = subEditTarget();
  if (tid != null) return photoById(tid);
  const id = stripOrder.length > 1 ? stripOrder[1] : stripOrder[0];   // 优先拿第二张（第一张通常是完整画面）作参考
  return id != null ? photoById(id) : null;
}
function subNativeWidth() {   // 字幕 / 拼接长图按原截图宽度导出
  const first = stripOrder.map(id => photoById(id)).filter(Boolean)[0];
  return first ? Math.max(200, Math.round(stripSrc(first, 0).sw)) : 1000;
}
function updateSubPanel() {
  updateSubTextRow();
  const ph = subRefPhoto();
  const edit = document.getElementById('subEdit');
  const info = document.getElementById('subInfo');
  const tid = subEditTarget();
  document.getElementById('subTargetRow').classList.toggle('hidden', tid == null);
  document.getElementById('subOvReset').classList.toggle('hidden', tid == null || !subOv[tid]);
  if (!ph) {
    subCv.style.display = 'none';
    if (!edit.querySelector('.tip')) { const p = document.createElement('span'); p.className = 'tip'; edit.appendChild(p); }
    edit.querySelector('.tip').textContent = t('subNeed');
    info.textContent = '';
    return;
  }
  const tp = edit.querySelector('.tip'); if (tp) tp.remove();
  subCv.style.display = 'block';
  const band = subBandGet();
  const iw = ph.img.width, ih = ph.img.height;
  const availW = Math.max((edit.clientWidth || 220) - 16, 80);
  const w = Math.round(Math.min(availW, (isMobile() ? 130 : 220) * iw / ih)), h = Math.round(w * ih / iw);
  if (subCv.width !== w) subCv.width = w;
  if (subCv.height !== h) subCv.height = h;
  const c = subCtx;
  c.clearRect(0, 0, w, h);
  c.drawImage(ph.img, 0, 0, w, h);
  const y0 = band.top * h, y1 = (band.top + band.h) * h;
  c.fillStyle = 'rgba(15,20,35,.55)';
  c.fillRect(0, 0, w, y0); c.fillRect(0, y1, w, h - y1);
  c.strokeStyle = '#4f7cff'; c.lineWidth = 2;
  c.strokeRect(1, y0, w - 2, Math.max(y1 - y0, 1));
  c.fillStyle = '#4f7cff';
  [y0, y1].forEach(y => { c.beginPath(); c.roundRect ? c.roundRect(w/2 - 16, y - 3, 32, 6, 3) : c.rect(w/2 - 16, y - 3, 32, 6); c.fill(); });
  const n = Math.max(0, stripOrder.length - (subFirstFull ? 1 : 0));
  info.textContent = (tid != null ? t('subEditing')(selStrip + 1) : t('subEditingAll')) + ' · ' + t('subInfo')(n, Math.round(band.h * ih));
  if (stripOrder.length) info.textContent += ' · ' + t('subOutW')(subNativeWidth());
  const sl = document.getElementById('subHSlider');
  if (document.activeElement !== sl) sl.value = Math.round(band.h * 100);
  document.getElementById('subHVal').textContent = Math.round(band.h * 100) + '%';
}
function subPt(e) {
  const r = subCv.getBoundingClientRect();
  return (e.clientY - r.top) / r.height;
}
subCv.addEventListener('pointerdown', e => {
  if (!subRefPhoto()) return;
  subCv.setPointerCapture(e.pointerId);
  const y = subPt(e), tol = 10 / subCv.getBoundingClientRect().height;
  const b = subBandGet(), top = b.top, bot = b.top + b.h;
  if (Math.abs(y - top) < tol) subDrag = { type:'top' };
  else if (Math.abs(y - bot) < tol) subDrag = { type:'bot' };
  else if (y > top && y < bot) subDrag = { type:'move', dy: y - top };
  else { // 点框外：以点击处为新字幕条的顶边，保持当前高度
    subBandSet(Math.max(0, Math.min(1 - b.h, y)), b.h); subDrag = { type:'move', dy: 0 }; render();
  }
});
subCv.addEventListener('pointermove', e => {
  if (!subDrag) return;
  const b = subBandGet();
  const y = Math.max(0, Math.min(1, subPt(e))), minH = 0.02;
  if (subDrag.type === 'top') { const bot = b.top + b.h; const nt = Math.min(y, bot - minH); subBandSet(nt, bot - nt); }
  else if (subDrag.type === 'bot') { subBandSet(b.top, Math.max(minH, y - b.top)); }
  else { subBandSet(Math.max(0, Math.min(1 - b.h, y - subDrag.dy)), b.h); }
  render();
});
['pointerup', 'pointercancel'].forEach(ev => subCv.addEventListener(ev, () => { subDrag = null; }));
document.getElementById('subHSlider').oninput = e => {
  const b = subBandGet(), h = +e.target.value / 100;
  subBandSet(Math.min(b.top, 1 - h), h); render();
};
document.getElementById('subOvReset').onclick = () => { const id = subEditTarget(); if (id != null) delete subOv[id]; render(); };
document.getElementById('subUnsel').onclick = () => { selStrip = -1; render(); };
document.getElementById('subFirstFull').onchange = e => { subFirstFull = e.target.checked; selStrip = -1; render(); };
document.getElementById('subGapSlider').oninput = e => {
  subGap = +e.target.value; document.getElementById('subGapVal').textContent = subGap; render();
};

// ---------- 字幕增强：手动台词、分隔线、外边框、比例参考框 ----------
let subText = {};                       // {photoId: '台词'}
let subFont = 4.5, subFontColor = '#ffffff', subLineW = 0, subLineColor = '#ffffff', subBorder = 0, subRef = 'none';
function drawSubExtras(c, rects, W, H, showUI) {
  // 分隔线：画在相邻两条之间（有条间距时画在间距正中）
  if (subLineW > 0) {
    c.save(); c.fillStyle = subLineColor;
    for (let i = 1; i < rects.length; i++) {
      const y = (rects[i - 1].y + rects[i - 1].h + rects[i].y) / 2;
      c.fillRect(rects[i].x, y - subLineW / 2, rects[i].w, subLineW);
    }
    c.restore();
  }
  // 手动台词
  rects.forEach((r, i) => {
    const txt = subText[r.id];
    if (!txt) return;
    const full = i === 0 && subFirstFull && !stripCrops[r.id];
    const fs = Math.max(10, r.w * subFont / 100);
    const cy = full ? r.y + r.h * (subTop + subH / 2) : r.y + r.h / 2;
    c.save();
    c.font = `600 ${fs}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = fs * 0.16; c.strokeStyle = 'rgba(0,0,0,.85)';
    const lines = txt.split('\n');
    lines.forEach((ln, k) => {
      const y = cy + (k - (lines.length - 1) / 2) * fs * 1.2;
      c.strokeText(ln, r.x + r.w / 2, y, r.w * 0.94);
      c.fillStyle = subFontColor; c.fillText(ln, r.x + r.w / 2, y, r.w * 0.94);
    });
    c.restore();
  });
  // 比例参考框（只在编辑时显示，不导出）：看发到小红书/朋友圈时首屏能露出多少
  if (showUI && subRef !== 'none' && rects.length) {
    const [a, b] = subRef.split(':').map(Number);
    const m = stripMargin(), w = W - 2 * m, h = Math.min(H - m, w * b / a);
    const k = canvas.width / Math.max(1, canvas.getBoundingClientRect().width || canvas.width);
    c.save();
    c.setLineDash([12 * k, 8 * k]); c.lineWidth = 2 * k; c.strokeStyle = '#ff9f0a';
    c.strokeRect(m + k, m + k, w - 2 * k, h - 2 * k);
    c.setLineDash([]);
    c.fillStyle = '#ff9f0a'; c.font = `bold ${13 * k}px sans-serif`; c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(subRef, m + w - 6 * k, m + h - 6 * k);
    c.restore();
  }
}
function updateSubTextRow() {
  const row = document.getElementById('subTextRow');
  const id = mode === 'sub' && selStrip >= 0 ? stripOrder[selStrip] : null;
  row.classList.toggle('hidden', id == null);
  const inp = document.getElementById('subTextInput');
  if (id != null && document.activeElement !== inp) inp.value = subText[id] || '';
}
document.getElementById('subTextInput').oninput = e => {
  const id = selStrip >= 0 ? stripOrder[selStrip] : null;
  if (id == null) return;
  if (e.target.value) subText[id] = e.target.value; else delete subText[id];
  render();
};
[['subFontSlider', 'subFontVal', v => subFont = v],
 ['subLineSlider', 'subLineVal', v => subLineW = v],
 ['subBorderSlider', 'subBorderVal', v => subBorder = v]].forEach(([id, vid, set]) => {
  const el = document.getElementById(id);
  el.oninput = () => { set(+el.value); document.getElementById(vid).textContent = el.value; render(); };
});
document.getElementById('subFontColor').oninput = e => { subFontColor = e.target.value; render(); };
document.getElementById('subLineColor').oninput = e => { subLineColor = e.target.value; render(); };
document.getElementById('subRefSel').onchange = e => { subRef = e.target.value; render(); };
