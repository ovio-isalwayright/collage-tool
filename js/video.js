'use strict';
// 视频导入：字幕截取 / 录屏转长图 / 抽帧宫格
const vidModal = document.getElementById('vidModal');
const vidEl = document.getElementById('vidEl');
const vidSeek = document.getElementById('vidSeek');
let vidUrl = null, vidStartT = 0, vidEndT = null, vidAutoRun = false, vidCaptured = 0, vidSeq = 0;
let vidTab = 'sub', videoWantTab = null;
function fmtT(x) { x = Math.max(0, x || 0); const m = Math.floor(x / 60), sec = x - m * 60; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1); }
function setVidTab(tb) {
  vidTab = tb;
  document.querySelectorAll('#vidTabs [data-vt]').forEach(b => b.classList.toggle('active', b.dataset.vt === tb));
  ['sub', 'rec', 'grid'].forEach(k => document.getElementById('vt_' + k).classList.toggle('hidden', k !== tb));
  document.getElementById('vidBand').style.display = tb === 'sub' ? '' : 'none';
  document.getElementById('vidStatus').textContent = '';
}
document.querySelectorAll('#vidTabs [data-vt]').forEach(b => { b.onclick = () => { if (!vidAutoRun) setVidTab(b.dataset.vt); }; });
function openVideo(file) {
  if (!file) return;
  const tab = videoWantTab || (mode === 'stitch' ? 'rec' : mode === 'sub' ? 'sub' : mode === 'template' ? 'grid' : 'sub');
  videoWantTab = null;
  if (vidUrl) URL.revokeObjectURL(vidUrl);
  vidUrl = URL.createObjectURL(file);
  vidAutoRun = false; vidCaptured = 0; vidStartT = 0; vidEndT = null;
  setAutoBtns();
  vidEl.onerror = () => { document.getElementById('vidStatus').textContent = t('vidErr'); };
  vidEl.onloadedmetadata = () => { vidSeek.max = Math.floor(vidEl.duration * 1000); vidEndT = vidEl.duration; vidUI(); };
  vidEl.src = vidUrl;
  setVidTab(tab);
  vidModal.classList.add('show');
  vidUI();
}
function closeVideo() {
  vidAutoRun = false; vidEl.pause(); vidModal.classList.remove('show');
  if (photos.length) { selStrip = -1; render(); }
}
function vidUI() {
  const d = vidEl.duration || 0;
  if (document.activeElement !== vidSeek) vidSeek.value = Math.floor(vidEl.currentTime * 1000);
  document.getElementById('vidTime').textContent = fmtT(vidEl.currentTime) + ' / ' + fmtT(d);
  document.getElementById('vidPlay').textContent = vidEl.paused ? '▶' : '❚❚';
  document.getElementById('vidCount').textContent = vidCaptured ? t('vidCount')(vidCaptured) : '';
  document.getElementById('vidRange').textContent = t('vidRange')(fmtT(vidStartT), fmtT(vidEndT != null ? vidEndT : d));
  const band = document.getElementById('vidBand');
  band.style.top = (subTop * 100) + '%'; band.style.height = (subH * 100) + '%';
}
function setAutoBtns() {
  document.getElementById('vidAuto').textContent = vidAutoRun && vidTab === 'sub' ? t('vidStop') : t('vidAuto');
  document.getElementById('vidRecGo').textContent = vidAutoRun && vidTab === 'rec' ? t('vidStop') : t('vidRecGo');
  document.getElementById('vidGridGo').textContent = vidAutoRun && vidTab === 'grid' ? t('vidStop') : t('vidGridGo');
}
['timeupdate', 'seeked', 'play', 'pause', 'loadedmetadata'].forEach(ev => vidEl.addEventListener(ev, vidUI));
vidSeek.oninput = () => { vidEl.currentTime = vidSeek.value / 1000; };
document.getElementById('vidPlay').onclick = () => { if (vidEl.paused) vidEl.play(); else vidEl.pause(); };
function vidStepFrame(dir, big) { vidEl.pause(); vidEl.currentTime = Math.max(0, Math.min(vidEl.duration || 0, vidEl.currentTime + dir * (big ? 1 : 1 / 30))); }
document.getElementById('vidPrev').onclick = () => vidStepFrame(-1);
document.getElementById('vidNext').onclick = () => vidStepFrame(1);
document.getElementById('vidStart').onclick = () => {
  vidStartT = vidEl.currentTime;
  if (vidEndT != null && vidEndT <= vidStartT) vidEndT = vidEl.duration;
  vidUI();
};
document.getElementById('vidEnd').onclick = () => {
  vidEndT = vidEl.currentTime;
  if (vidEndT <= vidStartT) vidStartT = 0;
  vidUI();
};
function vidRangeNow() {
  const d = vidEl.duration || 0;
  const end = Math.min(vidEndT != null && vidEndT > vidStartT ? vidEndT : d, d);
  return [Math.min(vidStartT, end), end];
}
function grabFrame() {
  const c = document.createElement('canvas');
  c.width = vidEl.videoWidth; c.height = vidEl.videoHeight;
  c.getContext('2d').drawImage(vidEl, 0, 0, c.width, c.height);
  return c;
}
function frameFile(cv, q) {
  return new Promise(r => cv.toBlob(b => r(new File([b], `frame_${String(++vidSeq).padStart(3, '0')}.jpg`, { type:'image/jpeg' })), 'image/jpeg', q || 0.95));
}
// 批量加入图片，返回新图片的 id（按顺序）
async function addFrames(cvs) {
  const before = nextId;
  await addFiles(await Promise.all(cvs.map(c => frameFile(c))));
  return photos.filter(p => p.id >= before).map(p => p.id);
}
async function captureFrame(cv) {
  await addFiles([await frameFile(cv)]);
  vidCaptured++; vidUI();
  if (isStrip()) stage.scrollTop = stage.scrollHeight;   // 新条出现在底部，跟随滚动
}
document.getElementById('vidCap').onclick = () => {
  if (!vidEl.videoWidth) return;
  if (mode !== 'sub') setMode('sub');
  captureFrame(grabFrame());
};
function seekTo(tm) {
  return new Promise(res => {
    if (Math.abs(vidEl.currentTime - tm) < 0.001) { res(); return; }
    const done = () => { vidEl.removeEventListener('seeked', done); clearTimeout(to); res(); };
    const to = setTimeout(done, 6000);
    vidEl.addEventListener('seeked', done);
    vidEl.currentTime = tm;
  });
}

