'use strict';
// 模板定义、画布尺寸、绘制、模式切换、通用控件
// ---------- 模板定义 ----------
// 每个格子可以是矩形 [x,y,w,h]，或多边形 [[x,y],[x,y],...]（异形分割），坐标均为 0~1 比例
const TEMPLATES = [
  // ——基础——
  [[0,0,1,1]],
  [[0,0,.5,1],[.5,0,.5,1]],
  [[0,0,1,.5],[0,.5,1,.5]],
  [[0,0,1/3,1],[1/3,0,1/3,1],[2/3,0,1/3,1]],
  [[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]],
  // ——横向/竖向条——
  [[0,0,.25,1],[.25,0,.25,1],[.5,0,.25,1],[.75,0,.25,1]],
  [[0,0,1,.25],[0,.25,1,.25],[0,.5,1,.25],[0,.75,1,.25]],
  [[0,0,1,1/3],[0,1/3,1,1/3],[0,2/3,1,1/3]],
  // ——大图 + 小图——
  [[0,0,.5,1],[.5,0,.5,.5],[.5,.5,.5,.5]],
  [[0,0,1,.5],[0,.5,.5,.5],[.5,.5,.5,.5]],
  [[0,0,.5,.5],[.5,0,.5,.5],[0,.5,1,.5]],
  [[0,0,2/3,1],[2/3,0,1/3,.5],[2/3,.5,1/3,.5]],
  [[0,0,.5,1],[.5,0,.5,1/3],[.5,1/3,.5,1/3],[.5,2/3,.5,1/3]],
  [[0,0,1,.6],[0,.6,1/3,.4],[1/3,.6,1/3,.4],[2/3,.6,1/3,.4]],
  [[0,0,2/3,1],[2/3,0,1/3,1/3],[2/3,1/3,1/3,1/3],[2/3,2/3,1/3,1/3]],
  // ——5 / 6 / 7 / 8 / 9——
  [[0,0,.5,1],[.5,0,.25,.5],[.75,0,.25,.5],[.5,.5,.25,.5],[.75,.5,.25,.5]],
  [[0,0,1,.5],[0,.5,.25,.5],[.25,.5,.25,.5],[.5,.5,.25,.5],[.75,.5,.25,.5]],
  [[0,0,1,.25],[0,.25,.25,.5],[.25,.25,.5,.5],[.75,.25,.25,.5],[0,.75,1,.25]],
  [[0,0,1/3,.5],[1/3,0,1/3,.5],[2/3,0,1/3,.5],[0,.5,1/3,.5],[1/3,.5,1/3,.5],[2/3,.5,1/3,.5]],
  [[0,0,1,.4],[0,.4,1/3,.3],[1/3,.4,1/3,.3],[2/3,.4,1/3,.3],[0,.7,1/3,.3],[1/3,.7,1/3,.3],[2/3,.7,1/3,.3]],
  [[0,0,.5,.34],[.5,0,.5,.34],[0,.34,1/3,.33],[1/3,.34,1/3,.33],[2/3,.34,1/3,.33],[0,.67,1/3,.33],[1/3,.67,1/3,.33],[2/3,.67,1/3,.33]],
  [[0,0,1/3,1/3],[1/3,0,1/3,1/3],[2/3,0,1/3,1/3],[0,1/3,1/3,1/3],[1/3,1/3,1/3,1/3],[2/3,1/3,1/3,1/3],[0,2/3,1/3,1/3],[1/3,2/3,1/3,1/3],[2/3,2/3,1/3,1/3]],
  // ——异形分割（多边形）——
  [[[0,0],[1,0],[0,1]],[[1,0],[1,1],[0,1]]],
  [[[0,0],[1,0],[1,1]],[[0,0],[1,1],[0,1]]],
  [[[0,0],[.6,0],[.4,1],[0,1]],[[.6,0],[1,0],[1,1],[.4,1]]],
  [[[0,0],[1,0],[1,.6],[0,.4]],[[0,.4],[1,.6],[1,1],[0,1]]],
  [[[0,0],[1,0],[.5,.5]],[[1,0],[1,1],[.5,.5]],[[1,1],[0,1],[.5,.5]],[[0,1],[0,0],[.5,.5]]],
  [[[0,0],[.4,0],[.25,1],[0,1]],[[.4,0],[.75,0],[.6,1],[.25,1]],[[.75,0],[1,0],[1,1],[.6,1]]],
];
function isPolyCell(cell) { return Array.isArray(cell[0]); }
function isPolyTemplate(t) { return t.some(isPolyCell); }

