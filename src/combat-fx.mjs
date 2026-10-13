// Small cached projectile paintings and bounded, geometry-clipped ground effects.
// These functions never allocate particles or change simulation state.
const TAU=Math.PI*2;
export const BOSS_SHOT_STYLES=Object.freeze([
  'lance','rubble','fireball','icicle','arc','shell','blade','tide','scythe','rift',
  'mirror','miasma','sun','gear','eye','comet','rune','thunder','moth','crown',
]);
const poly=(g,points,color)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=color;g.fill();};
const stroke=(g,points,color,width=1)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.stroke();};
const disk=(g,x,y,r,color)=>{g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=color;g.fill();};
export function paintBossShot(g,style,radius,frame=0,reflected=false){
  const r=Math.max(7,radius||9),f=frame-1;
  const fire=['fireball','sun','comet'].includes(style),ice=['icicle','mirror','rune'].includes(style);
  const electric=['arc','thunder'].includes(style),water=['tide','miasma'].includes(style);
  const metal=['lance','shell','blade','scythe','gear'].includes(style);
  const color=reflected?'#9affe2':fire?'#ff942e':ice?'#a5e6fa':electric?'#b8d9ff':water?'#6cae99':metal?'#e4be85':'#c291ed';
  const halo=g.createRadialGradient(0,0,1,0,0,r*2.2);
  halo.addColorStop(0,color+'66');halo.addColorStop(1,color+'00');
  disk(g,0,0,r*2.2,halo);
  if(fire){
    const flame=g.createLinearGradient(-60,0,r,0);
    flame.addColorStop(0,'#57152200');flame.addColorStop(.35,'#bd32264d');flame.addColorStop(.73,'#ee6b2fdf');flame.addColorStop(1,'#ffe5a8');
    g.beginPath();g.moveTo(r,0);g.bezierCurveTo(2,-r*1.5,-25,-r-4,-51-f*3,-9);
    g.lineTo(-29,-2+f);g.lineTo(-63+f*2,5);g.lineTo(-27,5);g.bezierCurveTo(-16,r+6,1,r*1.3,r,0);g.fillStyle=flame;g.fill();
    if(style==='comet')poly(g,[[-r,-r*.7],[r*.5,-r],[r,1],[2,r],[-r*.8,r*.6]],'#482d2b');
    else{
      const core=g.createRadialGradient(r*.3,-1,0,0,0,r*1.05);
      core.addColorStop(0,'#fff6d6');core.addColorStop(.22,'#ffe2a3');core.addColorStop(.58,'#ffab50dd');core.addColorStop(1,'#d9552600');disk(g,0,0,r*1.05,core);
    }
    for(let i=0;i<3;i++){
      g.beginPath();g.moveTo(r*.3,-r*.3+i*r*.3);g.bezierCurveTo(-10,-8+i*6,-26+i*2,-5+f*2,-43-i*5,2+i*3);
      g.strokeStyle=i===1?'#ffe7a45c':'#f7a54065';g.lineWidth=i===1?1.3:2.4;g.stroke();
    }
    if(style==='sun'){g.strokeStyle='#efbd69';g.lineWidth=2;g.beginPath();g.arc(0,0,r*1.25,0,TAU);g.stroke();
      for(let i=0;i<6;i++){const a=i*TAU/6;stroke(g,[[Math.cos(a)*r*1.3,Math.sin(a)*r*1.3],[Math.cos(a)*r*1.8,Math.sin(a)*r*1.8]],'#ed993e',2);}}
    for(let i=0;i<3;i++)disk(g,-25-i*11+f*2,(i%2?1:-1)*(4+i*2),1.2,'#f7c57b88');
  }else if(ice){
    stroke(g,[[-46,0],[-r,0]],'#8fc3e755',r*.6);
    const tip=style==='icicle'?r*1.65:r*1.15;
    poly(g,[[-r,-r*.55],[tip,0],[-r,r*.72],[-r*.3,0]],'#37617e');
    poly(g,[[-r,-r*.55],[tip,0],[-r*.3,0]],'#c4eaf2');
    stroke(g,[[-r*.2,-r*.2],[tip*.85,0],[-r*.2,r*.2]],'#f4feff',1);
    if(style==='mirror')poly(g,[[-r*1.6,-r*.5],[-r*.7,-r*1.25],[-r*.3,-r*.7]],'#91b8dd');
    if(style==='rune'){g.strokeStyle='#e9d2ff';g.lineWidth=1.4;g.strokeRect(-r,-r,r*2,r*2);stroke(g,[[-r*.7,0],[0,-r*.7],[r*.7,0],[0,r*.7],[-r*.7,0]],'#b798df');}
  }else if(electric){
    stroke(g,[[-52,-3],[-31,3+f*3],[-25,-6],[-12,5],[-4,-5],[r,0]],'#6f90d599',8);
    stroke(g,[[-50,-3],[-31,3+f*3],[-25,-6],[-12,5],[-4,-5],[r,0]],'#edf5ff',2.5);
    if(style==='thunder')poly(g,[[-r,-r],[r*1.5,0],[-r,r],[0,0]],'#d4deff');
    else for(const side of [-1,1])stroke(g,[[-18,0],[-5,side*(r+3)],[-r,side*r*.3],[3,0]],'#a9bdf1',1.5);
  }else if(water){
    const mist=g.createLinearGradient(-45,0,r,0);mist.addColorStop(0,'#2d675600');mist.addColorStop(1,style==='miasma'?'#638752':'#60aeaa');
    g.fillStyle=mist;g.beginPath();g.moveTo(-43,-6);g.bezierCurveTo(-18,10,-8,-r*1.5,r,0);g.bezierCurveTo(0,r*1.6,-18,-7,-43,-6);g.fill();
    disk(g,0,0,r*.75,style==='miasma'?'#30452f':'#29505b');
    g.beginPath();g.arc(0,0,r*.65,-2.3,.2);g.strokeStyle=color;g.lineWidth=2;g.stroke();
    if(style==='miasma'){disk(g,-r*.6,-r*.6,r*.38,'#68805aad');disk(g,-r*.7,r*.55,r*.3,'#82937199');}
    else{g.beginPath();g.arc(-r*1.2,0,r*.55,.2,4.6);g.strokeStyle='#9ed1c799';g.lineWidth=1.5;g.stroke();}
    for(let i=0;i<3;i++)disk(g,-12-i*10,(i%2?1:-1)*(4+f),2.3-i*.5,color+'99');
  }else if(metal){
    stroke(g,[[-48,0],[-r,0]],'#bf9f7955',3);
    if(style==='shell'){disk(g,0,0,r,'#252a2d');disk(g,-2,-2,r*.65,'#757970');stroke(g,[[-r,-3],[r*.6,-3]],'#d6c6a8',2);poly(g,[[-r,-r*.6],[-r*1.7,-r],[-r*1.2,0]],'#927f61');}
    else if(style==='gear'){
      disk(g,0,0,r*.85,'#5e5140');for(let i=0;i<8;i++){g.save();g.rotate(i*TAU/8);g.fillStyle='#b9a17b';g.fillRect(r*.65,-2,r*.6,4);g.restore();}disk(g,0,0,r*.32,'#242a2d');
    }else if(style==='scythe'||style==='blade'){
      g.beginPath();g.arc(0,0,r*1.3,-1.7,1.7);g.arc(-r*.4,0,r*.9,1.7,-1.7,true);g.closePath();g.fillStyle='#b9c4c4';g.fill();
      stroke(g,[[-r*.5,-r*.2],[r*.8,0],[-r*.5,r*.2]],'#fff0ca',1.5);
      if(style==='blade')poly(g,[[-r*.8,-r],[-r*.3,r],[-r*1.4,r*.5]],'#829495');
    }else{poly(g,[[-r*1.8,-r*.5],[r*1.6,0],[-r*1.8,r*.5],[-r*.9,0]],'#959c98');stroke(g,[[-r*1.5,-r*.4],[r*1.6,0],[-r*.9,0]],'#f2e2bb',1.5);}
  }else if(style==='rubble'){
    poly(g,[[-r,-r*.4],[-r*.2,-r],[r*.9,-r*.5],[r,0],[r*.3,r],[-r*.8,r*.7]],'#676056');
    poly(g,[[-r,-r*.4],[-r*.2,-r],[r*.9,-r*.5],[0,0]],'#b3a18a');
    for(let i=0;i<3;i++)poly(g,[[-24-i*8,2],[-20-i*8,-3],[-18-i*8,3]],'#82745a88');
  }else{
    stroke(g,[[-52,4],[-32,-4-f*2],[-17,5],[0,0]],'#65477b77',7);
    if(style==='moth'){
      for(const s of [-1,1])poly(g,[[0,0],[-r*1.4,-s*r*1.7],[r*.6,-s*r*.7],[r,0]],'#906bab');
      stroke(g,[[-r*.4,0],[r,0]],'#edcbed',3);
    }else if(style==='crown'){
      poly(g,[[-r,-r],[r*.9,-r*.7],[r*.2,-r*.25],[r*1.45,0],[r*.2,r*.25],[r*.9,r*.7],[-r,r]],reflected?'#99e7cd':'#baa6db');
      poly(g,[[-r*.7,-r*.5],[r*.5,0],[-r*.7,r*.5]],'#402e5f');
    }else{
      g.beginPath();g.moveTo(-r*1.4,0);g.quadraticCurveTo(0,-r*1.4,r*1.3,0);g.quadraticCurveTo(0,r*1.4,-r*1.4,0);g.fillStyle='#3b2854';g.fill();g.strokeStyle=color;g.lineWidth=1.8;g.stroke();
      if(style==='eye')poly(g,[[-2,-r*.65],[3,0],[-2,r*.65]],'#e8b9f3');
      else stroke(g,[[-r*.7,r*.3],[0,-r*.6],[r*.65,r*.2]],'#e1c6f5',2);
    }
  }
}