// ---------- 字幕截取 ----------
// 字幕区缩略灰度签名 + 是否含「字幕色」(近白/近黄高亮像素)
function bandSig(cv) {
  const w = cv.width, h = cv.height;
  const sy = Math.round(h * subTop), sh = Math.max(1, Math.round(h * subH));
  const W = 320, H = Math.max(1, Math.round(sh * W / w));
  const tc = document.createElement('canvas'); tc.width = W; tc.height = H;
  const tx = tc.getContext('2d', { willReadFrequently:true });
  tx.drawImage(cv, 0, sy, w, sh, 0, 0, W, H);
  const d = tx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
  let bright = 0;
  for (let i = 0; i < g.length; i++) {
    const r = d[i*4], gg = d[i*4+1], b = d[i*4+2];
    g[i] = (r * 3 + gg * 6 + b) / 10;
    if (r > 215 && gg > 215) bright++;
  }
  return { g, hasText: bright / g.length > 0.003 };
}
function bandChanged(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 40) n++;
  return n / a.length > 0.003;
}
async function vidAutoCapture() {
  const st = document.getElementById('vidStatus');
  if (vidAutoRun) { vidAutoRun = false; return; }
  if (!vidEl.videoWidth) return;
  if (mode !== 'sub') setMode('sub');
  vidAutoRun = true; setAutoBtns(); vidEl.pause();
  const step = Math.max(0.1, +document.getElementById('vidStepSec').value || 1);
  const onlyChange = document.getElementById('vidChange').checked;
  const [start, end] = vidRangeNow();
  let tm = start, last = null, n = 0;
  while (vidAutoRun && tm <= end + 1e-6) {
    await seekTo(tm);
    const cv = grabFrame();
    if (!onlyChange) { await captureFrame(cv); n++; }
    else {
      const sig = bandSig(cv);
      if (last === null) { await captureFrame(cv); n++; }                                      // 起点：完整画面
      else if (sig.hasText && bandChanged(last.g, sig.g)) { await captureFrame(cv); n++; }   // 出现了新字幕
      last = sig;
    }
    st.textContent = t('vidProgress')(n, fmtT(tm), fmtT(end));
    tm += step;
  }
  st.textContent = t('vidFinished')(n);
  vidAutoRun = false; setAutoBtns(); vidUI();
}

