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
