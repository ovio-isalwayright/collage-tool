'use strict';
// 美化 / 套壳模式：渐变背景 + 留白 + 阴影 + 圆角 + 浏览器 / 窗口 / 手机外框
let mkSrc = null, mkFrame = 'browser', mkDark = false, mkUrl = 'example.com';
let mkPad = 8, mkRad = 14, mkShadow = 40, mkRatio = 'auto', mkBg = 0, mkBgColor = '#f1f3f8';
const MK_GRADS = [
  ['#a1c4fd', '#c2e9fb'], ['#fbc2eb', '#a6c1ee'], ['#84fab0', '#8fd3f4'], ['#fccb90', '#d57eeb'],
  ['#f6d365', '#fda085'], ['#667eea', '#764ba2'], ['#30cfd0', '#330867'], ['#232526', '#414345'],
];
function mkPhoto() { return mkSrc != null ? photoById(mkSrc) : null; }
function setMockupSource(id) { mkSrc = id; if (mode === 'mockup') { updateMockupPanel(); render(); renderLibrary(); } }

// 版式：内容尺寸、外框尺寸、画布尺寸
function mockupLayout() {
  const p = mkPhoto();
  const iw = p ? p.img.width : 1200, ih = p ? p.img.height : 800;
  const CW = Math.min(iw, 1400), CH = Math.round(ih * CW / iw);
  const bar = mkFrame === 'browser' ? Math.max(34, CW * 0.058) : mkFrame === 'window' ? Math.max(28, CW * 0.045) : 0;
  const bez = mkFrame === 'phone' ? Math.max(12, CW * 0.04) : 0;
  const FW = CW + bez * 2, FH = CH + bar + bez * 2;
  const P = Math.round(Math.max(FW, FH * 0.6) * mkPad / 100);
  let W = FW + P * 2, H = FH + P * 2;
  if (mkRatio !== 'auto') {
    const [a, b] = mkRatio.split(':').map(Number), R = a / b;
    if (W / H < R) W = H * R; else H = W / R;
  }
  return { CW, CH, bar, bez, FW, FH, W: Math.round(W), H: Math.round(H) };
}
function mockupSize() { const L = mockupLayout(); return [L.W, L.H]; }

