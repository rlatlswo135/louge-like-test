// Original high-resolution sanctuary floor. All material/lighting work is baked per stage.
import { ARENA } from './content.mjs';
import { STAGES } from './stages.mjs';
const TAU = Math.PI * 2;
let stoneTexture,arenaAtlas;
export async function prepareArena(win) {
  if(arenaAtlas)return;
  const image=new win.Image(),menu=new win.Image();
  image.src=new URL('../assets/art/arena-atlas-v3.png',import.meta.url).href;
  menu.src=new URL('../assets/art/arena-gate-v3.png',import.meta.url).href;
  await Promise.all([image.decode(),menu.decode()]);arenaAtlas=image;
}

export function paintStageArena(g,theme=STAGES[0]) {
  if(!arenaAtlas){paintArena(g);return;}
  const tileW=arenaAtlas.width/2,tileH=arenaAtlas.height/2;
  // Keep the surrounding stands outside the walkable rectangle and preserve floor proportions.
  const insetX=tileW*.07,insetY=tileH*.135;
  g.drawImage(arenaAtlas,(theme.biome%2)*tileW+insetX,Math.floor(theme.biome/2)*tileH+insetY,tileW-2*insetX,tileH-2*insetY,0,0,1280,720);
  // This detail is baked into a single stage canvas, never rebuilt during combat.
  g.fillStyle='#08101b30';g.fillRect(0,0,1280,720);
  g.save();g.strokeStyle='#b3a58b35';g.fillStyle='#03080c38';g.lineWidth=3;
  const line=(points)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();};
  const motif=theme.motif;
  if(['fracture','rift','roots','craters'].includes(motif)){
    for(let i=0;i<7;i++){
      const x=170+i*155,y=150+(i%3)*155;
      if(motif==='craters'){g.beginPath();g.ellipse(x,y,42+i*4,25,0,0,TAU);g.fill();}
      else line([[x-60,y-50],[x-22,y-20],[x,y-26],[x+13,y+20],[x+65,y+55]]);
    }
  }else if(['rails','conduit','furnace','anvil'].includes(motif)){
    for(const x of [235,270,1010,1045])line([[x,80],[x,640]]);
    for(let i=0;i<6;i++)line([[235,140+i*84],[270,140+i*84]]);
    if(motif==='anvil')for(const x of [340,940]){g.beginPath();g.rect(x-70,225,140,270);g.fill();g.stroke();}
    if(motif==='conduit')for(let i=0;i<8;i++){const a=i*TAU/8;line([[640+Math.cos(a)*85,360+Math.sin(a)*85],[640+Math.cos(a)*260,360+Math.sin(a)*260]]);}
  }else if(['mirror','runes','judgment','blades'].includes(motif)){
    for(let i=0;i<6;i++){
      const x=280+(i%3)*360,y=205+Math.floor(i/3)*310;
      line([[x,y-40],[x+45,y],[x,y+40],[x-45,y],[x,y-40]]);
      if(motif==='runes')line([[x-15,y+16],[x,y-20],[x+15,y+16],[x-15,y+4],[x+15,y+4]]);
    }
  }else if(['gears','eclipse','moon','crown'].includes(motif)){
    for(let i=0;i<3;i++){
      const x=320+i*320,y=i===1?360:240;
      ring(g,x,y,85+i*10,'#b3a58b35',3);
      if(motif==='gears')for(let j=0;j<16;j++){const a=j*TAU/16;line([[x+Math.cos(a)*90,y+Math.sin(a)*90],[x+Math.cos(a)*110,y+Math.sin(a)*110]]);}
      if(motif==='crown')line([[x-45,y+25],[x-55,y-22],[x-20,y-4],[x,y-40],[x+20,y-4],[x+55,y-22],[x+45,y+25],[x-45,y+25]]);
    }
  }else if(['tide','wells','frost'].includes(motif)){
    for(let i=0;i<5;i++){
      if(motif==='wells'){g.beginPath();g.ellipse(245+i*198,200+(i%2)*300,54,32,0,0,TAU);g.fill();}
      else{g.beginPath();g.moveTo(100,140+i*105);g.bezierCurveTo(390,90+i*105,820,200+i*105,1180,140+i*105);g.stroke();}
    }
  }
  g.restore();
}
const polygon = (g, points, fill) => {
  g.beginPath(); points.forEach(([x,y], i) => i ? g.lineTo(x,y) : g.moveTo(x,y)); g.closePath();
  g.fillStyle=fill; g.fill();
};
function ring(g,x,y,r,color,width=1) {
  g.beginPath();g.arc(x,y,r,0,TAU);g.strokeStyle=color;g.lineWidth=width;g.stroke();
}
function gradient(g,x,y,w,h,colors) {
  const fill=g.createLinearGradient(x,y,x+w,y+h);
  colors.forEach((color,i)=>fill.addColorStop(i/(colors.length-1),color));return fill;
}
function stone(g,x,y,w,h,tone) {
  // Broad planes, recessed joints and a narrow worn bevel; no scratch-line overlay.
  const rgb=n=>`rgb(${n+3},${n+3},${n+2})`;
  g.fillStyle='#080a0b';g.fillRect(x,y,w,h);
  polygon(g,[[x+2,y+2],[x+w-4,y+2],[x+w-2,y+5],[x+w-3,y+h-3],[x+3,y+h-2]],
    gradient(g,x,y,w,h,[rgb(tone+10),rgb(tone+2),rgb(tone-6)]));
  g.strokeStyle='#adb0a323';g.lineWidth=1;g.beginPath();g.moveTo(x+4,y+h-4);g.lineTo(x+3,y+3);g.lineTo(x+w-5,y+3);g.stroke();
  g.strokeStyle='#02040580';g.beginPath();g.moveTo(x+w-3,y+5);g.lineTo(x+w-3,y+h-3);g.lineTo(x+5,y+h-3);g.stroke();
}
function brazier(g,x,y) {
  const light=g.createRadialGradient(x,y-9,2,x,y,145);
  light.addColorStop(0,'#f2c48830');light.addColorStop(.35,'#d4915020');light.addColorStop(1,'#d4915000');
  g.fillStyle=light;g.fillRect(x-145,y-145,290,290);
  g.save();g.translate(x,y);
  g.fillStyle='#020305b0';g.beginPath();g.ellipse(7,14,25,10,0,0,TAU);g.fill();
  polygon(g,[[-15,10],[0,4],[16,10],[13,16],[-13,16]],'#343434');
  polygon(g,[[-7,-8],[6,-8],[5,12],[-5,12]],gradient(g,-8,0,15,0,['#716459','#36312d','#141513']));
  g.beginPath();g.ellipse(0,-9,18,7,0,0,TAU);g.fillStyle='#17191a';g.fill();g.strokeStyle='#8f7960';g.lineWidth=2;g.stroke();
  for(let i=0;i<5;i++){
    const dx=(i-2)*5;g.beginPath();g.moveTo(dx-5,-10);g.bezierCurveTo(dx-9,-25,dx+7,-24-i%2*8,dx,-38+i*2);
    g.bezierCurveTo(dx+15,-21,dx+9,-13,dx+4,-9);g.closePath();
    g.fillStyle=gradient(g,0,-36,0,28,['#ffe9af','#db873bbd','#92391830']);g.fill();
  }
  g.fillStyle='#f8e7b7';g.beginPath();g.ellipse(0,-13,6,5,0,0,TAU);g.fill();
  g.restore();
}
export function paintArena(g,accent='#a28b69',texture=stoneTexture) {
  const {width,height}=ARENA,cx=width/2,cy=height/2;
  let seed=89417;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  g.fillStyle='#111416';g.fillRect(0,0,width,height);
  if(texture){
    g.save();g.filter='saturate(.35)';
    for(let y=0;y<height;y+=512)for(let x=0;x<width;x+=512)g.drawImage(texture,x,y,512,512);
    g.restore();g.fillStyle='#0c1420a6';g.fillRect(0,0,width,height);
  }else for(let row=0;row<12;row++)for(let col=-1;col<17;col++){
    stone(g,col*82+(row%2)*41,row*64,82,64,29+Math.floor(random()*9));
  }
  // Central inlaid limestone dais is a flat floor, not a raised collision obstacle.
  g.save();g.beginPath();g.ellipse(cx,cy,424,294,0,0,TAU);g.clip();
  const field=g.createRadialGradient(cx-110,cy-150,50,cx,cy,440);
  field.addColorStop(0,'#60635b');field.addColorStop(.48,'#424842');field.addColorStop(1,'#282d2b');
  g.globalAlpha=texture?.26:1;g.fillStyle=field;g.fillRect(cx-430,cy-300,860,600);g.globalAlpha=1;
  for(let i=0;i<32;i++){
    const a=i*TAU/32,b=(i+1)*TAU/32;
    for(const [inner,outer] of [[.3,.58],[.58,.82],[.82,1]]){
      g.beginPath();g.ellipse(cx,cy,424*outer,294*outer,0,a+.002,b-.002);
      g.ellipse(cx,cy,424*inner,294*inner,0,b-.004,a+.004,true);g.closePath();
      g.fillStyle=i%5===0?'#a6a08b10':i%3===0?'#0b100f26':'#bcc3b408';g.fill();
      g.strokeStyle=texture?'#b8b49115':'#101917a0';g.lineWidth=1;g.stroke();
    }
  }
  g.restore();
  for(const [rx,ry,color,w] of [[432,300,'#080d0c88',3],[429,298,'#9b8e7260',2],[420,291,'#10161470',2],[350,241,'#a2987b40',2],[345,238,'#080d0c70',1],[123,85,'#151b1760',2]]){
    g.beginPath();g.ellipse(cx,cy,rx,ry,0,0,TAU);g.strokeStyle=color;g.lineWidth=w;g.stroke();
  }
  // Brass inlays follow the masonry, with no false combat-range markings.
  for(let i=0;i<16;i++){
    const a=i*TAU/16,x=cx+Math.cos(a)*388,y=cy+Math.sin(a)*267;
    g.save();g.translate(x,y);g.rotate(a);g.scale(1,.68);
    polygon(g,[[-9,0],[0,-6],[10,0],[0,6]],gradient(g,-9,-6,18,12,['#b7a786','#625943','#171b17']));
    g.restore();
  }
  g.save();g.translate(cx,cy);g.scale(1,.7);
  polygon(g,[[0,-87],[16,-27],[66,-54],[30,-11],[91,0],[29,14],[65,54],[14,29],[0,87],[-16,28],[-65,54],[-30,12],[-91,0],[-29,-13],[-66,-54],[-15,-29]],
    gradient(g,-70,-80,140,160,['#a59c7d66','#5e645957','#242d2670']));
  ring(g,0,0,27,'#080e0d',3);ring(g,0,0,25,'#aaa38645',1);
  g.restore();
  // Code-only fallback remains usable in headless unit tests; production uses scanned stone.
  if(!texture)for(const color of ['#e5e0cc0d','#02080815']){
    g.fillStyle=color;
    for(let i=0;i<7000;i++){const x=random()*width,y=random()*height;g.fillRect(x,y,.7+random()*1.1,.5+random());}
  }
  for(const [x,y,rx,ry] of [[156,510,110,35],[1130,195,140,44],[740,663,180,27]]){
    const damp=g.createRadialGradient(x,y,2,x,y,rx);damp.addColorStop(0,'#060e0e35');damp.addColorStop(1,'#060e0e00');
    g.save();g.translate(x,y);g.scale(1,ry/rx);g.translate(-x,-y);g.fillStyle=damp;g.fillRect(x-rx,y-rx,rx*2,rx*2);g.restore();
  }
  // Cold light falls from the high nave; amber pools at the boundary carry the warm contrast.
  g.save();g.globalCompositeOperation='screen';
  const shaft=g.createLinearGradient(160,0,730,700);shaft.addColorStop(0,'#96b0ba18');shaft.addColorStop(.6,'#73858b08');shaft.addColorStop(1,'#73858b00');
  polygon(g,[[280,0],[410,0],[835,720],[405,720]],shaft);
  g.restore();
  const dark=g.createRadialGradient(cx,cy,170,cx,cy,680);
  dark.addColorStop(0,'#01060800');dark.addColorStop(.66,'#02070a16');dark.addColorStop(1,'#000305bb');
  g.fillStyle=dark;g.fillRect(0,0,width,height);
  // Ornament remains at the edge so it cannot imply unimplemented interior walls.
  for(const side of [0,width-18])stone(g,side,0,18,height,37);
  for(const y of [0,height-14])stone(g,0,y,width,14,33);
  for(const [x,y] of [[32,55],[width-32,55],[32,height-44],[width-32,height-44]])brazier(g,x,y);
  const resonance=g.createRadialGradient(cx,cy,60,cx,cy,330);
  resonance.addColorStop(0,`${accent}08`);resonance.addColorStop(1,`${accent}00`);
  g.fillStyle=resonance;g.fillRect(cx-330,cy-330,660,660);
}
