'use strict';
// 照片导入、拖拽、图片库、长图托盘
// ---------- 照片导入 ----------
document.getElementById('uploadBtn').onclick = () => document.getElementById('fileInput').click();
let pendingCell = -1;   // 点空格子＋导入时，指定要填入的格子
document.getElementById('fileInput').onchange = e => {
  addFiles(e.target.files, pendingCell >= 0 ? pendingCell : null);
  pendingCell = -1;
  e.target.value = '';
};
function addFiles(files, targetCell) {
  const list = [...files].filter(f => f.type.startsWith('image/'));
  // 先并行加载，全部就绪后按选择顺序依次加入（字幕截图顺序不能乱）
  return Promise.all(list.map(f => new Promise(res => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  }))).then(loaded => {
    let first = true;
    loaded.forEach(L => {
      if (!L) return;
      const { img, url } = L;
      const toCell = first && targetCell != null ? targetCell : null;
      const isFirst = first;
      first = false;
      const p = { id: nextId++, img, url };
      photos.push(p);
      if (toCell != null && cells[toCell]) {
        cells[toCell] = { p: p.id, zoom:1, ox:0, oy:0, crop:null };
      } else {
        const empty = cells.find(c => c.p == null);
        if (empty) empty.p = p.id;
      }
      stripOrder.push(p.id);
      const b = baseSize();
      const bw = Math.min(b[0], b[1]) * 0.45;
      const k = freeItems.length;
      freeItems.push({ p: p.id, x: b[0]/2 + (k%5-2)*40, y: b[1]/2 + (k%5-2)*40, w: bw, h: bw*img.height/img.width, scale:1, rot:0, crop:null });
      if (mode === 'split' && (isFirst || splitSrc == null)) setSplitSource(p.id);   // 分割模式：导入的图直接作为分割源
    });
    if (mode === 'stitch') autoStitch(false);
    renderTray();
    render();
  });
}

// ---------- 页面拖拽导入（含直接拖进格子） ----------
let dragDepth = 0;
document.addEventListener('dragenter', e => {
  if ([...e.dataTransfer.types].includes('Files')) {
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dropping');
  }
});
document.addEventListener('dragover', e => {
  if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
});
document.addEventListener('dragleave', e => {
  if ([...e.dataTransfer.types].includes('Files')) {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dropping');
  }
});
document.addEventListener('drop', e => {
  dragDepth = 0;
  document.body.classList.remove('dropping');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  let targetCell = null;
  if (mode === 'template') {
    const r = canvas.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const pt = { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
      const rects = cellRects(canvas.width, canvas.height);
      const i = rects.findIndex(rc => pointInShape(rc, pt));
      if (i >= 0) targetCell = i;
    }
  }
  addFiles(e.dataTransfer.files, targetCell);
});

// ---------- 侧边图片库 ----------
const libGrid = document.getElementById('libGrid');
function renderLibrary() {
  libGrid.innerHTML = '';
  if (!photos.length) {
    libGrid.innerHTML = `<span class="libempty">${t('libEmpty')}</span>`;
    return;
  }
  photos.forEach(p => {
    const d = document.createElement('div');
    d.className = 'libthumb' + ((mode === 'split' && p.id === splitSrc) || (mode === 'mockup' && p.id === mkSrc) ? ' sel' : '');
    d.draggable = true;
    d.innerHTML = `<img src="${p.url}"><span class="del">×</span>`;
    d.querySelector('.del').onclick = ev => { ev.stopPropagation(); removePhoto(p.id); };
    d.ondragstart = ev => { dragPhotoId = p.id; ev.dataTransfer.setData('text/plain', p.id); };
    d.onclick = () => placeFromLibrary(p.id);
    libGrid.appendChild(d);
  });
}
function placeFromLibrary(id) {
  const p = photoById(id);
  if (!p) return;
  if (mode === 'split') { setSplitSource(id); return; }
  if (mode === 'mockup') { setMockupSource(id); return; }
  if (mode === 'template') {
    const empty = cells.findIndex(c => c.p == null);
    if (empty >= 0) { cells[empty] = { p:id, zoom:1, ox:0, oy:0, crop:null, text:null }; selCell = empty; }
    updateSidebar(); render();
  } else if (mode === 'free') {
    // 若已选中某个模版组，优先填入它的下一个空格子
    const sel = selFree >= 0 ? freeItems[selFree] : null;
    if (sel && sel.type === 'group') {
      const k = sel.sub.findIndex(s => s.p == null);
      if (k >= 0) { sel.sub[k] = { p:id, crop:null, text: sel.sub[k].text || null }; render(); return; }
    }
    const b = baseSize();
    const bw = Math.min(b[0], b[1]) * 0.45;
    freeItems.push({ p:id, x:b[0]*pages/2, y:b[1]/2, w:bw, h:bw*p.img.height/p.img.width, scale:1, rot:0, crop:null });
    selFree = freeItems.length - 1;
    updateSidebar(); render();
  } else {
    if (!stripOrder.includes(id)) stripOrder.push(id);
    renderTray(); render();
  }
}

