import { MOMOS_RULES, MOMOS_SUITS, momosRearTarget } from './momos.mjs';

const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function momosPose(run){
  const o=run.olympus,a=o.action;
  if(run.status==='won')return 14;
  if(o.phase==='intro')return o.phaseTime<1.2?0:15;
  if(o.phase==='stunned')return 12;
  if(o.phase.startsWith('cards-'))return o.phase==='cards-result'?13:11;
  if(o.phase==='centering')return 2+Math.floor(o.phaseTime*6)%2;
  if(!a)return o.walking?2+Math.floor(o.walkTime*6)%2:run.boss.faceY<-.4?13:Math.floor(run.time*2)%2;
  const fired=o.actionTime>=a.windup-1e-9;
  if(a.kind==='bicycle')return !a.rush&&o.actionTime>=a.windup+a.active+MOMOS_RULES.blastDelay?13:fired?7:6;
  return {daggers:fired?5:4,hammer:fired?9:8,clover:10,heart:10,diamond:10,spade:10}[a.kind];
}
export function drawMomosGround(g,run,reduced=false){
  const o=run.olympus,b=run.boss,a=o.action;
  if(a?.kind==='daggers'&&o.actionTime<a.windup){
    const progress=clamp(o.actionTime/a.windup);g.save();g.translate(b.x,b.y);
    g.strokeStyle=`rgba(216,193,157,${.13+progress*.32})`;g.lineWidth=1.5;g.setLineDash([5,15]);
    for(let i=0;i<MOMOS_RULES.daggerCount;i++){
      const angle=o.angle+i*TAU/MOMOS_RULES.daggerCount+(a.index??0)*.1;
      g.beginPath();g.moveTo(Math.cos(angle)*40,Math.sin(angle)*40);g.lineTo(Math.cos(angle)*670,Math.sin(angle)*670);g.stroke();
    }g.restore();
  }
  if(o.phase==='cards-show'){
    const shown=Math.min(3,Math.floor(o.phaseTime/MOMOS_RULES.cardHold));
    card(g,640,385,o.sequence[shown],1.35,false,0);
    caption(g,640,472,`기억하기  ${shown+1} / 4`,'#ddcbaa');
  }
  if(['cards-shuffle','cards-answer','cards-result'].includes(o.phase)){
    const dealing=o.phase==='cards-shuffle',t=dealing?smooth(o.phaseTime/MOMOS_RULES.shuffle):1;
    for(const [i,c] of o.cards.entries()){
      const weave=reduced?0:Math.sin(t*TAU*2+i)*65*Math.sin(t*Math.PI);
      const x=b.x+(c.x-b.x)*t+weave,y=b.y+30+(c.y-b.y-30)*t;
      const correct=c.struck&&o.sequence.slice(0,o.accepted).includes(c.suit);
      card(g,x,y,c.suit,1,dealing,correct?1:c.struck?-1:0,dealing&&!reduced?Math.sin(t*TAU+i)*.25:0);
    }
    if(o.phase==='cards-answer'){
      const left=Math.max(0,o.answerDuration-o.phaseTime);
      caption(g,640,610,`한 장씩 좌클릭  ·  ${left.toFixed(1)}초`,left<5?'#e29a85':'#d2c4a9');
    }
  }
}
function caption(g,x,y,text,color){
  g.save();g.font='600 13px system-ui';g.textAlign='center';const width=g.measureText(text).width+24;
  g.fillStyle='#0d0f16e8';g.beginPath();g.roundRect(x-width/2,y-17,width,26,4);g.fill();g.fillStyle=color;g.fillText(text,x,y);g.restore();
}
function card(g,x,y,suit,scale,back,result,angle=0){
  if(!suit)return;const face=MOMOS_SUITS[suit];
  g.save();g.translate(x,y);g.rotate(angle);g.scale(scale,scale);
  g.shadowColor='#020309';g.shadowBlur=12;g.shadowOffsetY=5;
  g.fillStyle=back?'#2c1720':'#222024';g.strokeStyle=result>0?'#c2d4ac':result<0?'#d57769':'#a28a60';g.lineWidth=result?3:2;
  g.beginPath();g.roundRect(-36,-49,72,98,5);g.fill();g.stroke();g.shadowBlur=0;g.shadowOffsetY=0;
  g.strokeStyle=back?'#8c6859':'#625743';g.lineWidth=1;g.strokeRect(-30,-43,60,86);
  g.fillStyle=back?'#b39268':face.color;g.textAlign='center';g.font='42px Georgia';g.fillText(back?'✧':face.symbol,0,15);
  if(!back){g.font='14px Georgia';g.fillText(face.symbol,-21,-25);g.fillText(face.symbol,21,37);}
  if(result){g.fillStyle='#101419cf';g.fillRect(-35,-48,70,96);g.font='bold 33px system-ui';g.fillStyle=result>0?'#c2d4ac':'#e28d7a';g.fillText(result>0?'✓':'×',0,11);}
  g.restore();
}
export function drawMomosRear(g,run){
  if(!run.olympus.rearOnly||run.status!=='playing')return;
  const target=momosRearTarget(run),b=run.boss;
  g.save();g.beginPath();g.arc(target.x,target.y,target.r,0,TAU);g.fillStyle='#b9d3ac27';g.fill();
  g.strokeStyle='#c9ddb2';g.lineWidth=2.5;g.stroke();
  g.beginPath();g.moveTo(target.x-7,target.y);g.lineTo(target.x+7,target.y);g.moveTo(target.x,target.y-7);g.lineTo(target.x,target.y+7);g.stroke();
  g.beginPath();g.moveTo(b.x+b.faceX*45-b.faceY*7,b.y+b.faceY*45+b.faceX*7);
  g.lineTo(b.x+b.faceX*57,b.y+b.faceY*57);g.lineTo(b.x+b.faceX*45+b.faceY*7,b.y+b.faceY*45-b.faceX*7);
  g.strokeStyle='#c9a98f88';g.lineWidth=2;g.stroke();g.restore();
  caption(g,target.x,target.y-target.r-12,'후방 약점','#d1e0bc');
}
export function drawMomosDagger(g,q){
  g.save();g.translate(q.x,q.y);g.rotate(Math.atan2(q.vy,q.vx));
  g.beginPath();g.moveTo(-27,0);g.lineTo(-5,0);g.strokeStyle='#d6c79c44';g.lineWidth=3;g.stroke();
  g.beginPath();g.moveTo(13,0);g.lineTo(-2,-4);g.lineTo(-5,0);g.lineTo(-2,4);g.closePath();
  g.fillStyle='#d1ccbd';g.strokeStyle='#3a3435';g.lineWidth=1.5;g.fill();g.stroke();
  g.beginPath();g.moveTo(-4,-6);g.lineTo(-4,6);g.moveTo(-4,0);g.lineTo(-12,0);g.strokeStyle='#b29162';g.lineWidth=3;g.stroke();g.restore();
}
export function drawMomosAirHazards(g,run,reduced=false){
  for(const h of run.hazards){
    if(h.visual==='wheel-bomb'&&h.phase==='warn'&&h.t>=0){
      const t=clamp(h.t/h.windup),x=h.sourceX+(h.x-h.sourceX)*t,y=h.sourceY+(h.y-h.sourceY)*t;
      const height=reduced?0:Math.sin(t*Math.PI)*145/Math.sqrt(h.sequenceIndex+1);
      g.save();g.fillStyle='#07090db0';g.beginPath();g.ellipse(x,y,15,5,0,0,TAU);g.fill();g.translate(x,y-height);g.rotate((h.t+h.delay)*15);
      g.beginPath();g.arc(0,0,16,0,TAU);g.strokeStyle='#11151a';g.lineWidth=8;g.stroke();g.strokeStyle='#a6a295';g.lineWidth=2.5;g.stroke();
      g.beginPath();g.arc(0,0,12,0,TAU);g.strokeStyle='#524a40';g.lineWidth=2;g.stroke();
      for(let i=0;i<6;i++){const angle=i*TAU/6;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(angle)*12,Math.sin(angle)*12);g.strokeStyle='#9b9381';g.lineWidth=1.5;g.stroke();}
      g.fillStyle='#cf9d59';g.fillRect(-3,-3,6,6);g.restore();
    }
    if(h.visual==='spade'){
      const progress=clamp(h.t/h.windup),active=h.phase==='active',height=reduced||active?0:150*(1-progress);
      const x=h.x+Math.cos(h.angle)*h.distance,y=h.y+Math.sin(h.angle)*h.distance;
      g.save();g.globalAlpha=active?1:.35+progress*.6;g.translate(x,y-height);g.rotate(h.angle+Math.PI/2);
      g.beginPath();g.moveTo(0,-48);g.bezierCurveTo(-13,-29,-42,-13,-25,3);g.bezierCurveTo(-15,14,-5,4,-4,0);
      g.lineTo(-3,17);g.lineTo(-11,24);g.lineTo(11,24);g.lineTo(3,17);g.lineTo(4,0);g.bezierCurveTo(5,4,15,14,25,3);g.bezierCurveTo(42,-13,13,-29,0,-48);
      g.closePath();g.fillStyle='#a9a59a';g.strokeStyle='#39343c';g.lineWidth=3;g.fill();g.stroke();
      g.beginPath();g.moveTo(0,-39);g.lineTo(0,15);g.strokeStyle='#e0d7be';g.lineWidth=2;g.stroke();g.restore();
    }
  }
}
export function drawMomosEntrance(g,run,art,reduced=false){
  const o=run.olympus;if(o.phase!=='intro')return;
  const t=o.phaseTime,opening=reduced?(t>.75?1:0):smooth((t-.45)/1.2);
  const reveal=clamp((t-1.1)/.25)*(1-smooth((t-2.6)/1.1));
  if(reveal>0){
    const shrink=reduced?0:smooth((t-2.25)/1.5),size=440-225*shrink;
    g.save();g.globalAlpha=reveal;g.drawImage(art.mask.image,640-size/2,270-size/2,size,size);g.restore();
    caption(g,640,515,t<2.15?'짜잔! 박수는 됐어.':'네 비명으로 대신 받을게!','#d9c39b');
  }
  const width=640*(1-opening)+28;
  for(const side of [-1,1]){
    const x=side<0?0:1280-width,shade=g.createLinearGradient(x,0,x+width,0);
    shade.addColorStop(0,'#110d14');shade.addColorStop(.5,'#391824');shade.addColorStop(1,'#0c0b11');
    g.save();g.fillStyle=shade;g.fillRect(x,0,width,720);
    for(let i=1;i<12;i++){
      const fx=x+width*i/12;g.beginPath();g.moveTo(fx,0);g.bezierCurveTo(fx-8,240,fx+12,430,fx-4,720);
      g.strokeStyle=i%2?'#8c435324':'#02030977';g.lineWidth=Math.max(2,width/55);g.stroke();
    }
    g.beginPath();const edge=side<0?width:1280-width;g.moveTo(edge,0);g.lineTo(edge,720);g.strokeStyle='#8a6a4c77';g.lineWidth=3;g.stroke();g.restore();
  }
}
