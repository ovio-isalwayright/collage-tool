'use strict';
// 界面外壳：导出弹出面板、素材岛折叠、空状态、画布缩放条、滑块进度、画布叠加层描边

// ---------- 导出弹出面板 ----------
const exportPop = document.getElementById('exportPop');
const hdrExport = document.getElementById('hdrExport');
function toggleExportPop(open) {
  const on = open === undefined ? !exportPop.classList.contains('open') : open;
  exportPop.classList.toggle('open', on);
  hdrExport.setAttribute('aria-expanded', on ? 'true' : 'false');
  document.body.classList.toggle('sheet-open', on && isMobile());
}
hdrExport.addEventListener('click', e => { e.stopPropagation(); toggleExportPop(); });
document.addEventListener('pointerdown', e => {
  if (exportPop.classList.contains('open') && !e.target.closest('#exportPop, #hdrExport, #mNav')) toggleExportPop(false);
});
// 这些操作完成后收起面板（导出本身保持原有逻辑）
['exportBtn', 'annExportBtn', 'toMockupBtn', 'saveLibBtn'].forEach(id =>
  document.getElementById(id).addEventListener('click', () => toggleExportPop(false)));
window.addEventListener('keydown', e => { if (e.key === 'Escape' && exportPop.classList.contains('open')) toggleExportPop(false); });

// ---------- 素材岛折叠 ----------
const mainGrid = document.getElementById('mainGrid');
document.getElementById('dockToggle').onclick = () => {
  mainGrid.classList.toggle('dock-collapsed');
  setTimeout(render, 260);          // 等宽度过渡结束再重新适配画布
};

// ---------- 空状态 ----------
document.getElementById('emptyImport').onclick = () => document.getElementById('fileInput').click();
document.getElementById('emptyVideo').onclick = () => document.getElementById('vidInput').click();

// ---------- 画布缩放条 ----------
function setViewZoom(z) {
  viewZoom = Math.max(1, Math.min(4, Math.round(z * 4) / 4));
  render();
}
document.getElementById('zoomIn').onclick = () => setViewZoom(viewZoom + 0.25);
document.getElementById('zoomOut').onclick = () => setViewZoom(viewZoom - 0.25);
document.getElementById('zoomFit').onclick = () => setViewZoom(1);

// ---------- 滑块进度（细轨道上的强调色填充） ----------
function paintRange(el) {
  const min = +el.min || 0, max = +el.max || 100, v = +el.value;
  el.style.setProperty('--p', ((v - min) / ((max - min) || 1) * 100) + '%');
}
function paintRanges() { document.querySelectorAll('input[type=range]').forEach(paintRange); }
document.addEventListener('input', e => { if (e.target.type === 'range') paintRange(e.target); });

// 每次 render() 之后：空状态、缩放比例、滑块进度
function afterRender() {
  const empty = !photos.length;
  document.getElementById('emptyCard').classList.toggle('hidden', !empty);
  wrap.classList.toggle('is-empty', empty);
  document.getElementById('viewBar').classList.toggle('hidden', empty);
  document.getElementById('zoomPct').textContent = Math.round(viewZoom * 100) + '%';
  paintRanges();
}

// ---------- 画布上的强调色叠加层：自动加深色描边，浅色图片上也看得清 ----------
// 只作用于主画布（编辑态）；导出用的离屏画布不受影响
(function () {
  const P = CanvasRenderingContext2D.prototype, stroke = P.stroke, strokeRect = P.strokeRect, fill = P.fill;
  const isAcc = s => typeof s === 'string' && (s.toLowerCase() === ACC || s.replace(/\s/g, '').startsWith(`rgba(${ACC_RGB},`));
  const onUI = ctx => ctx.canvas && (ctx.canvas.id === 'canvas' || ctx.canvas.id === 'subBandCanvas' || ctx.canvas.id === 'cropCanvas');
  function halo(ctx, draw) {
    ctx.save();
    ctx.strokeStyle = 'rgba(9,9,11,.72)';
    ctx.lineWidth = ctx.lineWidth + Math.max(2, ctx.lineWidth * 0.7);
    draw();
    ctx.restore();
  }
  P.stroke = function (...a) {
    if (onUI(this) && isAcc(this.strokeStyle)) halo(this, () => stroke.apply(this, a));
    return stroke.apply(this, a);
  };
  P.strokeRect = function (...a) {
    if (onUI(this) && isAcc(this.strokeStyle)) halo(this, () => strokeRect.apply(this, a));
    return strokeRect.apply(this, a);
  };
  P.fill = function (...a) {
    const r = fill.apply(this, a);
    if (onUI(this) && isAcc(this.fillStyle) && !a.length) {
      this.save(); this.setLineDash([]); this.strokeStyle = 'rgba(9,9,11,.72)'; this.lineWidth = 1.5;
      stroke.call(this); this.restore();
    }
    return r;
  };
})();