function rr(c, x, y, w, h, r) { roundRectPath(c, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
function renderMockup(c, W, H, showUI) {
  // 背景
  if (mkBg === 'trans') { /* 透明 */ }
  else if (mkBg === 'color') { c.fillStyle = mkBgColor; c.fillRect(0, 0, W, H); }
  else {
    const g = c.createLinearGradient(0, 0, W, H), [a, b] = MK_GRADS[mkBg] || MK_GRADS[0];
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const p = mkPhoto();
  if (!p) {
    if (showUI) {
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `${Math.round(W / 34)}px sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t('mkNoSrc'), W / 2, H / 2);
    }
    return;
  }
  const L = mockupLayout();
  const x = (W - L.FW) / 2, y = (H - L.FH) / 2;
  const k = L.FW / 1000;                                         // 圆角、阴影按 1000 宽等比
  const short = Math.min(L.FW, L.FH);
  const outerR = mkFrame === 'phone' ? short * 0.11 : mkRad * k;
  const dark = mkDark;
  // 阴影 + 外框底板
  c.save();
  if (mkShadow > 0) {
    c.shadowColor = `rgba(15,20,40,${0.12 + mkShadow / 220})`;
    c.shadowBlur = L.FW * 0.07 * mkShadow / 100;
    c.shadowOffsetY = L.FW * 0.025 * mkShadow / 100;
  }
  rr(c, x, y, L.FW, L.FH, outerR);
  c.fillStyle = mkFrame === 'phone' ? (dark ? '#16181d' : '#e4e7ec') : mkFrame === 'none' ? '#fff' : (dark ? '#2b2f36' : '#eceff3');
  c.fill();
  c.restore();
  // 标题栏
  if (L.bar) {
    const cy = y + L.bar / 2, dr = L.bar * 0.13;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      c.beginPath(); c.arc(x + L.bar * 0.55 + i * dr * 3.2, cy, dr, 0, Math.PI * 2); c.fillStyle = col; c.fill();
    });
    if (mkFrame === 'browser') {
      const uw = L.FW * 0.5, uh = L.bar * 0.58, ux = x + (L.FW - uw) / 2, uy = cy - uh / 2;
      rr(c, ux, uy, uw, uh, uh / 2);
      c.fillStyle = dark ? '#3a3f47' : '#ffffff'; c.fill();
      c.fillStyle = dark ? '#c9ced8' : '#6b7280';
      c.font = `${Math.round(uh * 0.5)}px -apple-system,"Segoe UI",sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(mkUrl || '', ux + uw / 2, cy + 0.5, uw * 0.9);
    }
  }
  // 内容
  const cx = x + L.bez, cyy = y + L.bar + L.bez;
  c.save();
  if (mkFrame === 'phone') rr(c, cx, cyy, L.CW, L.CH, short * 0.085);
  else if (L.bar) {
    // 仅下方两个角圆
    const r = Math.min(outerR, L.CW / 2, L.CH / 2);
    c.beginPath();
    c.moveTo(cx, cyy); c.lineTo(cx + L.CW, cyy); c.lineTo(cx + L.CW, cyy + L.CH - r);
    c.arcTo(cx + L.CW, cyy + L.CH, cx + L.CW - r, cyy + L.CH, r);
    c.lineTo(cx + r, cyy + L.CH); c.arcTo(cx, cyy + L.CH, cx, cyy + L.CH - r, r); c.closePath();
  } else rr(c, cx, cyy, L.CW, L.CH, outerR);
  c.clip();
  c.drawImage(p.img, cx, cyy, L.CW, L.CH);
  c.restore();
  if (mkFrame === 'phone') {             // 通用前置摄像头小圆点，放在边框上不挡内容
    const land = L.CW > L.CH;
    c.beginPath(); c.arc(land ? x + L.bez / 2 : x + L.FW / 2, land ? y + L.FH / 2 : y + L.bez / 2, L.bez * 0.22, 0, Math.PI * 2);
    c.fillStyle = mkDark ? '#2c2f36' : '#b9bec8'; c.fill();
  }
}

function updateMockupPanel() {
  const box = document.getElementById('mkSrcBox'), p = mkPhoto();
  box.innerHTML = p ? `<img src="${p.url}"><span>${p.img.width} × ${p.img.height} px</span>` : `<span>${t('mkNoSrc')}</span>`;
  document.querySelectorAll('#mkFrameTabs [data-mf]').forEach(b => b.classList.toggle('active', b.dataset.mf === mkFrame));
  document.getElementById('mkUrlRow').classList.toggle('hidden', mkFrame !== 'browser');
  document.getElementById('mkRadRow').classList.toggle('hidden', mkFrame === 'phone');
  document.querySelectorAll('#mkBgList [data-bg]').forEach(b => b.classList.toggle('active', String(mkBg) === b.dataset.bg));
}
function buildMkBg() {
  const box = document.getElementById('mkBgList');
  MK_GRADS.forEach(([a, b], i) => {
    const d = document.createElement('button');
    d.dataset.bg = i; d.style.background = `linear-gradient(135deg,${a},${b})`;
    box.appendChild(d);
  });
  const tr = document.createElement('button'); tr.dataset.bg = 'trans'; tr.className = 'mk-trans'; tr.title = 'transparent'; box.appendChild(tr);
  const col = document.createElement('label'); col.className = 'mk-col'; col.dataset.bg = 'color';
  col.innerHTML = '<input type="color" id="mkBgColor" value="#f1f3f8">';
  box.appendChild(col);
  box.querySelectorAll('button[data-bg]').forEach(b => {
    b.onclick = () => { mkBg = b.dataset.bg === 'trans' ? 'trans' : +b.dataset.bg; updateMockupPanel(); render(); };
  });
  document.getElementById('mkBgColor').oninput = e => { mkBgColor = e.target.value; mkBg = 'color'; updateMockupPanel(); render(); };
}
buildMkBg();
document.querySelectorAll('#mkFrameTabs [data-mf]').forEach(b => { b.onclick = () => { mkFrame = b.dataset.mf; updateMockupPanel(); render(); }; });
document.getElementById('mkUrl').oninput = e => { mkUrl = e.target.value; render(); };
document.getElementById('mkDark').onchange = e => { mkDark = e.target.checked; render(); };
document.getElementById('mkRatio').onchange = e => { mkRatio = e.target.value; render(); };
[['mkPad', v => mkPad = v], ['mkRad', v => mkRad = v], ['mkShadow', v => mkShadow = v]].forEach(([id, set]) => {
  const el = document.getElementById(id), val = document.getElementById(id + 'Val');
  el.oninput = () => { set(+el.value); val.textContent = el.value; render(); };
});
// 导出区：把当前结果送去美化
document.getElementById('toMockupBtn').onclick = () => {
  if (!photos.length) { alert(t('alertNoPhoto')); return; }
  if (mode === 'mockup') return;
  const off = composeCanvas('png');
  const url = off.toDataURL('image/png'), img = new Image();
  img.onload = () => { const p = { id: nextId++, img, url }; photos.push(p); mkSrc = p.id; setMode('mockup'); };
  img.src = url;
};
