'use strict';
// 浮动菜单与画布交互
// ---------- 浮动菜单 ----------
const pop = document.getElementById('pop');
function showPop(x, y, btns) {
  pop.innerHTML = '';
  btns.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { hidePop(); fn(); };
    pop.appendChild(b);
  });
  pop.style.display = 'flex';
  pop.style.left = '0px'; pop.style.top = '0px';
  const r = pop.getBoundingClientRect();
  pop.style.left = Math.min(x, innerWidth - r.width - 10) + 'px';
  pop.style.top = Math.min(y + 8, innerHeight - r.height - 10) + 'px';
}
function hidePop() { pop.style.display = 'none'; }
document.addEventListener('pointerdown', e => { if (!pop.contains(e.target)) hidePop(); }, true);

// ---------- 画布交互 ----------
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
let drag = null;
let downClient = null;
let swapTarget = -1;   // 模板模式：拖动图片时高亮的目标格子
canvas.addEventListener('pointerdown', e => {
  const pt = toCanvas(e);
  downClient = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  if (mode === 'split') {
    // 框选：命中选框角/框内 → 调整/移动；分割：命中分割线 → 拖线；否则拖空白处滚动长图（轻点则选块）
    const k = canvas.width / canvas.getBoundingClientRect().width;
    drag = (splitMethod === 'region' ? regionHit(pt, k) : splitHit(pt, k))
      || { type:'splitpan', x:e.clientX, y:e.clientY, sl:stage.scrollLeft, st:stage.scrollTop, pt };
    return;
  }
  if (mode === 'template') {
    const rects = cellRects(canvas.width, canvas.height);
    const i = rects.findIndex(r => pointInShape(r, pt));
    selCell = i;
    updateSidebar(); render();
    if (i >= 0 && cells[i].p != null) {
      drag = { type:'pan', i, sx:pt.x, sy:pt.y, ox:cells[i].ox, oy:cells[i].oy };
    }
  } else if (mode === 'free') {
    if (selFree >= 0 && freeItems[selFree]) {
      const it = freeItems[selFree];
      const w = it.w*it.scale, h = it.h*it.scale;
      const lp = toLocal(pt, it);
      const tol = 26;
      // 旋转手柄（所有自由项）
      if (Math.hypot(lp.x, lp.y + h/2 + 40) < tol) {
        drag = { type:'rotate', it, a0: Math.atan2(pt.y-it.y, pt.x-it.x), r0: it.rot };
        return;
      }
      if (it.type === 'group') {
        // 模板组：右下角自由拉伸，右边拉宽，下边拉高（scale 保持 1，直接改 w/h）
        if (Math.hypot(lp.x - w/2, lp.y - h/2) < tol) { drag = { type:'gresize', it, axis:'both' }; return; }
        if (Math.hypot(lp.x - w/2, lp.y) < tol)       { drag = { type:'gresize', it, axis:'w' }; return; }
        if (Math.hypot(lp.x, lp.y - h/2) < tol)       { drag = { type:'gresize', it, axis:'h' }; return; }
      } else {
        // 普通图片：等比缩放
        if (Math.hypot(lp.x - w/2, lp.y - h/2) < tol) {
          drag = { type:'scale', it, d0: Math.hypot(pt.x-it.x, pt.y-it.y), s0: it.scale };
          return;
        }
      }
    }
    let hit = -1;
    for (let i = freeItems.length - 1; i >= 0; i--) {
      const it = freeItems[i];
      const lp = toLocal(pt, it);
      const w = it.w*it.scale, h = it.h*it.scale;
      if (Math.abs(lp.x) <= w/2 && Math.abs(lp.y) <= h/2) { hit = i; break; }
    }
    selFree = hit;
    updateSidebar(); render();
    if (hit >= 0) {
      const it = freeItems[hit];
      drag = { type:'move', it, dx: pt.x - it.x, dy: pt.y - it.y };
    }
  } else { // strip
    if (mode === 'stitch') {
      const si = seamHit(pt);
      if (si >= 1) {
        const sm = seamOf(si);
        selSeam = si; selStrip = -1; downClient = null;
        drag = { type:'seam', i:si, y0:pt.y, aBot:sm.aBot, bTop:sm.bTop, lower:e.shiftKey };
        render(); showMagnifier(e, pt);
        return;
      }
      selSeam = -1;
    }
    const rects = stripRects(canvas.width, canvas.height);
    selStrip = rects.findIndex(r => pt.x >= r.x && pt.x <= r.x+r.w && pt.y >= r.y && pt.y <= r.y+r.h);
    if (selStrip >= 0) drag = { type:'striporder', from:selStrip };  // 可拖拽改顺序
    render();
  }
});
function toLocal(pt, it) {
  const dx = pt.x - it.x, dy = pt.y - it.y;
  const c = Math.cos(-it.rot), s = Math.sin(-it.rot);
  return { x: dx*c - dy*s, y: dx*s + dy*c };
}
canvas.addEventListener('pointermove', e => {
  if (mode === 'split') { splitPointerMove(e, toCanvas(e)); return; }
  if (!drag) return;
  const pt = toCanvas(e);
  if (drag.type === 'pan') {
    const shapes = cellShapes(canvas.width, canvas.height);
    const j = shapes.findIndex(s => pointInShape(s, pt));
    if (j >= 0 && j !== drag.i) {
      // 指针进入其它格子 → 准备换位，原图保持不动
      swapTarget = j;
      cells[drag.i].ox = drag.ox; cells[drag.i].oy = drag.oy;
    } else {
      // 仍在原格子内 → 正常平移裁切
      swapTarget = -1;
      const cell = cells[drag.i];
      cell.ox = drag.ox + (pt.x - drag.sx);
      cell.oy = drag.oy + (pt.y - drag.sy);
    }
  } else if (drag.type === 'move') {
    drag.it.x = pt.x - drag.dx;
    drag.it.y = pt.y - drag.dy;
  } else if (drag.type === 'scale') {
    const d = Math.hypot(pt.x - drag.it.x, pt.y - drag.it.y);
    drag.it.scale = Math.max(0.1, Math.min(6, drag.s0 * d / Math.max(drag.d0, 1)));
  } else if (drag.type === 'gresize') {
    const lp = toLocal(pt, drag.it);
    if (drag.axis !== 'h') drag.it.w = Math.max(80, Math.abs(lp.x) * 2);
    if (drag.axis !== 'w') drag.it.h = Math.max(80, Math.abs(lp.y) * 2);
  } else if (drag.type === 'seam') {
    // 指针位移 → 原图像素；默认改上图底部（接缝跟手），Shift 改下图顶部
    const rects = stripRects(canvas.width, canvas.height), i = drag.i;
    const ra = rects[i - 1], rb = rects[i];
    if (ra && rb) {
      const dy = pt.y - drag.y0, sm = seamOf(i);
      if (drag.lower) { sm.bTop = drag.bTop; seamAdjust(i, -dy * rb.src.sw / rb.w, true); }
      else { sm.aBot = drag.aBot; seamAdjust(i, -dy * ra.src.sw / ra.w, false); }
    }
    render();
    showMagnifier(e, { x: pt.x, y: stripRects(canvas.width, canvas.height)[i] ? stripRects(canvas.width, canvas.height)[i].y : pt.y });
    return;
  } else if (drag.type === 'striporder') {
    // 拖拽实时改长图顺序：按指针位置算目标位，边拖边移动
    const rects = stripRects(canvas.width, canvas.height);
    let idx = rects.length - 1;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const mid = sDir() === 'v' ? r.y + r.h/2 : r.x + r.w/2;
      const p = sDir() === 'v' ? pt.y : pt.x;
      if (p < mid) { idx = i; break; }
    }
    if (idx !== drag.from) {
      const it = stripOrder.splice(drag.from, 1)[0];
      if (drag.from < idx) idx--;
      stripOrder.splice(idx, 0, it);
      drag.from = idx; selStrip = idx;
      renderTray();
    }
  } else if (drag.type === 'rotate') {
    drag.it.rot = drag.r0 + Math.atan2(pt.y - drag.it.y, pt.x - drag.it.x) - drag.a0;
  }
  render();
});
canvas.addEventListener('pointerup', e => {
  const d = drag;
  drag = null;
  if (d && d.type === 'seam') { hideMagnifier(); updateStitchPanel(); return; }
  if (mode === 'split') {
    const tap = downClient && Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y) <= 6;
    downClient = null;
    if (tap && d && d.type === 'splitpan' && splitMethod !== 'region') toggleSplitPiece(d.pt);
    return;
  }
  // 拖到别的格子 → 交换两格内容（拖到空格即移过去）
  if (d && d.type === 'pan' && swapTarget >= 0 && swapTarget !== d.i) {
    const tmp = cells[d.i]; cells[d.i] = cells[swapTarget]; cells[swapTarget] = tmp;
    selCell = swapTarget;
    swapTarget = -1;
    downClient = null;
    updateSidebar(); render();
    return;
  }
  swapTarget = -1;
  if (!downClient) return;
  const moved = Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y);
  downClient = null;
  if (moved > 6) return;
  // 视为单击 → 弹出菜单
  if (mode === 'template' && selCell >= 0 && cells[selCell] && cells[selCell].p != null) {
    const i = selCell;
    showPop(e.clientX, e.clientY, [
      [t('popCrop'), () => openCellCrop(i)],
      [t('popCutout'), () => openCellCut(i)],
      [t('popAnnot'), () => annotatePhoto(cells[i].p)],
      [t('popSplit'), () => { const ph = photoById(cells[i].p); if (ph) openSplit(ph.id, cells[i].crop); }],
      [t('popRemove'), () => { cells[i] = { p:null, zoom:1, ox:0, oy:0, crop:null }; selCell = -1; updateSidebar(); render(); }],
    ]);
  } else if (mode === 'template' && selCell >= 0 && cells[selCell] && cells[selCell].p == null) {
    // 点空格子的＋：优先用图片库里第一张未用的图，否则打开相册导入到该格
    const i = selCell;
    const usedIds = new Set(cells.filter(c => c.p != null).map(c => c.p));
    const free = photos.find(p => !usedIds.has(p.id));
    if (free) { cells[i] = { p: free.id, zoom:1, ox:0, oy:0, crop:null, text:null }; updateSidebar(); render(); }
    else { pendingCell = i; document.getElementById('fileInput').click(); }
  } else if (mode === 'free' && selFree >= 0) {
    const i = selFree, it = freeItems[i];
    if (it.type === 'group') {
      const k = groupCellAt(it, toCanvas(e));
      const btns = [];
      if (k >= 0 && it.sub[k] && it.sub[k].p != null) {
        btns.push([t('popCrop'), () => openGroupCrop(i, k)]);
        btns.push([t('popCutout'), () => openGroupCut(i, k)]);
        btns.push([t('popAnnot'), () => annotatePhoto(it.sub[k].p)]);
        btns.push([t('popSplit'), () => { const sc = it.sub[k], ph = sc && photoById(sc.p); if (ph) openSplit(ph.id, sc.crop); }]);
        btns.push([t('popCellClear'), () => { it.sub[k] = { p:null, crop:null, text:null }; render(); }]);
      }
      btns.push([t('popDelGroup'), () => { freeItems.splice(i, 1); selFree = -1; updateSidebar(); render(); }]);
      showPop(e.clientX, e.clientY, btns);
    } else {
      showPop(e.clientX, e.clientY, [
        [t('popCrop'), () => openFreeCrop(i)],
        [t('popCutout'), () => openFreeCut(i)],
        [t('popAnnot'), () => annotatePhoto(it.p)],
        [t('popSplit'), () => { const ph = photoById(it.p); if (ph) openSplit(ph.id, it.crop); }],
        [t('popDelete'), () => { freeItems.splice(i, 1); selFree = -1; updateSidebar(); render(); }],
      ]);
    }
  } else if (isStrip() && selStrip >= 0) {
    const i = selStrip;
    showPop(e.clientX, e.clientY, [
      [t('popCrop'), () => openStripCrop(i)],
      [t('popCutout'), () => openStripCut(i)],
      [t('popAnnot'), () => annotatePhoto(stripOrder[i])],
      [t('popSplit'), () => { const id = stripOrder[i], ph = photoById(id); if (ph) openSplit(ph.id, stripCrops[id]); }],
      [t('popUp'), () => {
        if (i > 0) { [stripOrder[i-1], stripOrder[i]] = [stripOrder[i], stripOrder[i-1]]; selStrip = i-1; renderTray(); render(); }
      }],
      [t('popDown'), () => {
        if (i < stripOrder.length-1) { [stripOrder[i+1], stripOrder[i]] = [stripOrder[i], stripOrder[i+1]]; selStrip = i+1; renderTray(); render(); }
      }],
      [t('popRemove'), () => { stripOrder.splice(i, 1); selStrip = -1; renderTray(); render(); }],
    ]);
  }
});
canvas.addEventListener('wheel', e => {
  if (mode === 'template') {
    const pt = toCanvas(e);
    const rects = cellRects(canvas.width, canvas.height);
    const i = rects.findIndex(r => pointInShape(r, pt));
    if (i >= 0 && cells[i].p != null) {
      e.preventDefault();
      cells[i].zoom = Math.max(0.2, Math.min(3, cells[i].zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
      if (selCell === i) updateSidebar();
      render();
    }
  } else if (mode === 'free' && selFree >= 0) {
    e.preventDefault();
    const it = freeItems[selFree];
    it.scale = Math.max(0.1, Math.min(6, it.scale * (e.deltaY < 0 ? 1.06 : 0.94)));
    render();
  }
}, { passive:false });
canvas.addEventListener('dblclick', e => {
  if (mode !== 'template') return;
  const pt = toCanvas(e);
  const rects = cellRects(canvas.width, canvas.height);
  const i = rects.findIndex(r => pointInShape(r, pt));
  if (i >= 0) { cells[i] = { p:null, zoom:1, ox:0, oy:0, crop:null }; selCell = -1; hidePop(); updateSidebar(); render(); }
});