// ---------- 录屏转长图 ----------
// 逐段采样；相对上一张保留帧滚动超过约半屏就再保留一张，最后交给智能拼接去重
async function vidRecord() {
  const st = document.getElementById('vidStatus');
  if (vidAutoRun) { vidAutoRun = false; return; }
  if (!vidEl.videoWidth) return;
  vidAutoRun = true; setAutoBtns(); vidEl.pause();
  const step = Math.max(0.05, +document.getElementById('vidRecStep').value || 0.25);
  const [start, end] = vidRangeNow();
  const kept = [];
  let last = null, prev = null;                 // {cv, sg}
  const keep = f => { kept.push(f.cv); last = f; };
  for (let tm = start; vidAutoRun && tm <= end + 1e-6; tm += step) {
    await seekTo(tm);
    const cur = { cv: grabFrame() }; cur.sg = sigsOf(cur.cv);
    if (!last) { keep(cur); prev = cur; continue; }
    let s = pairSeam(last.sg, cur.sg);
    if (!s.ok && prev && prev !== last) {        // 跟不上（一步滚太多）：先保留上一帧再比较
      keep(prev); s = pairSeam(last.sg, cur.sg);
    }
    const h = cur.cv.height, contentH = Math.max(1, h - s.hdr - s.aBot);
    const scrolled = s.ok ? (h - s.aBot) - s.bTop : contentH;
    if (!s.ok || scrolled > contentH * 0.55) keep(cur);
    prev = cur;
    st.textContent = t('vidRecProgress')(kept.length, fmtT(tm), fmtT(end));
    await new Promise(r => setTimeout(r, 0));
  }
  const stopped = !vidAutoRun;
  if (!stopped && prev && prev !== last) {    // 结尾：还有没收进来的内容
    const s = pairSeam(last.sg, prev.sg);
    if (!s.ok || (prev.cv.height - s.aBot) - s.bTop > 6) keep(prev);
  }
  vidAutoRun = false; setAutoBtns();
  if (stopped || !kept.length) return;
  const ids = await addFrames(kept);
  stripOrder = ids.slice();                       // 只拼这段录屏的画面
  stitchSeam = {}; selSeam = -1;
  setMode('stitch');
  autoStitch(true); render(); updateStitchPanel();
  st.textContent = t('vidRecDone')(kept.length);
  vidUI();
}

// ---------- 抽帧宫格 ----------
async function vidGrid() {
  const st = document.getElementById('vidStatus');
  if (vidAutoRun) { vidAutoRun = false; return; }
  if (!vidEl.videoWidth) return;
  const N = Math.max(2, Math.min(24, Math.round(+document.getElementById('vidGridN').value || 9)));
  vidAutoRun = true; setAutoBtns(); vidEl.pause();
  const [start, end] = vidRangeNow();
  const cvs = [];
  for (let i = 0; i < N && vidAutoRun; i++) {
    await seekTo(start + (end - start) * (i + 0.5) / N);
    cvs.push(grabFrame());
    st.textContent = `${i + 1} / ${N}`;
  }
  const stopped = !vidAutoRun;
  vidAutoRun = false; setAutoBtns();
  if (stopped || !cvs.length) return;
  const ids = await addFrames(cvs);
  const dist = genDist(ids.length), rows = dist.length, cols = Math.max(...dist);
  const fw = cvs[0].width, fh = cvs[0].height;
  let W = cols * fw, H = rows * fh;
  const k = 2400 / Math.max(W, H); W = Math.round(W * k); H = Math.round(H * k);
  if (mode !== 'template') setMode('template');
  customSize = [W, H];
  generateCustomTemplate(genPerRow(dist));
  ids.forEach((id, i) => { if (cells[i]) cells[i] = { p:id, zoom:1, ox:0, oy:0, crop:null, text:null }; });
  updateSidebar(); render();
  st.textContent = t('vidGridDone')(ids.length);
}

document.getElementById('vidAuto').onclick = vidAutoCapture;
document.getElementById('vidRecGo').onclick = vidRecord;
document.getElementById('vidGridGo').onclick = vidGrid;
document.getElementById('vidDone').onclick = closeVideo;
document.getElementById('vidOpenBtn').onclick = () => document.getElementById('vidInput').click();
document.getElementById('vidInput').onchange = e => { openVideo(e.target.files[0]); e.target.value = ''; };
// 视频上的字幕区选框（与侧栏统一设置同步）
(function () {
  const stg = document.getElementById('vidStage'), band = document.getElementById('vidBand');
  let vd = null;
  const fy = e => { const r = stg.getBoundingClientRect(); return (e.clientY - r.top) / r.height; };
  band.addEventListener('pointerdown', e => {
    const h = e.target.dataset && e.target.dataset.h;
    vd = { type: h || 'move', dy: fy(e) - subTop };
    band.setPointerCapture(e.pointerId); e.preventDefault();
  });
  band.addEventListener('pointermove', e => {
    if (!vd) return;
    const y = Math.max(0, Math.min(1, fy(e))), minH = 0.02;
    if (vd.type === 'top') { const bot = subTop + subH; subTop = Math.min(y, bot - minH); subH = bot - subTop; }
    else if (vd.type === 'bot') subH = Math.max(minH, y - subTop);
    else subTop = Math.max(0, Math.min(1 - subH, y - vd.dy));
    vidUI(); render();
  });
  ['pointerup', 'pointercancel'].forEach(ev => band.addEventListener(ev, () => { vd = null; }));
})();
window.addEventListener('keydown', e => {
  if (!vidModal.classList.contains('show') || /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
  if (e.key === 'ArrowLeft') { vidStepFrame(-1, e.shiftKey); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { vidStepFrame(1, e.shiftKey); e.preventDefault(); }
  else if (e.key === ' ') { document.getElementById('vidPlay').click(); e.preventDefault(); }
  else if ((e.key === 's' || e.key === 'S') && vidTab === 'sub') { document.getElementById('vidCap').click(); }
  else if (e.key === 'Escape') closeVideo();
});
