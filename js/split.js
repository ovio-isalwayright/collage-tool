'use strict';
// 分割模式
// ---------- 分割模式（第 4 种模式：在主画布上切图，按张数 / 按比例 / 宫格，可智能避开文字） ----------
let splitSrc = null, splitCrop = null;      // 源图 id 与可选裁剪区域
let splitMethod = 'count', splitDir = 'v', splitSmart = true;
let splitCount = 3, splitRows = 3, splitCols = 3, splitRatio = '3:4';
let splitXs = [0, 1], splitYs = [0, 1];     // 分割线位置（0~1 比例）
let splitProf = null;                       // 智能切割用的行/列“起伏度”缓存
let splitFlash = '', splitFlashTimer = 0;
let splitSel = new Set();                   // 选中的块（按编号下标）；为空 = 全部导出
let splitRegion = null, regionRatio = 'free';   // 框选区域 {x,y,w,h}（0~1 比例）与锁定比例
function evenCuts(n) { return Array.from({ length: n + 1 }, (_, i) => i / n); }
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(+v) || lo)); }
function splitSource() {
  const ph = splitSrc != null ? photoById(splitSrc) : null;
  if (!ph) return null;
  return { ph, img: ph.img, cr: splitCrop || { sx:0, sy:0, sw:ph.img.width, sh:ph.img.height } };
}
// 预览画布尺寸：限制总像素，避免超长图超出手机浏览器画布上限（导出时仍用原图像素）
function splitPreviewSize() {
  const s = splitSource();
  if (!s) return [900, 600];
  const { sw, sh } = s.cr;
  const k = Math.min(1, Math.sqrt(8e6 / (sw * sh)), 16000 / Math.max(sw, sh));
  return [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))];
}
function setSplitSource(id, crop) {
  splitSrc = id; splitCrop = crop || null; splitProf = null; splitRegion = null;
  const s = splitSource();
  if (s) {
    // 按图片形状给默认值：竖图上下切，横图左右切；长图默认每张约 3:4 / 1:1
    const ar = s.cr.sh / s.cr.sw;
    splitDir = ar >= 1 ? 'v' : 'h';
    if (ar >= 2) splitCount = clampInt(ar * 3 / 4, 2, 50);
    else if (ar <= 0.5) splitCount = clampInt(1 / ar, 2, 50);
  }
  stage.scrollTop = 0; stage.scrollLeft = 0;
  renderLibrary();
  layoutSplit();
}
// 从其它模式的弹出菜单跳到分割模式
function openSplit(id, crop) { setSplitSource(id, crop); setMode('split'); }
// 按比例：每张固定宽高比，最后一张是余下部分（太窄就并入上一张）
function ratioCuts(len, piece) {
  const full = Math.floor(len / piece), rem = len / piece - full;
  if (full < 1) return [0, 1];
  const cuts = [0];
  for (let i = 1; i <= full; i++) cuts.push(Math.min(1, i * piece / len));
  if (rem < 0.15) cuts[cuts.length - 1] = 1; else cuts.push(1);
  return cuts;
}
function layoutSplit() {
  const s = splitSource();
  splitXs = [0, 1]; splitYs = [0, 1];
  splitSel.clear();
  if (s && splitMethod === 'region') {
    if (!splitRegion) splitRegion = defaultRegion();
  } else if (s) {
    const { sw, sh } = s.cr;
    if (splitMethod === 'grid') { splitYs = evenCuts(splitRows); splitXs = evenCuts(splitCols); }
    else if (splitMethod === 'count') { if (splitDir === 'v') splitYs = evenCuts(splitCount); else splitXs = evenCuts(splitCount); }
    else {
      const [rw, rh] = splitRatio.split(':').map(Number);
      if (splitDir === 'v') splitYs = ratioCuts(sh, sw * rh / rw); else splitXs = ratioCuts(sw, sh * rw / rh);
    }
    // 宫格保持严格等分，只有按张数/按比例才智能避开文字
    if (splitSmart && splitMethod !== 'grid') { const p = splitProfiles(s); splitYs = snapCuts(splitYs, p.rows); splitXs = snapCuts(splitXs, p.cols); }
  }
  updateSidebar(); render();
}
// 每一行（列）的亮度标准差：空白/纯色行≈0，有文字或图案的行较大
function splitProfiles(s) {
  const key = s.ph.id + ':' + s.cr.sx + ',' + s.cr.sy + ',' + s.cr.sw + ',' + s.cr.sh;
  if (splitProf && splitProf.key === key) return splitProf;
  const { img, cr } = s;
  const prof = (w, h, alongRows) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently:true });
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    const n = alongRows ? h : w, m = alongRows ? w : h, raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, sum2 = 0;
      for (let j = 0; j < m; j++) {
        const p = ((alongRows ? i : j) * w + (alongRows ? j : i)) * 4;
        const L = 0.299*d[p] + 0.587*d[p+1] + 0.114*d[p+2];
        sum += L; sum2 += L * L;
      }
      const mean = sum / m;
      raw[i] = Math.sqrt(Math.max(0, sum2 / m - mean * mean));
    }
    // 取相邻 ±2 行最大值：保证切线上下一小段都是空白
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let mx = 0; for (let k = Math.max(0, i-2); k <= Math.min(n-1, i+2); k++) mx = Math.max(mx, raw[k]); out[i] = mx; }
    return out;
  };
  splitProf = {
    key,
    rows: prof(Math.max(1, Math.min(cr.sw, 240)), Math.max(1, Math.min(cr.sh, 6000)), true),
    cols: prof(Math.max(1, Math.min(cr.sw, 6000)), Math.max(1, Math.min(cr.sh, 240)), false),
  };
  return splitProf;
}
// 把每条分割线挪到附近最“空”的位置（空白区的中间）；附近没有明显空白就不动，照片类图片保持均分
function snapCuts(cuts, prof) {
  if (cuts.length <= 2) return cuts;
  const n = prof.length, out = cuts.slice(), FLAT = 3;
  for (let i = 1; i < cuts.length - 1; i++) {
    const gap = Math.min(cuts[i] - out[i-1], cuts[i+1] - cuts[i]);
    const j0 = Math.min(n - 1, Math.round(cuts[i] * n)), win = Math.max(1, Math.round(gap * 0.2 * n));
    const lo = Math.max(1, j0 - win), hi = Math.min(n - 2, j0 + win);
    let best = j0, bestScore = Infinity;
    for (let j = lo; j <= hi; j++) {
      const sc = prof[j] + 2 * Math.abs(j - j0) / win;
      if (sc < bestScore) { bestScore = sc; best = j; }
    }
    if (prof[best] < FLAT) {
      let a = best, b = best;                       // 落在空白带里 → 取这段空白的中间
      while (a > lo && prof[a-1] < FLAT) a--;
      while (b < hi && prof[b+1] < FLAT) b++;
      out[i] = ((a + b) / 2 + 0.5) / n;
    } else if (prof[best] < prof[j0] * 0.5) out[i] = (best + 0.5) / n;
  }
  return out;
}
// 分割线换算成原图像素边界
function splitEdges() {
  const { cr } = splitSource();
  return {
    xs: splitXs.map(f => cr.sx + Math.round(f * cr.sw)),
    ys: splitYs.map(f => cr.sy + Math.round(f * cr.sh)),
  };
}
function renderSplitScene(c, W, H) {
  const s = splitSource();
  if (!s) {
    c.fillStyle = '#f0f1f3'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#a0a4ae'; c.font = '26px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t('splitNoSrc'), W/2, H/2);
    return;
  }
  c.drawImage(s.img, s.cr.sx, s.cr.sy, s.cr.sw, s.cr.sh, 0, 0, W, H);
  const k = W / Math.max(1, parseFloat(canvas.style.width) || W);   // 1 个屏幕像素对应的画布像素，保证线条粗细在屏幕上一致
  if (splitMethod === 'region') { drawRegion(c, W, H, k); return; }
  // 选了部分块：未选中的压暗，选中的描边
  if (splitSel.size) {
    const cols0 = splitXs.length - 1;
    for (let r = 0; r < splitYs.length - 1; r++) for (let q = 0; q < cols0; q++) {
      const x = splitXs[q]*W, y = splitYs[r]*H, w = (splitXs[q+1] - splitXs[q])*W, h = (splitYs[r+1] - splitYs[r])*H;
      if (splitSel.has(r * cols0 + q)) {
        c.strokeStyle = ACC; c.lineWidth = 4*k; c.strokeRect(x + 2*k, y + 2*k, w - 4*k, h - 4*k);
      } else { c.fillStyle = 'rgba(15,18,28,.55)'; c.fillRect(x, y, w, h); }
    }
  }
  const line = (x1, y1, x2, y2) => {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 4*k; c.stroke();
    c.setLineDash([10*k, 6*k]); c.strokeStyle = '#ffffff'; c.lineWidth = 2*k; c.stroke(); c.setLineDash([]);
  };
  for (let i = 1; i < splitXs.length - 1; i++) line(splitXs[i]*W, 0, splitXs[i]*W, H);
  for (let i = 1; i < splitYs.length - 1; i++) line(0, splitYs[i]*H, W, splitYs[i]*H);
  const rows = splitYs.length - 1, cols = splitXs.length - 1;
  // 编号（从左到右、从上到下）
  c.font = `700 ${13*k}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const pw = (splitXs[q+1] - splitXs[q]) * W, ph = (splitYs[r+1] - splitYs[r]) * H;
    if (Math.min(pw, ph) < 30*k || rows * cols === 1) continue;
    const cx = splitXs[q]*W + 20*k, cy = splitYs[r]*H + 20*k;   // 编号放在每块左上角，不挡内容
    c.fillStyle = splitSel.has(r * cols + q) ? ACC : 'rgba(20,24,35,.62)'; c.beginPath(); c.arc(cx, cy, 13*k, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.fillText(String(r * cols + q + 1), cx, cy + k);
  }
  // 拖动手柄
  c.fillStyle = ACC; c.strokeStyle = '#fff'; c.lineWidth = 2*k;
  // 手柄放在当前可视区域的中线上，长图滚到哪都能抓到
  const cb = canvas.getBoundingClientRect(), sb = stage.getBoundingClientRect();
  const hx = cb.width ? Math.min(W - 16*k, Math.max(16*k, (sb.left + sb.width/2 - cb.left) * k)) : W/2;
  const hy = cb.height ? Math.min(H - 16*k, Math.max(16*k, (sb.top + sb.height/2 - cb.top) * k)) : H/2;
  for (let i = 1; i < splitXs.length - 1; i++) { c.beginPath(); c.arc(splitXs[i]*W, hy, 8*k, 0, 7); c.fill(); c.stroke(); }
  for (let i = 1; i < splitYs.length - 1; i++) { c.beginPath(); c.arc(hx, splitYs[i]*H, 8*k, 0, 7); c.fill(); c.stroke(); }
}
function splitHit(pt, k) {
  if (!splitSource()) return null;
  const W = canvas.width, H = canvas.height;
  let best = null, bd = 14 * k;
  for (let i = 1; i < splitXs.length - 1; i++) { const d = Math.abs(pt.x - splitXs[i]*W); if (d < bd) { bd = d; best = { type:'splitline', axis:'x', i }; } }
  for (let i = 1; i < splitYs.length - 1; i++) { const d = Math.abs(pt.y - splitYs[i]*H); if (d < bd) { bd = d; best = { type:'splitline', axis:'y', i }; } }
  return best;
}
// ---- 轻点选块 ----
function toggleSplitPiece(pt) {
  if (!splitSource()) return;
  const fx = pt.x / canvas.width, fy = pt.y / canvas.height, cols = splitXs.length - 1;
  if ((splitYs.length - 1) * cols <= 1) return;
  const q = splitXs.findIndex((x, i) => i < cols && fx >= x && fx < splitXs[i+1]);
  const r = splitYs.findIndex((y, i) => i < splitYs.length - 1 && fy >= y && fy < splitYs[i+1]);
  if (q < 0 || r < 0) return;
  const idx = r * cols + q;
  if (splitSel.has(idx)) splitSel.delete(idx); else splitSel.add(idx);
  updateSidebar(); render();
}
// ---- 框选 ----
const CORNERS = ['nw', 'ne', 'sw', 'se'];
// 默认选框：当前可视区域中间 70%，按锁定比例收缩
function defaultRegion() {
  const cb = canvas.getBoundingClientRect(), sb = stage.getBoundingClientRect();
  let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
  if (mode === 'split' && cb.width && cb.height) {
    x0 = Math.max(0, (sb.left - cb.left) / cb.width); x1 = Math.min(1, (sb.right - cb.left) / cb.width);
    y0 = Math.max(0, (sb.top - cb.top) / cb.height); y1 = Math.min(1, (sb.bottom - cb.top) / cb.height);
    if (x1 - x0 < 0.05) { x0 = 0; x1 = 1; }
    if (y1 - y0 < 0.05) { y0 = 0; y1 = 1; }
  }
  const w = (x1 - x0) * 0.7, h = (y1 - y0) * 0.7;
  return fitRegionRatio({ x: x0 + (x1 - x0) * 0.15, y: y0 + (y1 - y0) * 0.15, w, h });
}
function ratioNum() { if (regionRatio === 'free') return 0; const [a, b] = regionRatio.split(':').map(Number); return a / b; }
// 按锁定比例（像素宽:高）收缩选框，保持中心不动
function fitRegionRatio(r) {
  const t0 = ratioNum(), s = splitSource();
  if (!t0 || !s) return r;
  const { sw, sh } = s.cr;
  let wPx = r.w * sw, hPx = r.h * sh;
  if (wPx / hPx > t0) wPx = hPx * t0; else hPx = wPx / t0;
  const w = wPx / sw, h = hPx / sh, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: Math.max(0, Math.min(1 - w, cx - w/2)), y: Math.max(0, Math.min(1 - h, cy - h/2)), w, h };
}
function regionPx() { const r = splitRegion; return { x: r.x*canvas.width, y: r.y*canvas.height, w: r.w*canvas.width, h: r.h*canvas.height }; }
function regionCorner(R, k) {
  return { nw:[R.x, R.y], ne:[R.x + R.w, R.y], sw:[R.x, R.y + R.h], se:[R.x + R.w, R.y + R.h] }[k];
}
function regionHit(pt, k) {
  if (!splitSource() || !splitRegion) return null;
  const R = regionPx();
  for (const cn of CORNERS) {
    const [x, y] = regionCorner(R, cn);
    if (Math.hypot(pt.x - x, pt.y - y) < 18 * k) {
      const opp = { nw:'se', ne:'sw', sw:'ne', se:'nw' }[cn];
      return { type:'rresize', corner: cn, o: regionCorner(R, opp) };
    }
  }
  if (pt.x >= R.x && pt.x <= R.x + R.w && pt.y >= R.y && pt.y <= R.y + R.h)
    return { type:'rmove', dx: pt.x - R.x, dy: pt.y - R.y };
  return null;
}
function drawRegion(c, W, H, k) {
  if (!splitRegion) return;
  const R = regionPx();
  c.fillStyle = 'rgba(15,18,28,.55)';
  c.fillRect(0, 0, W, R.y); c.fillRect(0, R.y + R.h, W, H - R.y - R.h);
  c.fillRect(0, R.y, R.x, R.h); c.fillRect(R.x + R.w, R.y, W - R.x - R.w, R.h);
  c.strokeStyle = ACC; c.lineWidth = 2*k; c.strokeRect(R.x, R.y, R.w, R.h);
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = k;      // 三分线
  for (let i = 1; i <= 2; i++) {
    c.beginPath(); c.moveTo(R.x + R.w*i/3, R.y); c.lineTo(R.x + R.w*i/3, R.y + R.h); c.stroke();
    c.beginPath(); c.moveTo(R.x, R.y + R.h*i/3); c.lineTo(R.x + R.w, R.y + R.h*i/3); c.stroke();
  }
  c.fillStyle = ACC; c.strokeStyle = '#fff'; c.lineWidth = 2*k;
  CORNERS.forEach(cn => { const [x, y] = regionCorner(R, cn); c.fillRect(x - 7*k, y - 7*k, 14*k, 14*k); c.strokeRect(x - 7*k, y - 7*k, 14*k, 14*k); });
  // 尺寸标签
  const e = regionEdges(), label = `${e.w} × ${e.h}`;
  c.font = `600 ${12*k}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
  const tw = c.measureText(label).width + 14*k, ly = R.y > 30*k ? R.y - 26*k : R.y + 8*k;
  c.fillStyle = ACC; c.fillRect(R.x, ly, tw, 20*k);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, R.x + 7*k, ly + 10*k);
}
// 选框换算成原图像素
function regionEdges() {
  const { cr } = splitSource(), r = splitRegion;
  const x = cr.sx + Math.round(r.x * cr.sw), y = cr.sy + Math.round(r.y * cr.sh);
  return { x, y, w: Math.max(1, Math.round(r.w * cr.sw)), h: Math.max(1, Math.round(r.h * cr.sh)) };
}
function regionDrag(pt) {
  const W = canvas.width, H = canvas.height, MIN = 12 * W / Math.max(1, parseFloat(canvas.style.width) || W);
  if (drag.type === 'rmove') {
    const R = regionPx();
    const x = Math.max(0, Math.min(W - R.w, pt.x - drag.dx)), y = Math.max(0, Math.min(H - R.h, pt.y - drag.dy));
    splitRegion = { ...splitRegion, x: x / W, y: y / H };
    return;
  }
  // 缩放：对角固定，拖动的角跟随指针；锁定比例时按比例取较大边并限制在图内
  const [ox, oy] = drag.o, right = drag.corner.includes('e'), down = drag.corner.includes('s');
  let w = Math.max(MIN, right ? pt.x - ox : ox - pt.x), h = Math.max(MIN, down ? pt.y - oy : oy - pt.y);
  const maxW = right ? W - ox : ox, maxH = down ? H - oy : oy;
  const t0 = ratioNum();
  if (t0) {
    w = Math.max(w, h * t0); h = w / t0;
    if (w > maxW) { w = maxW; h = w / t0; }
    if (h > maxH) { h = maxH; w = h * t0; }
  } else { w = Math.min(w, maxW); h = Math.min(h, maxH); }
  const x = right ? ox : ox - w, y = down ? oy : oy - h;
  splitRegion = { x: x / W, y: y / H, w: w / W, h: h / H };
}
function splitPointerMove(e, pt) {
  if (!drag) {
    const k = canvas.width / canvas.getBoundingClientRect().width;
    const scrollable = stage.scrollHeight > stage.clientHeight + 1 || stage.scrollWidth > stage.clientWidth + 1;
    const free = scrollable ? 'grab' : 'default';
    if (splitMethod === 'region') {
      const h = regionHit(pt, k);
      canvas.style.cursor = !h ? free : h.type === 'rmove' ? 'move' : (h.corner === 'nw' || h.corner === 'se' ? 'nwse-resize' : 'nesw-resize');
    } else {
      const h = splitHit(pt, k);
      canvas.style.cursor = h ? (h.axis === 'x' ? 'ew-resize' : 'ns-resize') : (splitSource() ? 'pointer' : free);
    }
    return;
  }
  if (drag.type === 'splitpan') {
    stage.scrollLeft = drag.sl - (e.clientX - drag.x);
    stage.scrollTop = drag.st - (e.clientY - drag.y);
    render();
    return;
  }
  if (drag.type === 'rmove' || drag.type === 'rresize') { regionDrag(pt); updateSplitPanel(); render(); return; }
  const arr = drag.axis === 'x' ? splitXs : splitYs, i = drag.i, MIN = 0.01;
  const f = drag.axis === 'x' ? pt.x / canvas.width : pt.y / canvas.height;
  arr[i] = Math.max(arr[i-1] + MIN, Math.min(arr[i+1] - MIN, f));
  updateSplitPanel(); render();
}
stage.addEventListener('scroll', () => { if (mode === 'split') render(); });   // 手柄跟随可视区域
function setVal(id, v) { const el = document.getElementById(id); if (el !== document.activeElement) el.value = v; }
function updateSplitPanel() {
  const s = splitSource();
  const box = document.getElementById('splitSrcBox');
  box.innerHTML = s ? `<img src="${s.ph.url}"><span>${s.cr.sw} × ${s.cr.sh} px</span>` : `<span>${t('splitNoSrc')}</span>`;
  document.querySelectorAll('#splitMethodTabs button').forEach(b => b.classList.toggle('active', b.dataset.sm === splitMethod));
  document.querySelectorAll('#splitDirTabs button').forEach(b => b.classList.toggle('active', b.dataset.sdir === splitDir));
  document.getElementById('smCountRow').classList.toggle('hidden', splitMethod !== 'count');
  document.getElementById('smRatioRow').classList.toggle('hidden', splitMethod !== 'ratio');
  document.getElementById('smGridRow').classList.toggle('hidden', splitMethod !== 'grid');
  const isRegion = splitMethod === 'region';
  document.getElementById('smRegionRow').classList.toggle('hidden', !isRegion);
  document.getElementById('splitDirTabs').classList.toggle('hidden', splitMethod === 'grid' || isRegion);
  document.querySelector('.split-smart').classList.toggle('hidden', splitMethod === 'grid' || isRegion);
  document.getElementById('regionAllBtn').classList.toggle('hidden', !isRegion);
  document.getElementById('splitClearSel').classList.toggle('hidden', isRegion || !splitSel.size);
  document.getElementById('splitResetBtn').textContent = isRegion ? t('regionReset') : t('splitEven');
  document.getElementById('regionRatioSel').value = regionRatio;
  document.getElementById('splitTip').textContent = isRegion ? t('regionTip') : t('splitTip');
  setVal('splitCount', splitCount); setVal('splitRows', splitRows); setVal('splitCols', splitCols);
  document.getElementById('splitRatioSel').value = splitRatio;
  document.getElementById('splitSmart').checked = splitSmart;
  document.querySelectorAll('#splitPresets button').forEach(b => b.classList.toggle('active', b.dataset.rc === `${splitRows},${splitCols}`));
  const info = document.getElementById('splitInfo');
  if (splitFlash) { info.textContent = splitFlash; return; }
  if (!s) { info.textContent = ''; return; }
  if (isRegion) { const r = splitRegion && regionEdges(); info.textContent = r ? t('regionInfo')(r.w, r.h) : ''; return; }
  if (splitSel.size) { info.textContent = t('splitSelInfo')(splitSel.size, (splitXs.length - 1) * (splitYs.length - 1)); return; }
  const e = splitEdges(), ws = new Set(), hs = new Set();
  for (let q = 0; q < e.xs.length - 1; q++) ws.add(e.xs[q+1] - e.xs[q]);
  for (let r = 0; r < e.ys.length - 1; r++) hs.add(e.ys[r+1] - e.ys[r]);
  const n = (e.xs.length - 1) * (e.ys.length - 1);
  info.textContent = t('splitInfo')(n, ws.size === 1 && hs.size === 1 ? t('splitSizeEach')([...ws][0], [...hs][0]) : t('splitSizeVar'));
}
document.querySelectorAll('#splitMethodTabs button').forEach(b => { b.onclick = () => { splitMethod = b.dataset.sm; layoutSplit(); }; });
document.querySelectorAll('#splitDirTabs button').forEach(b => { b.onclick = () => { splitDir = b.dataset.sdir; layoutSplit(); }; });
document.getElementById('splitCount').oninput = e => { if (e.target.value !== '') { splitCount = clampInt(e.target.value, 1, 50); layoutSplit(); } };
document.getElementById('splitCount').onblur = () => updateSplitPanel();
document.querySelectorAll('#smCountRow [data-step]').forEach(b => {
  b.onclick = ev => { ev.preventDefault(); splitCount = clampInt(splitCount + +b.dataset.step, 1, 50); layoutSplit(); };
});
document.getElementById('splitRows').oninput = e => { if (e.target.value !== '') { splitRows = clampInt(e.target.value, 1, 20); layoutSplit(); } };
document.getElementById('splitCols').oninput = e => { if (e.target.value !== '') { splitCols = clampInt(e.target.value, 1, 20); layoutSplit(); } };
document.querySelectorAll('#splitPresets button').forEach(b => {
  b.onclick = () => { [splitRows, splitCols] = b.dataset.rc.split(',').map(Number); layoutSplit(); };
});
document.getElementById('splitRatioSel').onchange = e => { splitRatio = e.target.value; layoutSplit(); };
document.getElementById('splitSmart').onchange = e => { splitSmart = e.target.checked; layoutSplit(); };
document.getElementById('splitResetBtn').onclick = () => { if (splitMethod === 'region') splitRegion = null; layoutSplit(); };
document.getElementById('regionAllBtn').onclick = () => { splitRegion = fitRegionRatio({ x:0, y:0, w:1, h:1 }); updateSidebar(); render(); };
document.getElementById('regionRatioSel').onchange = e => {
  regionRatio = e.target.value;
  if (splitRegion) splitRegion = fitRegionRatio(splitRegion);
  updateSidebar(); render();
};
document.getElementById('splitClearSel').onclick = () => { splitSel.clear(); updateSidebar(); render(); };
function cutPiece(img, sx, sy, w, h, fmt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  if (fmt === 'jpg') { c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, w, h); }  // JPG 无透明，补白底
  c2.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return cv;
}
// 切出要导出的块（行优先顺序），返回 [{r, c, idx, cv}]：框选 → 只有选区；选了块 → 只要选中的；否则全部
function splitPieces(fmt) {
  const s = splitSource();
  if (splitMethod === 'region') {
    const g = regionEdges();
    return [{ r:0, c:0, idx:0, region:true, w:g.w, h:g.h, cv: cutPiece(s.img, g.x, g.y, g.w, g.h, fmt) }];
  }
  const e = splitEdges(), out = [], cols = e.xs.length - 1;
  for (let r = 0; r < e.ys.length - 1; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c;
    if (splitSel.size && !splitSel.has(idx)) continue;
    const sx = e.xs[c], sy = e.ys[r], w = Math.max(1, e.xs[c+1] - sx), h = Math.max(1, e.ys[r+1] - sy);
    out.push({ r, c, idx, cv: cutPiece(s.img, sx, sy, w, h, fmt) });
  }
  return out;
}
function canvasBlob(cv, fmt) {
  return new Promise(res => cv.toBlob(res, fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.92));
}
// 极简 ZIP（仅存储不压缩，PNG/JPG 本身已压缩），免外部依赖
const CRC_TABLE = (() => {
  const tb = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; }
  return tb;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files) {   // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = [];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh, name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + size;
  });
  const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type:'application/zip' });
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function splitDownload() {
  if (!splitSource()) { alert(t('splitNoSrc')); return; }
  const fmt = document.getElementById('fmtSel').value;
  if (fmt === 'pdf') {   // 每块一页
    const ps = splitPieces('jpg');
    downloadBlob(await makePdf(ps.map(p => p.cv)), `split_${ps.length}_${Date.now()}.pdf`);
    return;
  }
  const pieces = splitPieces(fmt), stamp = Date.now();
  const total = (splitXs.length - 1) * (splitYs.length - 1), pad = String(total).length;
  const num = p => String(p.idx + 1).padStart(pad, '0');   // 保留原编号，只导出选中的也不会乱序
  if (pieces.length === 1) {
    const p = pieces[0];
    downloadBlob(await canvasBlob(p.cv, fmt), p.region ? `region_${p.w}x${p.h}_${stamp}.${fmt}` : total > 1 ? `split_${num(p)}_${stamp}.${fmt}` : `split_${stamp}.${fmt}`);
    return;
  }
  const files = await Promise.all(pieces.map(async p => ({
    name: `${num(p)}_r${p.r + 1}c${p.c + 1}.${fmt}`,
    data: new Uint8Array(await (await canvasBlob(p.cv, fmt)).arrayBuffer()),
  })));
  downloadBlob(makeZip(files), `split_${pieces.length}_${stamp}.zip`);
}
async function splitToLibrary() {
  if (!splitSource()) { alert(t('splitNoSrc')); return; }
  const pieces = splitPieces('png');
  // 等全部加载完再按顺序加入，保证图片库里的顺序 = 分割编号
  const loaded = await Promise.all(pieces.map(async p => {
    const url = URL.createObjectURL(await canvasBlob(p.cv, 'png'));
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = url; });
    return { img, url };
  }));
  loaded.forEach(({ img, url }) => photos.push({ id: nextId++, img, url }));
  splitFlash = t('splitSaved')(loaded.length);
  clearTimeout(splitFlashTimer);
  splitFlashTimer = setTimeout(() => { splitFlash = ''; updateSplitPanel(); }, 2500);
  renderTray(); updateSidebar();
}
