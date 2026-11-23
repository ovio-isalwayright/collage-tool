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
const walls = {}, loads = {}, controls = {};
const customWall = k => k==='wechat'||k==='douyin';
async function loadImage(file) {
  const url=URL.createObjectURL(file),image=new Image();
  try {image.src=url;await image.decode();return image} finally {URL.revokeObjectURL(url)}
}
$('wallFile').onchange=async e=>{
  const k=$('platform').value,file=e.target.files[0];if(!file)return;
  const token=loads[k]=Symbol();e.target.value='';
  try{const image=await loadImage(file);if(loads[k]===token){walls[k]=image;draw()}}
  catch{$('notice').textContent='图片无法读取，请重新选择。'}
};
$('resetWall').onclick=()=>{const k=$('platform').value;delete loads[k];delete walls[k];draw()};
$('group').oninput=()=>draw();
function cover(image,x,y,w,h){
  const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale;
  ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)/2,sw,sh,x,y,w,h);
}
function asset(key,x,y,w,h){if(controls[key])ctx.drawImage(controls[key],x,y,w,h)}
function center(value,y,color,size){ctx.save();ctx.textAlign='center';text(value,195,y,color,size);ctx.restore()}
function draw(){
  const k=$('platform').value,wc=k==='wechat',dy=k==='douyin',red=k==='red',ig=k==='ins',group=wc&&$('group').value;
  $('handleLabel').hidden=!ig;$('wall').hidden=!customWall(k);$('groupLabel').hidden=!wc;
  const line=20,header=wc?87:dy?94:105, footer=wc?80:dy||red?122:78;
  const full=$('layout').value==='full';
  $('clockLabel').hidden=!full;
  let y=full?header+4:12;
  const blocks=messages.map(m=>{
    const top=y, lines=wrap(m.value), voice=m.kind==='voice',media=m.kind==='media';
    const body=lines.length*line+16;
    const duration=Math.max(1,Math.min(60,Number(m.seconds)||2));
    const width=media?(ig?80:red?186:149):voice?(dy?194:Math.min(218,63+duration*5.7)):Math.max(34,...lines.map(l=>ctx.measureText(l).width+22));
    const h=media?(ig?140:195):voice?36:body;
    const trans=voice&&m.value?body+4:0;
    y+=m.kind==='date'?32:h+trans+(group&&m.side==='peer'?15:0)+(media&&ig?21:0)+15;
    return {m,top,lines,width,h,duration,trans,body};
  });
  const height=full?Math.max(847,y+footer):Math.max(24,y);
  exportable=height<=8000;$('save').disabled=!exportable;
  $('notice').textContent=exportable?'':'对话过长，请缩短内容后导出。';
  canvas.width=1320;canvas.height=Math.round(Math.min(height,8000)*1320/390);
  ctx.setTransform(1320/390,0,0,1320/390,0,0);
  box(0,0,390,height,0,wc?'#ededed':dy?'#cad9eb':'white');
  if(walls[k])cover(walls[k],0,0,390,height);
  if(full){
    if(wc||dy)box(0,0,390,header,0,wc?'rgba(244,244,244,.94)':'rgba(212,226,242,.45)');
    text($('clock').value||'14:18',46,35,'#080808',16,true);
    asset('status-signal',277,22,58/3,37/3);
    asset('status-wifi',302.5,22,52/3,37/3);
    asset('status-battery',326.5,22,82/3,39/3);
    text('‹',wc?14:17,header-12,'#181818',31);
    if(wc)center(group||people.peer.name,header-13,'#191919',16);
    else {avatar('peer',ig?66:40,header-42,31,16);text(people.peer.name,ig?104:81,header-(ig?26:18),'#24242a',15,true,ig?116:180);
      if(ig)text($('handle').value,104,header-11,'#26282a',11,false,110)}
    if(red||ig)asset(k+'-controls',ig?235:351,57,ig?155:39,47);
    else text(dy?'♧    •••':'•••',dy?320:355,header-15,'#202027',15);
  }
  for(const {m,top,lines,width,h,duration,trans,body} of blocks){
    if(m.kind==='date'){font(12);const w=ctx.measureText(m.value).width+12;if(wc||dy)box((390-w)/2,top,w,19,4,wc?'#ffffffe0':'#20263288');center(m.value,top+14,dy?'white':'#85868a',12);continue}
    const own=m.side==='me',x=own?(ig?383:wc?332:dy?340:337)-width:(wc?58:ig||dy?50:53);
    let yy=top;
    if(group&&!own){text(people.peer.name,x,yy+10,walls[k]?'white':'#777',10);yy+=15}
    if(!ig||!own)avatar(m.side,own?345:wc||dy?11:14,ig?yy+h-25:top,wc?36:ig?25:32,wc?4:16);
    const fill=own?(wc?'#a9e97a':dy?'#1687ff':red?'#477ff5':ig?'#7341f5':'#181818'):(wc||dy?'white':red?'#f5f5f5':'#eff0f4');
    const ink=own&&!wc?'white':'#202023',r=wc?4:dy?7:ig?18:10;
    if(m.kind==='media'){
      if(ig){text(own?'You replied to their story':'Replied to your story',x,yy+12,'#747984',11);yy+=21}
      ctx.save();ctx.beginPath();ctx.roundRect(x,yy,width,h,r);ctx.clip();box(x,yy,width,h,0,'#eceef2');if(m.image)cover(m.image,x,yy,width,h);
      if(m.value){box(x,yy+h-36,width,36,0,red?'#f5f5f5':'#0008');text(m.value,x+8,yy+h-13,red?'#333':'white',13,false,width-16)}ctx.restore();continue;
    }
    box(x,yy,width,h+(dy?trans:0),r,fill);
    if(wc){const tip=own?x+width:x;ctx.beginPath();ctx.moveTo(tip,yy+13);ctx.lineTo(tip+(own?5:-5),yy+18);ctx.lineTo(tip,yy+23);ctx.fill()}
    if(m.kind==='voice'){
      if(wc){
        const sx=own?x+width-17:x+14,cy=yy+18;
        ctx.save();ctx.translate(sx,cy);if(own)ctx.scale(-1,1);ctx.strokeStyle=ink;ctx.lineWidth=1.5;
        for(const radius of [2,4.5,7.5]){ctx.beginPath();ctx.arc(0,0,radius,-.8,.8);ctx.stroke()}ctx.restore();
        ctx.save();ctx.textAlign=own?'right':'left';text(duration+'″',own?sx-17:sx+16,yy+23,ink,13);ctx.restore();
      }else text('▶  ┃╹┃   '+duration+'″',x+11,yy+24,ink,14);
      if(trans){const tw=dy?width:Math.min(246,Math.max(80,...lines.map(l=>{font(16);return ctx.measureText(l).width+22}))),tx=own?x+width-tw:x;
        if(!dy)box(tx,yy+h+4,tw,body,4,'white');else box(tx+10,yy+h,width-20,.5,0,'#ffffff55');
        lines.forEach((l,i)=>text(l,tx+10,yy+h+26+i*line,dy?ink:'#202023',15,false,tw-20))}
    }else lines.forEach((l,i)=>text(l,x+11,yy+24+i*line,ink,15));
  }
  if(!full)return;
  if(wc||red||ig){asset(k+'-input',0,height-(wc?80:78),390,wc?80:78);if(red)asset('red-reactions',0,height-120,390,36)}
  else if(dy){['👋 打招呼','🔥 续火花','👍 赞','😂 捂脸','🌹 玫瑰'].forEach((s,i)=>{box(6+i*78,height-114,74,27,7,'#eeeeeedb');text(s,12+i*78,height-96,'#21232b',12)});
    box(7,height-78,376,40,9,'#eeeeeee6');text('▦   发消息或按住说话…',16,height-52,'#565860',15);text('◉   ☺   ⊕',282,height-52,'#20232a',18)}
  else {box(8,height-77,374,41,20,'#f1f1f1');text('Write a message…',24,height-51,'#777',15)}
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
function add(side,value,kind="text"){
  const m={side,value,kind,seconds:2},el=$('message').content.firstElementChild.cloneNode(true);
  const select=el.querySelector('select'),area=el.querySelector('textarea');
  select.value=side;area.value=value;
  select.onchange=()=>{m.side=select.value;draw()};
  area.oninput=()=>{m.value=area.value;draw()};
  el.querySelector('button').onclick=()=>{messages=messages.filter(item=>item!==m);el.remove();draw()};
  if(kind==='voice'||kind==='media'){
    const label=document.createElement('label');label.className='details';
    const input=document.createElement('input');
    if(kind==='voice'){label.textContent='语音时长（秒）';input.type='number';input.min=1;input.max=60;input.value=2;input.oninput=()=>{m.seconds=input.value;draw()};area.placeholder='转写文字（可留空）'}
    else{label.textContent='卡片图片';input.type='file';input.accept='image/*';input.onchange=async()=>{const f=input.files[0];if(!f)return;try{const im=await loadImage(f);if(input.files[0]===f){m.image=im;draw()}}catch{$('notice').textContent='无法读取图片。'}};area.placeholder='图片说明'}
    label.append(input);el.append(label)
  }
  if(kind==='date'){
    select.hidden=true;
    const label=document.createElement('label');label.textContent='聊天时间标签';label.style.gridColumn='1 / 3';
    area.before(label);label.append(area);area.rows=1;area.maxLength=32;
    area.setAttribute('aria-label','聊天时间标签');area.placeholder='例如：昨天 14:18';
  }
  messages.push(m);$('messages').append(el);draw();return area;
}
$('clock').oninput=draw;
$('platform').onchange=draw;
$('layout').onchange=draw;
$('handle').oninput=draw;
$('voice').onclick=()=>add('peer','','voice').focus();
$('media').onclick=()=>add('peer','','media').focus();
$('date').onclick=()=>add('peer',$('clock').value||'14:18','date').focus();
for(const [key,src] of Object.entries(chatControls)){const image=new Image();image.onload=()=>{controls[key]=image;draw()};image.src=src}
$('add').onclick=()=>add(messages.at(-1)?.side==='peer'?'me':'peer','').focus();
$('save').onclick=()=>{if(exportable)canvas.toBlob(blob=>{
  if(!blob){$('notice').textContent='导出失败，请缩短内容后重试。';return}
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=$('platform').value+'-chat.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),60000);
},'image/png')};
add('peer',$('clock').value,'date');
add('peer','今天开到了哪张卡？');add('me','是我一直在找的那张！');
