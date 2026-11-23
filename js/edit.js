'use strict';
// 裁剪与抠图弹窗
// ---------- 裁剪弹窗 ----------
// ---------- 抠图（简单去色：从边缘泛洪去掉接近纯色的背景） ----------
function cutoutDataURL(img, tol, toWhite, seed, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width*scale)), h = Math.max(1, Math.round(img.height*scale));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0, w, h);
  const id = c.getImageData(0, 0, w, h), d = id.data;
  let R, G, B;
  if (seed) { R = seed.r; G = seed.g; B = seed.b; }
  else { // 取四角平均作为背景色
    let r=0,g=0,b=0; const cs=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    cs.forEach(([x,y]) => { const p=(y*w+x)*4; r+=d[p]; g+=d[p+1]; b+=d[p+2]; });
    R=r/4; G=g/4; B=b/4;
  }
  const tol2 = tol*tol;
  const isBg = i => { const p=i*4, dr=d[p]-R, dg=d[p+1]-G, db=d[p+2]-B; return dr*dr+dg*dg+db*db < tol2; };
  const visited = new Uint8Array(w*h), stack = [];
  for (let x=0;x<w;x++){ stack.push(x); stack.push((h-1)*w+x); }
  for (let y=0;y<h;y++){ stack.push(y*w); stack.push(y*w+(w-1)); }
  while (stack.length) {
    const idx = stack.pop(); if (visited[idx]) continue; visited[idx] = 1;
    if (!isBg(idx)) continue;
    const x = idx%w, y = (idx/w)|0;
    if (x>0) stack.push(idx-1); if (x<w-1) stack.push(idx+1);
    if (y>0) stack.push(idx-w); if (y<h-1) stack.push(idx+w);
  }
  for (let i=0;i<w*h;i++) if (visited[i] && isBg(i)) {
    const p = i*4;
    if (toWhite) { d[p]=255; d[p+1]=255; d[p+2]=255; d[p+3]=255; }
    else d[p+3] = 0;
  }
  c.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}
// 把处理后的图作为新图片加入图片库并回调新 id
function addProcessedPhoto(dataURL, cb) {
  const img = new Image();
  img.onload = () => { const p = { id: nextId++, img, url: dataURL }; photos.push(p); renderLibrary(); cb(p.id); };
  img.src = dataURL;
}
const cutModal = document.getElementById('cutModal');
const cutCanvas = document.getElementById('cutCanvas');
const cutx = cutCanvas.getContext('2d');
let cutState = null;  // {img, onApply, seed}
function cutPreview() {
  if (!cutState) return;
  const img = cutState.img, tol = +document.getElementById('cutTol').value;
  const toWhite = document.querySelector('#cutOutSel button.active').dataset.out === 'white';
  const maxDim = 700;
  const scale = Math.min(1, maxDim/Math.max(img.width,img.height));
  const w = Math.max(1,Math.round(img.width*scale)), h = Math.max(1,Math.round(img.height*scale));
  cutCanvas.width = w; cutCanvas.height = h;
  const url = cutoutDataURL(img, tol, toWhite, cutState.seed, maxDim);
  const im = new Image();
  im.onload = () => { cutx.clearRect(0,0,w,h); cutx.drawImage(im,0,0,w,h); };
  im.src = url;
}
function openCutout(img, onApply) {
  cutState = { img, onApply, seed: null };
  const maxW = Math.min(innerWidth*0.82, 900), maxH = innerHeight*0.6;
  const s = Math.min(maxW/img.width, maxH/img.height);
  cutCanvas.style.width = Math.round(img.width*s) + 'px';
  cutCanvas.style.height = Math.round(img.height*s) + 'px';
  cutModal.classList.add('show');
  cutPreview();
}
document.getElementById('cutTol').oninput = cutPreview;
document.querySelectorAll('#cutOutSel button').forEach(b => {
  b.onclick = () => { document.querySelectorAll('#cutOutSel button').forEach(e=>e.classList.toggle('active',e===b)); cutPreview(); };
});
cutCanvas.addEventListener('pointerdown', e => {   // 点图重选背景色
  if (!cutState) return;
  const b = cutCanvas.getBoundingClientRect();
  const x = Math.round((e.clientX-b.left)*cutCanvas.width/b.width);
  const y = Math.round((e.clientY-b.top)*cutCanvas.height/b.height);
  const tmp = document.createElement('canvas'); tmp.width=cutCanvas.width; tmp.height=cutCanvas.height;
  const tc = tmp.getContext('2d'); const sc=Math.min(1,700/Math.max(cutState.img.width,cutState.img.height));
  tc.drawImage(cutState.img,0,0,cutCanvas.width,cutCanvas.height);
  const px = tc.getImageData(Math.max(0,Math.min(cutCanvas.width-1,x)), Math.max(0,Math.min(cutCanvas.height-1,y)),1,1).data;
  cutState.seed = { r:px[0], g:px[1], b:px[2] };
  cutPreview();
});
document.getElementById('cutCancel').onclick = () => { cutModal.classList.remove('show'); cutState = null; };
document.getElementById('cutOk').onclick = () => {
  if (!cutState) return;
  const tol = +document.getElementById('cutTol').value;
  const toWhite = document.querySelector('#cutOutSel button.active').dataset.out === 'white';
  const url = cutoutDataURL(cutState.img, tol, toWhite, cutState.seed, 2200);
  const fn = cutState.onApply;
  cutModal.classList.remove('show'); cutState = null;
  fn(url);
};
function openCellCut(i) {
  const ph = photoById(cells[i].p); if (!ph) return;
  openCutout(ph.img, url => addProcessedPhoto(url, id => { cells[i] = { p:id, zoom:1, ox:0, oy:0, crop:null, text:cells[i].text }; render(); }));
}
function openFreeCut(i) {
  const it = freeItems[i], ph = it && photoById(it.p); if (!ph) return;
  openCutout(ph.img, url => addProcessedPhoto(url, id => { it.p = id; it.crop = null; render(); }));
}
function openStripCut(i) {
  const id = stripOrder[i], ph = photoById(id); if (!ph) return;
  openCutout(ph.img, url => addProcessedPhoto(url, nid => { delete stripCrops[id]; stripOrder[i] = nid; render(); }));
}
function openGroupCut(gi, k) {
  const it = freeItems[gi]; if (!it || it.type !== 'group') return;
  const sc = it.sub[k], ph = sc && photoById(sc.p); if (!ph) return;
  openCutout(ph.img, url => addProcessedPhoto(url, id => { sc.p = id; sc.crop = null; render(); }));
}

