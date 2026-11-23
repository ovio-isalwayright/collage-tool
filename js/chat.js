'use strict';
const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d');
const themes = {
  wechat: {bg:'#ededed',bar:'#ededed',mine:'#95ec69',other:'#ffffff',ink:'#181818',ownInk:'#151515',radius:6,center:true,composer:'按住 说话'},
  douyin: {bg:'#15151c',bar:'#1d1d26',mine:'#fa3966',other:'#32323c',ink:'#ffffff',ownInk:'#ffffff',radius:17,composer:'发消息…'},
  red: {bg:'#fafafa',bar:'#ffffff',mine:'#ff3854',other:'#eeeeef',ink:'#252525',ownInk:'#ffffff',radius:16,composer:'发私信…'},
  ins: {bg:'#ffffff',bar:'#ffffff',mine:'#7855fa',other:'#efeff3',ink:'#18181a',ownInk:'#ffffff',radius:20,composer:'Message…'},
  threads: {bg:'#ffffff',bar:'#fafafa',mine:'#181818',other:'#f1f1f1',ink:'#141414',ownInk:'#ffffff',radius:15,composer:'Write a message…'}
};
const people = {peer:{name:'阿宁'},me:{name:'小林'}};
let messages = [], exportable = true;
const segmenter = new Intl.Segmenter(undefined,{granularity:'grapheme'});
function font(size,bold=false){ctx.font=(bold?'600 ':'400 ')+size+'px system-ui, sans-serif'}
function box(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function text(value,x,y,color,size,bold=false,max){font(size,bold);ctx.fillStyle=color;ctx.fillText(value,x,y,max)}
function avatar(who,x,y,s,r){
  const p=people[who], im=p.image;
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,s,s,r);ctx.clip();
  if(im){const crop=Math.min(im.width,im.height);ctx.drawImage(im,(im.width-crop)/2,(im.height-crop)/2,crop,crop,x,y,s,s)}
  else {ctx.fillStyle=who==='me'?'#516485':'#946d59';ctx.fillRect(x,y,s,s);ctx.textAlign='center';text([...segmenter.segment(p.name||'·')][0].segment,x+s/2,y+s*.68,'white',s*.43,true)}
  ctx.restore();
}
function wrap(value){
  font(16);const lines=[];
  for(const para of value.split('\n')){
    let line='';
    for(const {segment} of segmenter.segment(para)){
      if(line && ctx.measureText(line+segment).width>222){lines.push(line);line=''}
      line+=segment;
    }
    lines.push(line);
  }
  return lines;
}
function draw(){
  const key=$('platform').value,t=themes[key],wechat=key==='wechat';
  let y=95;
  const blocks=messages.map(m=>{
    const lines=wrap(m.value),h=lines.length*23+16;
    const b={side:m.side,lines,h,y,w:Math.max(38,...lines.map(l=>ctx.measureText(l).width+26))};
    y+=h+39;return b;
  });
  const height=Math.max(580,y+56);
  exportable=height<=8000;
  $('save').disabled=!exportable;
  $('notice').textContent=exportable?'':'对话过长，请缩短内容后导出。';
  canvas.width=780;canvas.height=Math.min(height,8000)*2;
  ctx.setTransform(2,0,0,2,0,0);
  box(0,0,390,height,0,t.bg);box(0,0,390,70,0,t.bar);
  text('‹',16,46,t.ink,29);text('···',351,44,t.ink,23,true);
  if(t.center){ctx.textAlign='center';text(people.peer.name,195,42,t.ink,18,true,250);ctx.textAlign='left'}
  else {avatar('peer',47,16,38,19);text(people.peer.name,95,34,t.ink,16,true,210);text($('platform').selectedOptions[0].text,95,51,key==='douyin'?'#bbbbc6':'#626872',11)}
  box(0,69,390,1,0,key==='douyin'?'#373741':'#dddddf');
  for(const b of blocks){
    const own=b.side==='me',x=own?334-b.w:56,ax=own?346:10;
    avatar(b.side,ax,b.y,34,wechat?5:17);
    ctx.textAlign=own?'right':'left';text(people[b.side].name,own?334:56,b.y+9,key==='douyin'?'#c1c1cd':'#65696e',11,false,230);ctx.textAlign='left';
    const top=b.y+15,fill=own?t.mine:t.other;
    box(x,top,b.w,b.h,t.radius,fill);
    if(wechat){const tip=own?x+b.w:x;ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(tip,top+10);ctx.lineTo(tip+(own?6:-6),top+15);ctx.lineTo(tip,top+20);ctx.fill()}
    b.lines.forEach((line,i)=>text(line,x+13,top+25+i*23,own?t.ownInk:t.ink,16));
  }
  box(0,height-57,390,57,0,t.bar);box(12,height-47,366,37,wechat?6:18,key==='douyin'?'#36363f':'#e9eaec');
  text(t.composer,27,height-23,key==='douyin'?'#d5d5da':'#64686e',14);
}
for(const [side,p] of Object.entries(people)){
  const el=$('person').content.firstElementChild.cloneNode(true);
  el.querySelector('legend').textContent=side==='me'?'我':'对方';
  const [name,file]=el.querySelectorAll('input');name.value=p.name;
  name.oninput=()=>{p.name=name.value;draw()};
  file.onchange=async()=>{
    const f=file.files[0];if(!f)return;
    const url=URL.createObjectURL(f),im=new Image();im.src=url;
    try{await im.decode();if(file.files[0]===f){p.image=im;draw()}}
    catch{if(file.files[0]===f)$('notice').textContent='无法读取这张头像，请选择其他图片。'}
    finally{URL.revokeObjectURL(url)}
  };
  $('people').append(el);
}
function add(side,value){
  const m={side,value},el=$('message').content.firstElementChild.cloneNode(true);
  const select=el.querySelector('select'),area=el.querySelector('textarea');
  select.value=side;area.value=value;
  select.onchange=()=>{m.side=select.value;draw()};
  area.oninput=()=>{m.value=area.value;draw()};
  el.querySelector('button').onclick=()=>{messages=messages.filter(item=>item!==m);el.remove();draw()};
  messages.push(m);$('messages').append(el);draw();return area;
}
$('platform').onchange=draw;
$('add').onclick=()=>add(messages.at(-1)?.side==='peer'?'me':'peer','').focus();
$('save').onclick=()=>{if(exportable)canvas.toBlob(blob=>{
  if(!blob){$('notice').textContent='导出失败，请缩短内容后重试。';return}
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=$('platform').value+'-chat.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),60000);
},'image/png')};
add('peer','今天开到了哪张卡？');add('me','是我一直在找的那张！');