export function paintFlameBrush(g,frame=0){
  const glow=g.createRadialGradient(0,-3,2,0,-3,29);glow.addColorStop(0,'#e25d205c');glow.addColorStop(.45,'#bb341b28');glow.addColorStop(1,'#96251c00');
  g.save();g.scale(1,.6);disk(g,0,0,29,glow);g.restore();
  for(let i=0;i<4;i++){
    const x=(i-1.5)*7,top=-27-i%3*13,sway=Math.sin(i*3+frame*1.5)*10;
    const fire=g.createLinearGradient(x,top-8,x,4);
    fire.addColorStop(0,'#b9431600');fire.addColorStop(.25,'#cc501b24');fire.addColorStop(.7,'#ef8a367e');fire.addColorStop(.88,'#ffd386b0');fire.addColorStop(1,'#d76c2524');
    g.beginPath();g.moveTo(x-7,3);g.bezierCurveTo(x-10,-12,x+sway+5,top+12,x+sway,top);
    g.bezierCurveTo(x+sway+14,top+23,x+8,-9,x+7,3);g.closePath();g.fillStyle=fire;g.fill();
  }
  disk(g,-7,-15-frame*4,1,'#ffc675a6');disk(g,10,-30+frame*3,.8,'#deae676e');
}
export function paintGroundResidue(g,h,time,material,reduced,flameBrush=null){
  const flame=['fire','cannon','stone','steel'].includes(material),ice=['ice','glass'].includes(material),electric=material==='lightning';
  const color=flame?'#fa9b45':ice?'#addef0':electric?'#a8caff':material==='water'?'#719b85':'#b898d3';
  const t=reduced?0:time,extent=h.shape==='lane'?h.length:h.radius;
  g.fillStyle=flame?'#1b14106b':ice?'#304f6070':material==='water'?'#162d2be0':'#211d39bc';
  g.fillRect(-extent,-extent,extent*3,extent*2);
  if(h.sweep){
    const beam=g.createLinearGradient(0,-h.width/2,0,h.width/2);
    beam.addColorStop(0,color+'00');beam.addColorStop(.45,color+'aa');beam.addColorStop(.5,'#f1ede6');beam.addColorStop(.55,color+'aa');beam.addColorStop(1,color+'00');
    g.fillStyle=beam;g.fillRect(0,-h.width/2,h.length,h.width);
    for(let i=0;i<10;i++){const x=((i/10+t*.6)%1)*h.length;stroke(g,[[x-20,0],[x,Math.sin(i+t*8)*h.width*.28],[x+20,0]],color,1.3);}return;
  }
  const count=flame?28:24;
  for(let i=0;i<count;i++){
    const a=i*2.39996,d=Math.sqrt((i+.5)/count)*(h.radius||60)*.94;
    const x=h.shape==='lane'?(i+.5)/count*h.length:Math.cos(a)*d;
    const y=h.shape==='lane'?Math.sin(i*7)*h.width*.36:Math.sin(a)*d;
    const pulse=.6+.4*Math.sin(i*4.7+t*6),size=7+i%4*3;
    if(flame){
      if(flameBrush){const width=40+size*3;g.globalAlpha=.5+pulse*.35;
        g.drawImage(flameBrush[Math.floor(t*8+i*.9)%3],x-width/2,y-width*1.25,width,width*1.5);g.globalAlpha=1;continue;}
      g.beginPath();g.moveTo(x-size*.65,y+4);g.quadraticCurveTo(x-size,y-size*.7,x+Math.sin(i+t*4)*5,y-size*(1.2+pulse));
      g.quadraticCurveTo(x+size,y-size*.5,x+size*.5,y+4);g.closePath();g.fillStyle=i%3?'#cb58218c':'#ffad4cab';g.fill();
      stroke(g,[[x-1,y],[x+1,y-size*.6]],'#ffd995b0',2);
    }else if(ice){poly(g,[[x-5,y+4],[x-2,y-size],[x+6,y+2]],'#9fc7dd80');stroke(g,[[x-2,y-size],[x,y+2]],'#d9eef0b0',1);
      const glint=y-size+(size+2)*pulse;stroke(g,[[x-3,glint],[x+2,glint+2]],'#f2fcf5',1);}
    else if(electric){stroke(g,[[x-size,y],[x-3,y-4*pulse],[x+2,y+4],[x+size,y-size*.3]],color+'aa',1.6);}
    else{g.beginPath();g.ellipse(x,y,size*(.6+pulse*.3),size*.4,0,0,TAU);g.strokeStyle=color+'78';g.lineWidth=1.3;g.stroke();
      if(i%3===0){g.beginPath();g.arc(x+2,y-3,2.4,0,TAU);g.fillStyle=color+'99';g.fill();}}
  }
}
