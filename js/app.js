'use strict';
// 自由模式按钮、导出、语言切换、手机标签栏、初始化（最后加载）
// ---------- 自由模式按钮 ----------
document.getElementById('cropFreeBtn').onclick = () => { if (selFree >= 0) openFreeCrop(selFree); };
document.getElementById('fwdBtn').onclick = () => {
  if (selFree >= 0 && selFree < freeItems.length - 1) {
    [freeItems[selFree], freeItems[selFree+1]] = [freeItems[selFree+1], freeItems[selFree]];
    selFree++; render();
  }
};
document.getElementById('backBtn').onclick = () => {
  if (selFree > 0) {
    [freeItems[selFree], freeItems[selFree-1]] = [freeItems[selFree-1], freeItems[selFree]];
    selFree--; render();
  }
};
document.getElementById('delBtn').onclick = () => {
  if (selFree >= 0) { freeItems.splice(selFree, 1); selFree = -1; updateSidebar(); render(); }
};
window.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'free' && selFree >= 0 && document.activeElement.tagName !== 'INPUT') {
    freeItems.splice(selFree, 1); selFree = -1; updateSidebar(); render();
  }
  if (e.key === 'Escape' && cm) { cropModal.classList.remove('show'); cm = null; }
  if (e.key === 'Escape' && cutState) { cutModal.classList.remove('show'); cutState = null; }
});

// ---------- 导出 ----------
// 把当前画布合成成一张离屏画布（fmt 决定 jpg 是否补白底）
function composeCanvas(fmt) {
  const [W, H] = canvasSize();
  const target = +document.getElementById('sizeSel').value;
  let k = target / Math.max(W, H);
  if (mode === 'sub' || mode === 'stitch') {
    // 字幕长图：按原截图分辨率导出（宽度=原图宽），超出浏览器画布像素上限时等比缩小
    k = subNativeWidth() / W;
    const maxPx = 16000000;
    if (W*k * H*k > maxPx) k = Math.sqrt(maxPx / (W*H));
  }
  const off = document.createElement('canvas');
  off.width = Math.round(W*k); off.height = Math.round(H*k);
  const oc = off.getContext('2d');
  // JPG 不支持透明，透明背景时补白底
  if (fmt === 'jpg' && bgType !== 'color') { oc.fillStyle = '#ffffff'; oc.fillRect(0, 0, off.width, off.height); }
  oc.scale(k, k);
  renderScene(oc, W, H, false);
  return off;
}
// 把合成结果作为一张新图片加入图片库（可再拖进拼图/模版组，实现嵌套复用）
function addComposedToLibrary() {
  const off = composeCanvas('png');
  const url = off.toDataURL('image/png');
  const img = new Image();
  img.onload = () => { photos.push({ id: nextId++, img, url }); renderLibrary(); };
  img.src = url;
}
// 把一张已合成的画布按所选格式下载（PDF：长图自动分页），并存入图片库
async function exportCanvas(cv) {
  const fmt = document.getElementById('fmtSel').value, stamp = Date.now();
  let out = cv;
  if (fmt !== 'png') {   // JPG / PDF 不支持透明，补白底
    out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
    const x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height); x.drawImage(cv, 0, 0);
  }
  if (fmt === 'pdf') downloadBlob(await makePdf(pdfPages(out)), `拼图_${stamp}.pdf`);
  else downloadBlob(await canvasBlob(out, fmt), `拼图_${stamp}.${fmt}`);
  const url = cv.toDataURL('image/png'), img = new Image();
  img.onload = () => { photos.push({ id: nextId++, img, url }); renderLibrary(); };
  img.src = url;
}
document.getElementById('exportBtn').onclick = () => {
  if (!photos.length) { alert(t('alertNoPhoto')); return; }
  if (mode === 'split') { splitDownload(); return; }
  exportCanvas(composeCanvas('png'));   // 导出后也存入图片库，方便复用/嵌套
};
document.getElementById('saveLibBtn').onclick = () => {
  if (!photos.length) { alert(t('alertNoPhoto')); return; }
  if (mode === 'split') { splitToLibrary(); return; }
  addComposedToLibrary();
};
document.getElementById('clearBtn').onclick = () => {
  if (!photos.length || confirm(t('confirmClear'))) {
    photos.forEach(p => URL.revokeObjectURL(p.url));
    photos = []; freeItems = []; stripOrder = []; stripCrops = {}; subOv = {}; subText = {}; stitchSeam = {}; selSeam = -1; mkSrc = null;
    pages = 1; customSize = null; splitSrc = null; splitCrop = null;
    selStrip = -1;
    initCells(); renderTray(); render();
  }
};

// ---------- 语言切换 ----------
document.querySelectorAll('#langSw button').forEach(b => {
  b.onclick = () => { lang = b.dataset.lang; applyLang(); };
});

// ---------- 手机底部标签栏（布局 / 样式 / 导出） ----------
let mPanel = 'layout';
const M_GROUPS = {
  layout: ['secTpl','secAspect','secFreeTpl','secPages','secStrip','secSub','secStitch','secMockup','secSplit','secCell','secFree'],
  style:  ['secStyle'],
  export: [],
};
function isMobile() { return window.innerWidth < 768; }
function applyMobilePanel() {
  const mobile = isMobile();
  const allIds = [].concat(M_GROUPS.layout, M_GROUPS.style, M_GROUPS.export);
  allIds.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.classList.toggle('mpanel-hide', mobile && !M_GROUPS[mPanel].includes(id));
  });
  const lib = document.querySelector('.library');
  if (lib) lib.classList.toggle('mpanel-hide', mobile && mPanel !== 'layout');
  document.querySelectorAll('#mNav button').forEach(b => b.classList.toggle('active', b.dataset.mpanel === mPanel));
  render();
}
document.querySelectorAll('#mNav button').forEach(b => {
  b.onclick = () => {
    if (b.dataset.mpanel === 'export') { toggleExportPop(true); return; }
    mPanel = b.dataset.mpanel; applyMobilePanel();
  };
});
window.addEventListener('resize', applyMobilePanel);

// ---------- 初始化 ----------
initCells();
updateSidebar();
renderTray();
render();
applyLang();
applyMobilePanel();