// ---------- 底部托盘（仅长图模式，用于排序） ----------
const tray = document.getElementById('tray');
let dragPhotoId = null, dragTrayIdx = -1;
function renderTray() {
  renderLibrary();
  tray.style.display = isStrip() ? 'flex' : 'none';
  tray.innerHTML = '';
  if (!isStrip()) return;
  if (!photos.length) {
    tray.innerHTML = `<span class="empty-tip">${t('trayTip')}</span>`;
    return;
  }
  const order = isStrip() ? stripOrder : photos.map(p => p.id);
  order.forEach((id, idx) => {
    const p = photoById(id);
    if (!p) return;
    const d = document.createElement('div');
    d.className = 'thumb';
    d.draggable = true;
    d.innerHTML = `<img src="${p.url}"><span class="del">×</span>`;
    d.querySelector('.del').onclick = ev => { ev.stopPropagation(); removePhoto(id); };
    d.ondragstart = ev => { dragPhotoId = id; dragTrayIdx = idx; ev.dataTransfer.setData('text/plain', id); };
    if (isStrip()) {
      d.ondragover = ev => { ev.preventDefault(); d.classList.add('dragover'); };
      d.ondragleave = () => d.classList.remove('dragover');
      d.ondrop = ev => {
        ev.preventDefault(); d.classList.remove('dragover');
        if (dragTrayIdx < 0 || dragTrayIdx === idx) return;
        const moved = stripOrder.splice(dragTrayIdx, 1)[0];
        stripOrder.splice(idx, 0, moved);
        dragTrayIdx = -1;
        selStrip = -1;
        renderTray(); render();
      };
    }
    if (mode === 'free') {
      d.style.cursor = 'pointer';
      d.onclick = () => {
        const b = baseSize();
        const bw = Math.min(b[0], b[1]) * 0.45;
        freeItems.push({ p: id, x: b[0]*pages/2, y: b[1]/2, w: bw, h: bw*p.img.height/p.img.width, scale:1, rot:0, crop:null });
        selFree = freeItems.length - 1;
        updateSidebar(); render();
      };
    }
    tray.appendChild(d);
  });
}
function removePhoto(id) {
  const p = photoById(id);
  if (p) URL.revokeObjectURL(p.url);
  photos = photos.filter(p => p.id !== id);
  stripOrder = stripOrder.filter(i => i !== id);
  delete stripCrops[id]; delete subOv[id];
  freeItems = freeItems.filter(it => it.type === 'group' || it.p !== id);
  freeItems.forEach(it => { if (it.type === 'group') it.sub.forEach(sc => { if (sc.p === id) { sc.p = null; sc.crop = null; } }); });
  cells.forEach(c => { if (c.p === id) { c.p = null; c.zoom = 1; c.ox = 0; c.oy = 0; c.crop = null; } });
  if (splitSrc === id) { splitSrc = null; splitCrop = null; }
  selCell = -1; selFree = -1; selStrip = -1;
  hidePop();
  updateSidebar(); renderTray(); render();
}

// 图片库缩略图拖到画布：模板→填格子；自由→填模版组子格子或新增自由图；长图→按位置插入
canvas.addEventListener('dragover', e => { if (dragPhotoId != null) e.preventDefault(); });
canvas.addEventListener('drop', e => {
  if (dragPhotoId == null) return;
  e.preventDefault();
  const pt = toCanvas(e);
  if (mode === 'split') { setSplitSource(dragPhotoId); dragPhotoId = null; return; }
  if (mode === 'mockup') { setMockupSource(dragPhotoId); dragPhotoId = null; return; }
  if (isStrip()) {
    // 按拖放位置插入长图序列（拖到某块中点之前就排在它前面）；若已在序列中则移动到该位置
    const rects = stripRects(canvas.width, canvas.height);
    let idx = rects.length;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const mid = sDir() === 'v' ? r.y + r.h/2 : r.x + r.w/2;
      const p = sDir() === 'v' ? pt.y : pt.x;
      if (p < mid) { idx = i; break; }
    }
    const cur = stripOrder.indexOf(dragPhotoId);
    if (cur >= 0) { stripOrder.splice(cur, 1); if (cur < idx) idx--; }  // 已存在→先移除再插入（即移动）
    stripOrder.splice(idx, 0, dragPhotoId);
    selStrip = idx;
    renderTray(); render();
    dragPhotoId = null;
    return;
  }
  if (mode === 'template') {
    const shapes = cellShapes(canvas.width, canvas.height);
    const i = shapes.findIndex(r => pointInShape(r, pt));
    if (i >= 0) {
      const keepText = cells[i] ? cells[i].text : null;
      cells[i] = { p: dragPhotoId, zoom:1, ox:0, oy:0, crop:null, text: keepText };
      selCell = i;
      updateSidebar(); render();
    }
  } else if (mode === 'free') {
    let filled = false;
    for (let gi = freeItems.length - 1; gi >= 0; gi--) {
      const it = freeItems[gi];
      if (it.type !== 'group') continue;
      const lp = toLocal(pt, it);
      const bw = it.w*it.scale, bh = it.h*it.scale;
      if (Math.abs(lp.x) <= bw/2 && Math.abs(lp.y) <= bh/2) {
        const k = groupCellAt(it, pt);
        if (k >= 0) {
          const keepText = it.sub[k] ? it.sub[k].text : null;
          it.sub[k] = { p: dragPhotoId, crop:null, text: keepText };
          selFree = gi; filled = true; updateSidebar(); render();
        }
        break;
      }
    }
    if (!filled) {
      const p = photoById(dragPhotoId);
      const b = baseSize();
      const bw = Math.min(b[0], b[1]) * 0.45;
      freeItems.push({ p: dragPhotoId, x: pt.x, y: pt.y, w: bw, h: bw*p.img.height/p.img.width, scale:1, rot:0, crop:null });
      selFree = freeItems.length - 1; updateSidebar(); render();
    }
  }
  dragPhotoId = null;
});