// ---------- 画布尺寸 ----------
function baseSize() {
  if (customSize) return customSize.slice();
  const map = {'1:1':[1200,1200],'4:3':[1280,960],'3:4':[960,1280],'16:9':[1440,810],'9:16':[810,1440]};
  return map[aspect];
}
function canvasSize() {
  if (mode === 'template') return baseSize();
  if (mode === 'free') { const b = baseSize(); return [b[0]*pages, b[1]]; }
  if (mode === 'split') return splitPreviewSize();
  if (mode === 'mockup') return mockupSize();
  const list = stripOrder.map(id => photoById(id)).filter(Boolean);
  if (!list.length) return [1000, 700];
  const m = stripMargin(), g = stripGapPx();
  if (sDir() === 'v') {
    const W = 1000, cw = W - 2*m;
    let H = m;
    list.forEach((p, i) => { const s = stripSrc(p, i); H += cw * s.sh / s.sw + g; });
    return [W, Math.max(H - g + m, 200)];
  } else {
    const H = 1000, ch = H - 2*m;
    let W = m;
    list.forEach((p, i) => { const s = stripSrc(p, i); W += ch * s.sw / s.sh + g; });
    return [Math.max(W - g + m, 200), H];
  }
}
function photoById(id) { return photos.find(p => p.id === id); }
function isStrip() { return mode === 'strip' || mode === 'sub' || mode === 'stitch'; }
function sDir() { return mode === 'sub' || mode === 'stitch' ? 'v' : stripDir; }   // 字幕 / 智能拼接固定竖向