const cropModal = document.getElementById('cropModal');
const cropCanvas = document.getElementById('cropCanvas');
const cctx = cropCanvas.getContext('2d');
let cm = null; // {img, s, rect:{x,y,w,h} 显示坐标, onApply}
function openCellCrop(i) {
  const cell = cells[i];
  const ph = photoById(cell.p);
  if (!ph) return;
  openCrop(ph.img, cell.crop, crop => {
    cell.crop = crop;
    cell.zoom = 1; cell.ox = 0; cell.oy = 0;
    render();
  });
}
function openFreeCrop(i) {
  const it = freeItems[i];
  const ph = photoById(it.p);
  if (!it || !ph) return;
  openCrop(ph.img, it.crop, crop => {
    it.crop = crop;
    const sw = crop ? crop.sw : ph.img.width, sh = crop ? crop.sh : ph.img.height;
    it.h = it.w * sh / sw;   // 按裁剪后比例更新高度
    render();
  });
}
function openStripCrop(i) {
  const id = stripOrder[i];
  const ph = photoById(id);
  if (!ph) return;
  openCrop(ph.img, stripCrops[id], crop => {
    if (crop) stripCrops[id] = crop; else delete stripCrops[id];
    render();
  });
}
function openGroupCrop(gi, k) {
  const it = freeItems[gi]; if (!it || it.type !== 'group') return;
  const sc = it.sub[k]; const ph = sc && photoById(sc.p);
  if (!ph) return;
  openCrop(ph.img, sc.crop, crop => { sc.crop = crop; render(); });
}
function openCrop(img, existing, onApply) {
  const maxW = Math.min(innerWidth * 0.82, 1000);
  const maxH = innerHeight * 0.66;
  const s = Math.min(maxW / img.width, maxH / img.height);
  cropCanvas.width = Math.round(img.width * s);
  cropCanvas.height = Math.round(img.height * s);
  let rect;
  if (existing) {
    rect = { x: existing.sx*s, y: existing.sy*s, w: existing.sw*s, h: existing.sh*s };
  } else {
    rect = { x: 0, y: 0, w: cropCanvas.width, h: cropCanvas.height };
  }
  cm = { img, s, rect, onApply };
  drawCrop();
  cropModal.classList.add('show');
}
function drawCrop() {
  if (!cm) return;
  const W = cropCanvas.width, H = cropCanvas.height, r = cm.rect;
  cctx.clearRect(0, 0, W, H);
  cctx.drawImage(cm.img, 0, 0, W, H);
  // 暗化裁剪框外
  cctx.fillStyle = 'rgba(0,0,0,.55)';
  cctx.fillRect(0, 0, W, r.y);
  cctx.fillRect(0, r.y, r.x, r.h);
  cctx.fillRect(r.x + r.w, r.y, W - r.x - r.w, r.h);
  cctx.fillRect(0, r.y + r.h, W, H - r.y - r.h);
  // 边框 + 三分线
  cctx.strokeStyle = '#4f8cff'; cctx.lineWidth = 2;
  cctx.strokeRect(r.x, r.y, r.w, r.h);
  cctx.strokeStyle = 'rgba(79,140,255,.35)'; cctx.lineWidth = 1;
  for (let k = 1; k <= 2; k++) {
    cctx.beginPath(); cctx.moveTo(r.x + r.w*k/3, r.y); cctx.lineTo(r.x + r.w*k/3, r.y + r.h); cctx.stroke();
    cctx.beginPath(); cctx.moveTo(r.x, r.y + r.h*k/3); cctx.lineTo(r.x + r.w, r.y + r.h*k/3); cctx.stroke();
  }
  // 四角手柄
  cctx.fillStyle = '#4f8cff';
  cropCorners().forEach(c => cctx.fillRect(c.x - 7, c.y - 7, 14, 14));
}
function cropCorners() {
  const r = cm.rect;
  return [
    { k:'nw', x:r.x, y:r.y }, { k:'ne', x:r.x + r.w, y:r.y },
    { k:'sw', x:r.x, y:r.y + r.h }, { k:'se', x:r.x + r.w, y:r.y + r.h },
  ];
}
let cropDrag = null;
function cropPt(e) {
  const b = cropCanvas.getBoundingClientRect();
  return { x: (e.clientX - b.left) * cropCanvas.width / b.width, y: (e.clientY - b.top) * cropCanvas.height / b.height };
}
cropCanvas.addEventListener('pointerdown', e => {
  if (!cm) return;
  cropCanvas.setPointerCapture(e.pointerId);
  const p = cropPt(e);
  const corner = cropCorners().find(c => Math.hypot(p.x - c.x, p.y - c.y) < 16);
  if (corner) {
    cropDrag = { type: corner.k };
  } else if (p.x >= cm.rect.x && p.x <= cm.rect.x + cm.rect.w && p.y >= cm.rect.y && p.y <= cm.rect.y + cm.rect.h) {
    cropDrag = { type:'mv', dx: p.x - cm.rect.x, dy: p.y - cm.rect.y };
  }
});
cropCanvas.addEventListener('pointermove', e => {
  if (!cm) return;
  const p = cropPt(e);
  if (!cropDrag) {
    const corner = cropCorners().find(c => Math.hypot(p.x - c.x, p.y - c.y) < 16);
    cropCanvas.style.cursor = corner ? (corner.k === 'nw' || corner.k === 'se' ? 'nwse-resize' : 'nesw-resize')
      : (p.x >= cm.rect.x && p.x <= cm.rect.x + cm.rect.w && p.y >= cm.rect.y && p.y <= cm.rect.y + cm.rect.h ? 'move' : 'default');
    return;
  }
  const W = cropCanvas.width, H = cropCanvas.height, r = cm.rect, MIN = 24;
  const cx = Math.max(0, Math.min(W, p.x)), cy = Math.max(0, Math.min(H, p.y));
  if (cropDrag.type === 'mv') {
    r.x = Math.max(0, Math.min(W - r.w, p.x - cropDrag.dx));
    r.y = Math.max(0, Math.min(H - r.h, p.y - cropDrag.dy));
  } else {
    const x2 = r.x + r.w, y2 = r.y + r.h;
    if (cropDrag.type === 'nw') { r.x = Math.min(cx, x2 - MIN); r.y = Math.min(cy, y2 - MIN); r.w = x2 - r.x; r.h = y2 - r.y; }
    if (cropDrag.type === 'ne') { r.y = Math.min(cy, y2 - MIN); r.w = Math.max(MIN, cx - r.x); r.h = y2 - r.y; }
    if (cropDrag.type === 'sw') { r.x = Math.min(cx, x2 - MIN); r.w = x2 - r.x; r.h = Math.max(MIN, cy - r.y); }
    if (cropDrag.type === 'se') { r.w = Math.max(MIN, cx - r.x); r.h = Math.max(MIN, cy - r.y); }
  }
  drawCrop();
});
cropCanvas.addEventListener('pointerup', () => cropDrag = null);
document.getElementById('cropCancel').onclick = () => { cropModal.classList.remove('show'); cm = null; };
document.getElementById('cropReset').onclick = () => {
  if (!cm) return;
  cm.rect = { x:0, y:0, w:cropCanvas.width, h:cropCanvas.height };
  drawCrop();
};
document.getElementById('cropOk').onclick = () => {
  if (!cm) return;
  const r = cm.rect, s = cm.s;
  const full = r.x < 2 && r.y < 2 && r.w > cropCanvas.width - 4 && r.h > cropCanvas.height - 4;
  const crop = full ? null : {
    sx: Math.max(0, Math.round(r.x / s)),
    sy: Math.max(0, Math.round(r.y / s)),
    sw: Math.min(cm.img.width, Math.round(r.w / s)),
    sh: Math.min(cm.img.height, Math.round(r.h / s)),
  };
  const fn = cm.onApply;
  cropModal.classList.remove('show'); cm = null;
  fn(crop);
};
