'use strict';
// 智能拼接模式：自动识别相邻截图的重叠区域与重复的顶栏/底栏，拼成无缝长图；接缝可拖动微调
// stitchSeam[下图id] = { aBot: 上图底部裁掉的像素, bTop: 下图顶部裁掉的像素, ok: 是否识别到重叠 }
let stitchSeam = {};
let selSeam = -1;          // 选中的接缝（下图在 stripOrder 中的下标）
let stitchStatus = '';

// ---------- 图像签名 ----------
const SIG_W = 120;
function makeSig(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i*4] * 3 + d[i*4+1] * 6 + d[i*4+2]) / 10;
  return { g, w, h };
}
// fine：横向 120 列、纵向保留原始行数（用于逐像素对齐）；coarse：等比缩到 120 宽（用于快速搜索）
function sigsOf(src) {
  const iw = src.videoWidth || src.width, ih = src.videoHeight || src.height;
  return {
    iw, ih,
    fine: makeSig(src, SIG_W, Math.min(ih, 16000)),
    coarse: makeSig(src, SIG_W, Math.max(1, Math.round(ih * SIG_W / iw))),
  };
}
function photoSigs(p) {
  if (!p._sig || p._sigImg !== p.img) { p._sig = sigsOf(p.img); p._sigImg = p.img; }
  return p._sig;
}
function rowDiff(A, ra, B, rb) {
  const w = A.w, a = ra * w, b = rb * w, ga = A.g, gb = B.g;
  let s = 0;
  for (let x = 0; x < w; x += 2) { const d = ga[a + x] - gb[b + x]; s += d < 0 ? -d : d; }
  return s / (w / 2);
}
function rowTexture(S, r) {
  const w = S.w, o = r * w; let mn = 255, mx = 0;
  for (let x = 0; x < w; x += 2) { const v = S.g[o + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
  return mx - mn;
}

// ---------- 识别一对截图 ----------
// 返回 { aBot, bTop, ok }，单位为原图像素。A 在上、B 在下
function pairSeam(SA, SB) {
  if (SA.iw !== SB.iw) return { aBot:0, bTop:0, hdr:0, ok:false };
  const A = SA.fine, B = SB.fine, H = Math.min(A.h, B.h), lim = Math.floor(H * 0.35);
  // 1) 顶栏/底栏：同一位置的行完全一样 → 固定栏
  let hdr = 0; while (hdr < lim && rowDiff(A, hdr, B, hdr) < 4) hdr++;
  let ftr = 0; while (ftr < lim && rowDiff(A, A.h - 1 - ftr, B, B.h - 1 - ftr) < 4) ftr++;
  const endA = A.h - ftr;
  // 2) 粗搜：在缩略签名里找最大的重叠 k（A 内容底部 k 行 == B 内容顶部 k 行）
  const cs = SA.coarse.h / SA.ih;
  const Ac = SA.coarse, Bc = SB.coarse;
  const hc = Math.ceil(hdr * cs) + 1, fc = Math.ceil(ftr * cs) + 1;
  const endAc = Ac.h - fc, LA = endAc - hc, LB = Bc.h - fc - hc;
  const THR = 9;
  // 评分 = 平均误差 + 证据不足惩罚（有纹理的行越多越可信），取最小
  const tex = new Uint8Array(Bc.h);
  for (let q = 0; q < Bc.h; q++) tex[q] = rowTexture(Bc, q) > 24 ? 1 : 0;
  let Sc = null, bestScore = Infinity;
  const maxK = Math.min(LA, LB), minK = Math.max(5, Math.round(LB * 0.05));
  for (let k = maxK; k >= minK; k--) {
    const limit = Math.min(THR, bestScore) * k; let sum = 0, j = 0;
    for (; j < k; j++) { sum += rowDiff(Ac, endAc - k + j, Bc, hc + j); if (sum > limit) break; }
    if (j < k) continue;
    let nt = 0; for (let q = 0; q < k; q++) nt += tex[hc + q];
    if (nt < 3) continue;
    const score = sum / k + 30 / nt;
    if (score < bestScore) { bestScore = score; Sc = endAc - k - hc; }   // 滚动量（粗）：A 行 = B 行 + Sc
  }
  if (Sc === null) return { aBot:ftr, bTop:hdr, hdr, ok:false };
  // 3) 精修：在原分辨率附近 ±(2/cs+3) 像素内找误差最小的滚动量
  const S0 = Math.round(Sc / cs), span = Math.ceil(2 / cs) + 3;
  let best = S0, bestD = Infinity;
  for (let S = S0 - span; S <= S0 + span; S++) {
    if (S < 0) continue;
    const R = Math.min(260, endA - hdr - S, B.h - ftr - hdr);
    if (R < 6) continue;
    let sum = 0, n = 0;
    for (let r = 0; r < R; r += 1) { sum += rowDiff(A, hdr + S + r, B, hdr + r); n++; }
    const d = sum / n;
    if (d < bestD) { bestD = d; best = S; }
  }
  const bTop = Math.max(hdr, Math.min(B.h - ftr - 1, endA - best));
  return { aBot:ftr, bTop, hdr, ok:true };
}

// ---------- 整组识别 ----------
function stitchList() { return stripOrder.map(id => photoById(id)).filter(Boolean); }
function autoStitch(all) {
  const list = stitchList();
  if (all) stitchSeam = {};
  let ok = 0;
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (!all && stitchSeam[b.id] && stitchSeam[b.id].prev === list[i-1].id) { if (stitchSeam[b.id].ok) ok++; continue; }
    const s = pairSeam(photoSigs(list[i-1]), photoSigs(b));
    s.prev = list[i-1].id;
    stitchSeam[b.id] = s;
    if (s.ok) ok++;
  }
  stitchStatus = list.length > 1 ? t('stitchInfo')(ok, list.length - 1) : t('stitchNone');
  return ok;
}
function runAutoStitch(all) {
  const el = document.getElementById('stitchInfo');
  if (el) el.textContent = t('stitchBusy');
  setTimeout(() => { autoStitch(all); render(); updateStitchPanel(); }, 30);
}

// stripSrc 用：某张图在拼接模式下保留的纵向范围
function stitchRange(p) {
  const k = stripOrder.indexOf(p.id), ih = p.img.height;
  const me = k > 0 ? stitchSeam[p.id] : null;
  const nxt = k >= 0 && k < stripOrder.length - 1 ? stitchSeam[stripOrder[k + 1]] : null;
  const top = me && me.prev === stripOrder[k - 1] ? me.bTop : 0;
  const bot = nxt && nxt.prev === p.id ? nxt.aBot : 0;
  const sy = Math.max(0, Math.min(ih - 1, Math.round(top)));
  return { sy, sh: Math.max(1, Math.round(ih - sy - Math.max(0, bot))) };
}

// ---------- 接缝 UI ----------
function drawSeams(c, rects) {
  const k = canvas.width / Math.max(1, canvas.getBoundingClientRect().width || canvas.width);
  for (let i = 1; i < rects.length; i++) {
    const y = rects[i].y, W = canvas.width, on = i === selSeam;
    const s = stitchSeam[rects[i].id];
    c.save();
    c.setLineDash([10 * k, 7 * k]);
    c.strokeStyle = on ? '#2ea36b' : (s && s.ok ? 'rgba(79,124,255,.85)' : 'rgba(229,72,77,.85)');
    c.lineWidth = (on ? 2.5 : 1.5) * k;
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = c.strokeStyle;
    const hw = 30 * k, hh = 12 * k;
    c.beginPath();
    if (c.roundRect) c.roundRect(W - hw - 8 * k, y - hh / 2, hw, hh, hh / 2); else c.rect(W - hw - 8 * k, y - hh / 2, hw, hh);
    c.fill();
    c.fillStyle = '#fff'; c.font = `${9 * k}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⇕', W - hw / 2 - 8 * k, y + 0.5 * k);
    c.restore();
  }
}
function seamHit(pt) {
  const rects = stripRects(canvas.width, canvas.height);
  const k = canvas.width / canvas.getBoundingClientRect().width, tol = 12 * k;
  for (let i = 1; i < rects.length; i++) if (Math.abs(pt.y - rects[i].y) < tol) return i;
  return -1;
}
function seamOf(i) {
  const b = stripOrder[i], a = stripOrder[i - 1];
  if (!stitchSeam[b] || stitchSeam[b].prev !== a) stitchSeam[b] = { aBot:0, bTop:0, ok:false, prev:a };
  return stitchSeam[b];
}
// 拖动：默认改上图的底部（接缝跟随指针）；Shift 改下图的顶部
function seamAdjust(i, deltaSrcPx, lower) {
  const s = seamOf(i);
  const a = photoById(stripOrder[i - 1]), b = photoById(stripOrder[i]);
  if (!a || !b) return;
  if (lower) s.bTop = Math.round(Math.max(0, Math.min(b.img.height - 8, s.bTop + deltaSrcPx)));
  else s.aBot = Math.round(Math.max(0, Math.min(a.img.height - 8, s.aBot + deltaSrcPx)));
}
function updateStitchPanel() {
  const info = document.getElementById('stitchInfo');
  if (!info) return;
  if (selSeam >= 1 && stripOrder[selSeam] != null && stitchSeam[stripOrder[selSeam]]) {
    const s = stitchSeam[stripOrder[selSeam]];
    info.textContent = t('stitchSeamSel')(selSeam, Math.round(s.aBot), Math.round(s.bTop));
  } else info.textContent = stripOrder.length > 1 ? (stitchStatus || '') : t('stitchNone');
}

// ---------- 放大镜 ----------
const magCv = document.getElementById('magnifier');
function showMagnifier(e, pt) {
  const r = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const S = 150, zoom = 3, sc = r.width / canvas.width;
  const R = S / (zoom * sc);
  magCv.width = S; magCv.height = S;
  const m = magCv.getContext('2d');
  m.fillStyle = '#fff'; m.fillRect(0, 0, S, S);
  m.imageSmoothingEnabled = false;
  m.drawImage(canvas, pt.x - R / 2, pt.y - R / 2, R, R, 0, 0, S, S);
  m.strokeStyle = 'rgba(46,163,107,.9)'; m.lineWidth = 1;
  m.beginPath(); m.moveTo(0, S / 2); m.lineTo(S, S / 2); m.stroke();
  let x = e.clientX - wr.left + 24, y = e.clientY - wr.top - S - 24;
  if (y < -wr.top + 4) y = e.clientY - wr.top + 24;
  if (e.clientX + S + 30 > window.innerWidth) x = e.clientX - wr.left - S - 24;
  magCv.style.left = x + 'px'; magCv.style.top = y + 'px';
  magCv.style.display = 'block';
}
function hideMagnifier() { magCv.style.display = 'none'; }

document.getElementById('stitchRedo').onclick = () => { selSeam = -1; runAutoStitch(true); };
document.getElementById('stitchReset').onclick = () => {
  stitchSeam = {}; selSeam = -1; stitchStatus = ''; render(); updateStitchPanel();
};
document.getElementById('stitchRecBtn').onclick = () => { videoWantTab = 'rec'; document.getElementById('vidInput').click(); };
window.addEventListener('keydown', e => {
  if (mode !== 'stitch' || selSeam < 1 || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (document.querySelector('#vidModal.show, #annModal.show, #cropModal.show, #cutModal.show')) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  seamAdjust(selSeam, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);   // ↑：接缝上移（多裁一点）
  render(); updateStitchPanel();
});