// ---------- 绘制 ----------
function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r, y);
  c.arcTo(x+w, y, x+w, y+h, r);
  c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r);
  c.arcTo(x, y, x+w, y, r);
  c.closePath();
}
// 计算指定模版在矩形框 [X,Y,W,H] 内每个格子的形状：{rect, bbox:[x,y,w,h], poly}
function templateShapes(tpl, X, Y, W, H, g) {
  const ax = X + g/2, ay = Y + g/2, aw = W-g, ah = H-g;
  return TEMPLATES[tpl].map(f => {
    if (!isPolyCell(f)) {
      const x = ax + f[0]*aw + g/2, y = ay + f[1]*ah + g/2, w = f[2]*aw - g, h = f[3]*ah - g;
      return { rect:true, bbox:[x,y,w,h], poly:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]] };
    }
    // 多边形：映射到框内，再以包围盒中心统一内缩产生间距
    const pts = f.map(([ux,uy]) => [X + ux*W, Y + uy*H]);
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    pts.forEach(p => { minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]); maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]); });
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2, bw=maxx-minx, bh=maxy-miny;
    const fx = bw>0 ? Math.max(0, (bw-g)/bw) : 1, fy = bh>0 ? Math.max(0, (bh-g)/bh) : 1;
    const poly = pts.map(p => [cx+(p[0]-cx)*fx, cy+(p[1]-cy)*fy]);
    let nx=1e9,ny=1e9,mx2=-1e9,my2=-1e9;
    poly.forEach(p => { nx=Math.min(nx,p[0]); ny=Math.min(ny,p[1]); mx2=Math.max(mx2,p[0]); my2=Math.max(my2,p[1]); });
    return { rect:false, bbox:[nx,ny,mx2-nx,my2-ny], poly };
  });
}
// 计算当前模版每个格子的绘制形状
function cellShapes(W, H) { return templateShapes(tplIndex, 0, 0, W, H, gap); }
// 兼容旧调用
function cellRects(W, H) { return cellShapes(W, H); }
function shapePath(c, shape, r) {
  if (r == null) r = radius;
  if (shape.rect) { roundRectPath(c, shape.bbox[0], shape.bbox[1], shape.bbox[2], shape.bbox[3], r); return; }
  c.beginPath();
  shape.poly.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
  c.closePath();
}
// 封面式填充：把图片按 cover 填进形状并裁到形状内
function drawCoverInShape(c, img, shape, r, crop) {
  const [x,y,w,h] = shape.bbox;
  const cr = crop || { sx:0, sy:0, sw:img.width, sh:img.height };
  const s = Math.max(w/cr.sw, h/cr.sh);
  const dw = cr.sw*s, dh = cr.sh*s;
  c.save();
  shapePath(c, shape, r);
  c.clip();
  c.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
  c.restore();
}
// 在格子底部画标题栏文字
function drawCaption(c, shape, text) {
  if (!text) return;
  const [x,y,w,h] = shape.bbox;
  const barH = Math.max(22, Math.min(h*0.22, 60));
  c.save();
  shapePath(c, shape);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,.92)';
  c.fillRect(x, y+h-barH, w, barH);
  c.fillStyle = '#222';
  const fs = Math.min(barH*0.5, 30);
  c.font = `600 ${fs}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  // 截断过长文字
  let s = text; const maxW = w - 16;
  while (s.length && c.measureText(s).width > maxW) s = s.slice(0, -1);
  if (s !== text && s.length) s = s.slice(0, -1) + '…';
  c.fillText(s, x+8, y+h-barH/2);
  c.restore();
}
function pointInShape(shape, pt) {
  const [x,y,w,h] = shape.bbox;
  if (pt.x < x || pt.x > x+w || pt.y < y || pt.y > y+h) return false;
  if (shape.rect) return true;
  let inside = false, poly = shape.poly;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
    if (((yi>pt.y)!==(yj>pt.y)) && (pt.x < (xj-xi)*(pt.y-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}
function cropOf(cell, img) {
  return cell.crop || { sx:0, sy:0, sw:img.width, sh:img.height };
}
function clampCell(cell, shape, img) {
  const [,,w,h] = shape.bbox;
  const cr = cropOf(cell, img);
  const s = Math.max(w/cr.sw, h/cr.sh) * cell.zoom;
  // 用绝对值：图片大于格子时可平移；小于格子时可在格内移动、四周露背景
  const mx = Math.abs(cr.sw*s - w)/2, my = Math.abs(cr.sh*s - h)/2;
  cell.ox = Math.max(-mx, Math.min(mx, cell.ox));
  cell.oy = Math.max(-my, Math.min(my, cell.oy));
}
function drawCellImage(c, img, shape, cell) {
  const [x,y,w,h] = shape.bbox;
  const cr = cropOf(cell, img);
  const s = Math.max(w/cr.sw, h/cr.sh) * cell.zoom;
  const dw = cr.sw*s, dh = cr.sh*s;
  c.save();
  shapePath(c, shape);
  c.clip();
  c.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, x+(w-dw)/2+cell.ox, y+(h-dh)/2+cell.oy, dw, dh);
  c.restore();
}
// 自由模式的模版组：返回组内每个格子在“本地坐标（组中心为原点）”下的形状
function groupLocalShapes(it) {
  const bw = it.w*it.scale, bh = it.h*it.scale;
  const g = (it.gap != null ? it.gap : 16) * it.scale;
  return templateShapes(it.tpl, -bw/2, -bh/2, bw, bh, g);
}
function drawGroup(c, it, showUI) {
  c.save();
  c.translate(it.x, it.y); c.rotate(it.rot);
  const shapes = groupLocalShapes(it);
  const gr = (it.rad != null ? it.rad : 8) * it.scale;
  shapes.forEach((sh, k) => {
    const sc = it.sub[k];
    const ph = sc && sc.p != null ? photoById(sc.p) : null;
    if (ph) {
      drawCoverInShape(c, ph.img, sh, gr, sc.crop);
      if (sc.text) drawCaption(c, sh, sc.text);
    } else if (showUI) {
      c.save();
      shapePath(c, sh, gr);
      c.fillStyle = '#f0f1f3'; c.fill();
      c.setLineDash([6,5]); c.strokeStyle = '#c0c4cc'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#a0a4ae'; c.font = '22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const bb = sh.bbox; c.fillText('＋', bb[0]+bb[2]/2, bb[1]+bb[3]/2);
      c.restore();
    } else if (bgType === 'color') {
      // 导出时空格子填底色（透明/图片背景时留空以透出背景）
      c.save(); shapePath(c, sh, gr); c.fillStyle = '#f0f1f3'; c.fill(); c.restore();
    }
  });
  c.restore();
}
// 命中组内某个子格子：返回下标或 -1（pt 为画布坐标）
function groupCellAt(it, pt) {
  const lp = toLocal(pt, it);
  const shapes = groupLocalShapes(it);
  return shapes.findIndex(sh => pointInShape(sh, lp));
}
function stripMargin() { return mode === 'sub' ? subBorder : mode === 'stitch' ? 0 : gap; }   // 字幕：外边框；拼接：无边距
function stripGapPx() { return mode === 'sub' ? subGap : mode === 'stitch' ? 0 : gap; }
function stripSrc(p, idx) {
  const cr = stripCrops[p.id];
  if (cr) return { sx:cr.sx, sy:cr.sy, sw:cr.sw, sh:cr.sh };       // 单张手动裁剪优先
  const iw = p.img.width, ih = p.img.height;
  if (mode === 'stitch') { const r = stitchRange(p); return { sx:0, sy:r.sy, sw:iw, sh:r.sh }; }
  if (mode === 'sub' && !(idx === 0 && subFirstFull)) {
    const ov = subOv[p.id], top = ov ? ov.top : subTop, hh = ov ? ov.h : subH;
    const sy = Math.min(ih - 1, Math.round(ih * top));
    return { sx:0, sy, sw:iw, sh:Math.max(1, Math.min(ih - sy, Math.round(ih * hh))) };
  }
  return { sx:0, sy:0, sw:iw, sh:ih };
}
function stripRects(W, H) {
  const list = stripOrder.map(id => photoById(id)).filter(Boolean);
  const out = [];
  const m = stripMargin(), g = stripGapPx();
  if (sDir() === 'v') {
    const cw = W - 2*m;
    let y = m;
    list.forEach((p, i) => {
      const s = stripSrc(p, i);
      const h = cw * s.sh / s.sw;
      out.push({ id:p.id, img:p.img, x:m, y, w:cw, h, src:s });
      y += h + g;
    });
  } else {
    const ch = H - 2*m;
    let x = m;
    list.forEach((p, i) => {
      const s = stripSrc(p, i);
      const w = ch * s.sw / s.sh;
      out.push({ id:p.id, img:p.img, x, y:m, w, h:ch, src:s });
      x += w + g;
    });
  }
  return out;
}
function drawBgImage(c, W, H) {
  const iw = bgImg.width, ih = bgImg.height;
  if (bgFit === 'stretch') { c.drawImage(bgImg, 0, 0, W, H); return; }
  const s = bgFit === 'contain' ? Math.min(W/iw, H/ih) : Math.max(W/iw, H/ih);
  const dw = iw*s, dh = ih*s;
  c.drawImage(bgImg, (W-dw)/2, (H-dh)/2, dw, dh);
}
function renderScene(c, W, H, showUI) {
  c.clearRect(0, 0, W, H);
  if (mode === 'split') { renderSplitScene(c, W, H); return; }
  if (mode === 'mockup') { renderMockup(c, W, H, showUI); return; }
  if (bgType === 'color') { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
  else if (bgType === 'image' && bgImg) drawBgImage(c, W, H);
  // transparent: 不填充
  if (mode === 'template') {
    const shapes = cellShapes(W, H);
    shapes.forEach((sh, i) => {
      const cell = cells[i];
      const ph = cell && cell.p != null ? photoById(cell.p) : null;
      const bb = sh.bbox;
      if (ph) {
        clampCell(cell, sh, ph.img);
        drawCellImage(c, ph.img, sh, cell);
        if (cell.text) drawCaption(c, sh, cell.text);
      } else if (showUI) {
        c.save();
        shapePath(c, sh);
        c.fillStyle = '#f0f1f3'; c.fill();
        c.setLineDash([8,6]); c.strokeStyle = '#c0c4cc'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#a0a4ae'; c.font = '32px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('＋', bb[0]+bb[2]/2, bb[1]+bb[3]/2);
        c.restore();
      }
      if (showUI && i === selCell && i !== swapTarget) {
        c.save();
        shapePath(c, sh);
        c.strokeStyle = '#4f8cff'; c.lineWidth = 5; c.stroke();
        c.restore();
      }
      if (showUI && i === swapTarget) {
        c.save();
        shapePath(c, sh);
        c.fillStyle = 'rgba(46,163,107,.28)'; c.fill();
        c.setLineDash([10,7]); c.strokeStyle = '#2ea36b'; c.lineWidth = 5; c.stroke();
        c.restore();
      }
    });
  } else if (mode === 'free') {
    freeItems.forEach((it, i) => {
      if (it.type === 'group') drawGroup(c, it, showUI);
      else {
        const ph = photoById(it.p);
        if (!ph) return;
        const w = it.w * it.scale, h = it.h * it.scale;
        c.save();
        c.translate(it.x, it.y);
        c.rotate(it.rot);
        roundRectPath(c, -w/2, -h/2, w, h, radius);
        c.clip();
        if (it.crop) c.drawImage(ph.img, it.crop.sx, it.crop.sy, it.crop.sw, it.crop.sh, -w/2, -h/2, w, h);
        else c.drawImage(ph.img, -w/2, -h/2, w, h);
        c.restore();
      }
      if (showUI && i === selFree) {
        const w = it.w * it.scale, h = it.h * it.scale;
        c.save();
        c.translate(it.x, it.y); c.rotate(it.rot);
        c.strokeStyle = '#4f8cff'; c.lineWidth = 3;
        c.strokeRect(-w/2, -h/2, w, h);
        c.fillStyle = '#4f8cff';
        c.beginPath(); c.arc(w/2, h/2, 14, 0, 7); c.fill();       // 右下角
        c.beginPath(); c.moveTo(0, -h/2); c.lineTo(0, -h/2-40); c.stroke();
        c.beginPath(); c.arc(0, -h/2-40, 14, 0, 7); c.fill();     // 旋转
        if (it.type === 'group') {
          c.beginPath(); c.arc(w/2, 0, 12, 0, 7); c.fill();       // 右边：拉宽
          c.beginPath(); c.arc(0, h/2, 12, 0, 7); c.fill();       // 下边：拉高
        }
        c.restore();
      }
    });
    if (showUI && pages > 1) {
      const pw = W / pages;
      c.save();
      c.setLineDash([10,8]); c.strokeStyle = 'rgba(79,140,255,.5)'; c.lineWidth = 2;
      for (let k = 1; k < pages; k++) {
        c.beginPath(); c.moveTo(k*pw, 0); c.lineTo(k*pw, H); c.stroke();
      }
      c.restore();
    }
  } else { // strip
    const rad = mode === 'sub' || mode === 'stitch' ? 0 : radius;
    const rects = stripRects(W, H);
    rects.forEach((r, i) => {
      c.save(); roundRectPath(c, r.x, r.y, r.w, r.h, rad); c.clip();
      c.drawImage(r.img, r.src.sx, r.src.sy, r.src.sw, r.src.sh, r.x, r.y, r.w, r.h); c.restore();
      if (showUI && i === selStrip) {
        c.save();
        roundRectPath(c, r.x, r.y, r.w, r.h, rad);
        c.strokeStyle = '#4f8cff'; c.lineWidth = 6; c.stroke();
        c.restore();
      }
    });
    if (mode === 'sub') drawSubExtras(c, rects, W, H, showUI);
    if (mode === 'stitch' && showUI) drawSeams(c, rects);
  }
}
function fitCanvas() {
  const availW = Math.max(stage.clientWidth - 48, 100);
  const availH = Math.max(stage.clientHeight - 48, 100);
  let s = Math.min(availW / canvas.width, availH / canvas.height, 1);
  stage.classList.toggle('scroll', mode === 'split' || mode === 'sub' || mode === 'stitch');
  if (mode === 'split' && splitSrc != null) {
    // 长图不要缩成细条：保证可读宽度/高度，超出部分在舞台内滚动
    const minW = Math.min(availW, 420), minH = Math.min(availH, 280);
    if (canvas.height > canvas.width * 1.5 && canvas.width * s < minW) s = minW / canvas.width;   // 竖长图
    if (canvas.width > canvas.height * 2 && canvas.height * s < minH) s = minH / canvas.height;   // 横长图
  }
  if (mode === 'sub' || mode === 'stitch') {
    // 字幕 / 拼接长图：宽度优先铺满舞台，太长就在舞台内竖向滚动，保证字幕可读
    const sW = Math.min(availW / canvas.width, 1);
    s = Math.max(s, Math.min(sW, 460 / canvas.width));
  }
  canvas.style.width = Math.round(canvas.width * s) + 'px';
  canvas.style.height = Math.round(canvas.height * s) + 'px';
}
function render() {
  const [W, H] = canvasSize();
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  if (mode === 'split') fitCanvas();   // 分割模式按显示尺寸画线宽/手柄，需先定好显示尺寸
  renderScene(ctx, W, H, true);
  fitCanvas();
  canvas.classList.toggle('alpha', bgTransparent || mode === 'split');
  const src = mode === 'split' ? splitSource() : null;
  document.getElementById('sizeLabel').textContent = src ? t('srcSizeLabel')(src.cr.sw, src.cr.sh) : t('sizeLabel')(Math.round(W), Math.round(H));
  if (mode === 'sub') updateSubPanel();
  if (mode === 'stitch') updateStitchPanel();
}
window.addEventListener('resize', render);

// ---------- 模板缩略图（模板列表 + 自由模式模版组共用） ----------
function makeTplThumb(tpl, i) {
  const d = document.createElement('div');
  d.className = 'tpl';
  if (isPolyTemplate(tpl)) {
    const parts = tpl.map(f => {
      const pts = f.map(([ux,uy]) => [ux*100, uy*100]);
      let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
      pts.forEach(p=>{minx=Math.min(minx,p[0]);miny=Math.min(miny,p[1]);maxx=Math.max(maxx,p[0]);maxy=Math.max(maxy,p[1]);});
      const cx=(minx+maxx)/2, cy=(miny+maxy)/2, bw=maxx-minx, bh=maxy-miny;
      const fx=bw>0?(bw-6)/bw:1, fy=bh>0?(bh-6)/bh:1;
      const ins = pts.map(p=>`${(cx+(p[0]-cx)*fx).toFixed(1)},${(cy+(p[1]-cy)*fy).toFixed(1)}`).join(' ');
      return `<polygon points="${ins}" class="pc"/>`;
    }).join('');
    d.innerHTML = `<svg viewBox="0 0 100 100" style="position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px)">${parts}</svg>`;
  } else {
    const g = document.createElement('div');
    g.className = 'grid';
    tpl.forEach(f => {
      const b = document.createElement('i');
      b.style.cssText = `left:calc(${f[0]*100}% + 1px);top:calc(${f[1]*100}% + 1px);width:calc(${f[2]*100}% - 2px);height:calc(${f[3]*100}% - 2px)`;
      g.appendChild(b);
    });
    d.appendChild(g);
  }
  return d;
}
// 模板模式的模板列表
const tplList = document.getElementById('tplList');
TEMPLATES.forEach((tpl, i) => {
  const d = makeTplThumb(tpl, i);
  if (i === tplIndex) d.classList.add('active');
  d.onclick = () => {
    tplIndex = i;
    tplList.querySelectorAll('.tpl').forEach((e,j) => e.classList.toggle('active', j===i));
    initCells();
    render();
  };
  tplList.appendChild(d);
});
// 自由模式：点击模板把它作为一组加入画布
const freeTplList = document.getElementById('freeTplList');
TEMPLATES.forEach((tpl, i) => {
  const d = makeTplThumb(tpl, i);
  d.onclick = () => addGroup(i);
  freeTplList.appendChild(d);
});
function addGroup(tplIdx) {
  const b = baseSize();
  const bw = Math.min(b[0], b[1]) * 0.6;
  const n = TEMPLATES[tplIdx].length;
  freeItems.push({ type:'group', tpl:tplIdx, x:b[0]*pages/2, y:b[1]/2, w:bw, h:bw, scale:1, rot:0, gap:16, rad:8,
    sub:Array.from({length:n}, () => ({ p:null, crop:null, text:null })) });
  selFree = freeItems.length - 1;
  updateSidebar(); render();
}
// ---------- 自定义模版：按张数生成最匀称的网格 ----------
// 按“每行各放几个”的数组生成布局，如 [3,4,4,3]
function genPerRow(list) {
  list = list.map(x => Math.max(1, Math.min(12, Math.round(x)))).filter(x => x > 0).slice(0, 12);
  if (!list.length) return null;
  const rows = list.length, rh = 1/rows, out = [];
  for (let r = 0; r < rows; r++) { const cw = 1/list[r]; for (let c = 0; c < list[r]; c++) out.push([c*cw, r*rh, cw, rh]); }
  return out;
}
// 固定行×列网格
function genRowsCols(rows, cols) {
  rows = Math.max(1, Math.min(8, Math.round(rows)));
  cols = Math.max(1, Math.min(8, Math.round(cols)));
  return genPerRow(Array(rows).fill(cols));
}
// 按张数自动排最匀称的分布，如 14 -> [4,4,3,3]
function genDist(n) {
  n = Math.max(1, Math.min(24, Math.round(n)));
  const rows = Math.max(1, Math.round(Math.sqrt(n)));
  const base = Math.floor(n / rows), rem = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < rem ? 1 : 0));
}
// 智能解析输入：行×列(3x3) / 每行分布(3,4,4,3) / 张数(9)
function parseCustomSpec(s) {
  s = (s || '').trim();
  if (!s) return null;
  if (/[×xX*]/.test(s)) {                       // 行 × 列
    const m = s.split(/[×xX*]/).map(x => parseInt(x, 10));
    if (m.length === 2 && m[0] > 0 && m[1] > 0) return genRowsCols(m[0], m[1]);
  }
  if (/[,，、\s]/.test(s)) {                      // 每行分布
    const list = s.split(/[,，、\s]+/).map(x => parseInt(x, 10)).filter(x => x > 0);
    if (list.length) return genPerRow(list);
  }
  const n = parseInt(s, 10);                     // 张数
  if (n > 0) return genPerRow(genDist(n));
  return null;
}
let customTplIndex = -1, customThumb = null;
function generateCustomTemplate(layout) {
  if (customTplIndex < 0) { TEMPLATES.push(layout); customTplIndex = TEMPLATES.length - 1; }
  else TEMPLATES[customTplIndex] = layout;
  if (customThumb) customThumb.remove();
  customThumb = makeTplThumb(layout, customTplIndex);
  customThumb.onclick = () => {
    tplIndex = customTplIndex;
    document.querySelectorAll('#tplList .tpl').forEach(e => e.classList.remove('active'));
    customThumb.classList.add('active');
    initCells(); render();
  };
  tplList.appendChild(customThumb);
  tplIndex = customTplIndex;
  document.querySelectorAll('#tplList .tpl').forEach(e => e.classList.remove('active'));
  customThumb.classList.add('active');
  initCells(); render();
}
function initCells() {
  const n = TEMPLATES[tplIndex].length;
  cells = Array.from({length:n}, (_, i) => ({ p: photos[i] ? photos[i].id : null, zoom:1, ox:0, oy:0, crop:null, text:null }));
  selCell = -1;
  updateSidebar();
}

// ---------- 模式切换 ----------
const hintKey = { template:'hintTemplate', free:'hintFree', strip:'hintStrip', split:'hintSplit', sub:'hintSub', stitch:'hintStitch', mockup:'hintMockup' };
function setMode(m) {
  mode = m;
  document.querySelectorAll('.tabs [data-mode]').forEach(e => e.classList.toggle('active', e.dataset.mode === m));
  selCell = -1; selFree = -1; selStrip = -1;
  if (m === 'split' && splitSrc == null && photos.length) setSplitSource(photos[photos.length - 1].id);
  if (m === 'split' && mPanel === 'style') mPanel = 'layout';
  if ((m === 'split' || m === 'mockup') && mPanel === 'style') mPanel = 'layout';
  if (m === 'mockup' && mkSrc == null && photos.length) mkSrc = photos[photos.length - 1].id;
  selSeam = -1;
  if (m === 'stitch' && stripOrder.length > 1) autoStitch(false);     // 新进入或新加图：补算缺的接缝
  hidePop();
  updateSidebar();
  render();
  renderTray();
  applyMobilePanel();
}
document.querySelectorAll('.tabs [data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
document.querySelectorAll('[data-dir]').forEach(b => {
  b.onclick = () => {
    stripDir = b.dataset.dir;
    document.querySelectorAll('[data-dir]').forEach(e => e.classList.toggle('active', e === b));
    selStrip = -1;
    render();
  };
});
function updateSidebar() {
  document.getElementById('secTpl').classList.toggle('hidden', mode !== 'template');
  document.getElementById('secAspect').classList.toggle('hidden', isStrip() || mode === 'split' || mode === 'mockup');
  document.getElementById('secStitch').classList.toggle('hidden', mode !== 'stitch');
  document.getElementById('secMockup').classList.toggle('hidden', mode !== 'mockup');
  if (mode === 'mockup') updateMockupPanel();
  document.getElementById('annExportBtn').classList.toggle('hidden', mode === 'split');
  document.getElementById('toMockupBtn').classList.toggle('hidden', mode === 'split' || mode === 'mockup');
  document.getElementById('secSub').classList.toggle('hidden', mode !== 'sub');
  document.getElementById('rowGap').classList.toggle('hidden', mode === 'sub');
  document.getElementById('rowRad').classList.toggle('hidden', mode === 'sub');
  document.getElementById('secStyle').classList.toggle('hidden', mode === 'split' || mode === 'mockup' || mode === 'stitch');
  document.getElementById('secSplit').classList.toggle('hidden', mode !== 'split');
  document.getElementById('sizeField').classList.toggle('hidden', mode === 'split' || mode === 'sub' || mode === 'stitch');
  document.querySelector('#mNav [data-mpanel="style"]').classList.toggle('hidden', mode === 'split' || mode === 'mockup' || mode === 'stitch');
  if (mode === 'split') {
    const pieces = (splitXs.length - 1) * (splitYs.length - 1);
    document.getElementById('exportBtn').textContent =
      splitMethod === 'region' ? t('regionDl')
      : splitSel.size ? (splitSel.size > 1 ? t('splitDlSel')(splitSel.size) : t('splitDl1'))
      : pieces > 1 ? t('splitDl') : t('splitDl1');
    updateSplitPanel();
  } else {
    document.getElementById('exportBtn').textContent = t('exportBtn');
  }
  document.getElementById('secFreeTpl').classList.toggle('hidden', mode !== 'free');
  document.getElementById('secPages').classList.toggle('hidden', mode !== 'free');
  document.getElementById('secStrip').classList.toggle('hidden', mode !== 'strip');
  const cellSel = mode === 'template' && selCell >= 0 && cells[selCell] && cells[selCell].p != null;
  document.getElementById('secCell').classList.toggle('hidden', !cellSel);
  const freeItem = mode === 'free' && selFree >= 0 && freeItems[selFree];
  document.getElementById('secFree').classList.toggle('hidden', !(freeItem && freeItems[selFree].type !== 'group'));
  document.getElementById('modeHint').textContent = t(hintKey[mode]);
  document.getElementById('pageInfo').textContent = t('pageInfo')(pages);
  wrap.classList.toggle('noresize', isStrip() || mode === 'split' || mode === 'mockup');
  if (cellSel) {
    const cell = cells[selCell];
    document.getElementById('zoomSlider').value = Math.round(cell.zoom*100);
    document.getElementById('zoomVal').textContent = cell.zoom.toFixed(1);
    document.getElementById('captInput').value = cell.text || '';
  }
}

// ---------- 通用控件 ----------
function bindSlider(id, valId, fn) {
  const s = document.getElementById(id);
  s.oninput = () => { document.getElementById(valId).textContent = s.value; fn(+s.value); render(); };
}
bindSlider('gapSlider', 'gapVal', v => gap = v);
bindSlider('radSlider', 'radVal', v => radius = v);
document.getElementById('bgPicker').oninput = e => { bg = e.target.value; render(); };
document.getElementById('bgImgBtn').onclick = () => document.getElementById('bgImgInput').click();
document.getElementById('bgImgInput').onchange = e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  if (bgImgUrl) URL.revokeObjectURL(bgImgUrl);
  bgImgUrl = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => { bgImg = img; render(); };
  img.src = bgImgUrl;
  e.target.value = '';
};
document.getElementById('bgImgClear').onclick = () => {
  if (bgImgUrl) URL.revokeObjectURL(bgImgUrl);
  bgImg = null; bgImgUrl = null;
  render();
};
document.getElementById('bgFitSel').onchange = e => { bgFit = e.target.value; render(); };
document.querySelectorAll('#bgTypeTabs button').forEach(b => {
  b.onclick = () => {
    bgType = b.dataset.bgtype;
    bgTransparent = bgType === 'transparent';
    document.querySelectorAll('#bgTypeTabs button').forEach(e => e.classList.toggle('active', e === b));
    document.getElementById('bgColorRow').style.display = bgType === 'color' ? 'flex' : 'none';
    document.getElementById('bgImageRow').style.display = bgType === 'image' ? 'block' : 'none';
    if (bgType === 'image' && !bgImg) document.getElementById('bgImgInput').click();
    render();
  };
});
document.getElementById('aspectSel').onchange = e => { aspect = e.target.value; customSize = null; render(); };
function runCustomGen() {
  const inp = document.getElementById('customSpec');
  const layout = parseCustomSpec(inp.value);
  if (layout) generateCustomTemplate(layout);
  else inp.focus();
}
document.getElementById('genCustomBtn').onclick = runCustomGen;
document.getElementById('customSpec').addEventListener('keydown', e => { if (e.key === 'Enter') runCustomGen(); });
// 单元格在模版中所占的宽高比例（异形取包围盒）
function cellFraction(f) {
  if (!isPolyCell(f)) return [f[2], f[3]];
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  f.forEach(([ux,uy]) => { minx=Math.min(minx,ux); miny=Math.min(miny,uy); maxx=Math.max(maxx,ux); maxy=Math.max(maxy,uy); });
  return [maxx-minx, maxy-miny];
}
document.getElementById('fitOrigBtn').onclick = () => {
  const g = gap;
  if (mode === 'template') {
    // 让“最小单位”（参考格子）正好等于其原图尺寸，再反推画布尺寸
    let ci = (selCell >= 0 && cells[selCell] && cells[selCell].p != null) ? selCell : cells.findIndex(c => c.p != null);
    if (ci < 0) { alert(t('alertNoPhoto')); return; }
    const ph = photoById(cells[ci].p);
    const cr = cropOf(cells[ci], ph.img);           // 有裁剪则按裁剪后尺寸
    const [fw, fh] = cellFraction(TEMPLATES[tplIndex][ci]);
    if (fw <= 0 || fh <= 0) { alert(t('alertNoPhoto')); return; }
    let W = (cr.sw + g) / fw + g;
    let H = (cr.sh + g) / fh + g;
    const cap = 8000, m = Math.max(W, H);
    if (m > cap) { const s = cap/m; W *= s; H *= s; }
    customSize = [Math.round(W), Math.round(H)];
    render();
  } else {
    // 自由模式：整块画布 = 选中图片（或第一张）的原始尺寸
    let ph = (selFree >= 0 && freeItems[selFree] && freeItems[selFree].type !== 'group') ? photoById(freeItems[selFree].p) : photos[0];
    if (!ph) { alert(t('alertNoPhoto')); return; }
    customSize = [ph.img.width, ph.img.height];
    render();
  }
};
document.getElementById('zoomSlider').oninput = e => {
  if (selCell >= 0 && cells[selCell]) {
    cells[selCell].zoom = +e.target.value/100;
    document.getElementById('zoomVal').textContent = cells[selCell].zoom.toFixed(1);
    render();
  }
};
document.getElementById('captInput').oninput = e => {
  if (selCell >= 0 && cells[selCell]) { cells[selCell].text = e.target.value; render(); }
};

// ---------- 画布拉伸 ----------
let rzDrag = null;
document.querySelectorAll('.rz').forEach(h => {
  h.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const r = canvas.getBoundingClientRect();
    const [W, H] = canvasSize();
    rzDrag = { dir: h.dataset.dir, sx: e.clientX, sy: e.clientY, W, H, f: canvas.width / r.width };
    h.setPointerCapture(e.pointerId);
  });
  h.addEventListener('pointermove', e => {
    if (!rzDrag) return;
    let W = rzDrag.W, H = rzDrag.H;
    if (rzDrag.dir.includes('r')) W = Math.round(Math.max(300, Math.min(6000, rzDrag.W + (e.clientX - rzDrag.sx) * rzDrag.f)));
    if (rzDrag.dir.includes('b')) H = Math.round(Math.max(300, Math.min(6000, rzDrag.H + (e.clientY - rzDrag.sy) * rzDrag.f)));
    customSize = mode === 'free' ? [Math.round(W / pages), H] : [W, H];
    render();
  });
  const end = () => rzDrag = null;
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
});

// ---------- 自由模式画布页 ----------
document.getElementById('pageL').onclick = () => {
  const pw = baseSize()[0];
  pages++;
  freeItems.forEach(it => it.x += pw);
  updateSidebar(); render();
};
document.getElementById('pageR').onclick = () => { pages++; updateSidebar(); render(); };
document.getElementById('pageDel').onclick = () => {
  if (pages > 1) { pages--; updateSidebar(); render(); }
};
