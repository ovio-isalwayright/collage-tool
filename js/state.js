'use strict';
// 全局状态
// ---------- 状态 ----------
let photos = [];            // {id, img, url}
let nextId = 1;
let mode = 'template';
let tplIndex = 2;
let cells = [];             // {p:id|null, zoom, ox, oy, crop:{sx,sy,sw,sh}|null}
let freeItems = [];         // {p, x, y, w, h, scale, rot, crop}
let stripOrder = [];        // photo ids
let stripCrops = {};        // {photoId: {sx,sy,sw,sh}}
let stripDir = 'v';
let gap = 12, radius = 8, bg = '#ffffff', aspect = '1:1';
let bgImg = null, bgImgUrl = null, bgFit = 'cover', bgTransparent = false, bgType = 'color';
let customSize = null;      // [w,h] 自由拉伸后的画布(页)尺寸
let pages = 1;              // 自由模式画布页数
let selCell = -1, selFree = -1, selStrip = -1;
let subOv = {};   // {photoId:{top,h}} 单张字幕条的独立位置/高度（覆盖统一设置）
let subTop = 0.78, subH = 0.17, subFirstFull = true, subGap = 0;   // 字幕模式：字幕条在画面中的位置/高度(占画面高度比例)
let lang = 'zh';
let viewZoom = 1;           // 画布显示缩放（1 = 适应屏幕）
// 画布上的界面强调色，取自 CSS 变量 --accent；换主题色只改 CSS
const ACC = (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4ff00').toLowerCase();
const ACC_RGB = (h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(','))(ACC.length === 7 ? ACC : '#d4ff00');
function accA(a) { return `rgba(${ACC_RGB},${a})`; }
