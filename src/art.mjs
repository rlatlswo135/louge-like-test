// Original Canvas illustrations: layered silhouettes, material shading, and restrained detail.
const TAU = Math.PI * 2;
const ink = '#090d14', gold = '#c4a66d';
let bossAtlas,bossWindupAtlas;
const bossRegions=new Map();
const bossWindupRegions=new Map();
let heroAtlas;
const heroFrames=new Map();
let weaponAtlas;
const weaponRegions=new Map();
const weaponOrder=['sword','spear','axe','bow','crossbow','fire','water','lightning','revolver','sniper','greatsword','dagger','boomerang','battle-staff','shotgun','cannon','machinegun','dual-pistols','flamethrower','gauntlet'];
export async function prepareWeaponArt(win){
  if(weaponAtlas)return;
  const image=new win.Image();image.src=new URL('../assets/art/weapon-atlas-v4.png',import.meta.url).href;
  await image.decode();
  const canvas=win.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const g=canvas.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,image.width,image.height).data;
  const boxes=[
    [0,75,358,130],[359,110,340,70],[700,58,267,185],[1044,0,145,292],[1200,74,336,165],
    [0,335,330,128],[337,335,321,133],[666,335,302,130],[974,340,229,145],[1204,340,332,135],
    [0,550,445,165],[446,581,269,102],[689,530,193,230],[887,593,335,85],[1224,580,312,133],
    [0,783,324,190],[325,790,385,186],[712,784,228,194],[941,772,322,181],[1274,784,262,187],
  ];
  for(const [i,id] of weaponOrder.entries()){
    const [rx,ry,rw,rh]=boxes[i],sx=image.width/1536,sy=image.height/1024;
    const x0=Math.round(rx*sx),x1=Math.round((rx+rw)*sx),y0=Math.round(ry*sy),y1=Math.round((ry+rh)*sy);
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*image.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right>left)weaponRegions.set(id,{x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
  weaponAtlas=image;
}
export async function prepareHeroArt(win){
  if(heroAtlas)return;
  const image=new win.Image();image.src=new URL('../assets/art/hero-atlas-v4.png',import.meta.url).href;
  await image.decode();
  const canvas=win.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const g=canvas.getContext('2d');g.drawImage(image,0,0);
  const pixels=g.getImageData(0,0,image.width,image.height).data;
  const cols=[0,.155,.296,.439,.585,.736,.87,1],rows=[0,205/1060,408/1060,619/1060,824/1060,1];
  for(const [row,id] of Object.keys(palettes).entries()){
    const frames=[];
    for(let col=0;col<7;col++){
      const x0=Math.round(cols[col]*image.width),x1=Math.round(cols[col+1]*image.width);
      const y0=Math.round(rows[row]*image.height),y1=Math.round(rows[row+1]*image.height);
      let left=x1,right=x0,top=y1,bottom=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*image.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      frames.push(right>left?{x:left,y:top,w:right-left+1,h:bottom-top+1,pivot:(x0+x1)/2}:null);
    }
    const unit=74/(frames[0]?.h||image.height/5*.9);
    heroFrames.set(id,{frames,unit});
  }
  heroAtlas=image;
}
export async function prepareBossArt(win){
  if(bossAtlas)return;
  const image=new win.Image(),windup=new win.Image();image.src=new URL('../assets/art/boss-atlas-v3.png',import.meta.url).href;
  windup.src=new URL('../assets/art/boss-windup-v4.png',import.meta.url).href;
  await Promise.all([image.decode(),windup.decode()]);
  const canvas=win.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const g=canvas.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,image.width,image.height).data;
  // Atlas gutters are hand checked; trim transparent pixels once during startup.
  const columns=[[0,305,620,960,1240,1536],[0,310,635,947,1230,1536],[0,320,616,937,1228,1536],[0,352,610,929,1225,1536]],rows=[0,256,507,761,1024];
  Object.keys(bossBook).forEach((id,i)=>{
    const row=Math.floor(i/5),col=i%5,x0=Math.round(columns[row][col]*image.width/1536),x1=Math.round(columns[row][col+1]*image.width/1536);
    const y0=Math.round(rows[row]*image.height/1024),y1=Math.round(rows[row+1]*image.height/1024);
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*image.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    bossRegions.set(id,right>left?{x:left,y:top,w:right-left+1,h:bottom-top+1}:{x:x0,y:y0,w:x1-x0,h:y1-y0});
  });
  canvas.width=windup.width;canvas.height=windup.height;g.drawImage(windup,0,0);
  const posed=g.getImageData(0,0,windup.width,windup.height).data;
  const rectangles=[
    [0,0,300,266],[307,0,320,269],[630,0,297,273],[929,0,309,276],[1240,0,296,254],
    [0,266,304,256],[306,254,314,266],[622,249,306,274],[930,276,302,244],[1234,254,302,261],
    [0,522,304,242],[306,517,314,254],[622,523,306,249],[918,519,346,249],[1265,516,271,257],
    [0,753,324,271],[327,762,287,262],[615,763,313,261],[930,766,296,258],[1230,753,306,271],
  ];
  Object.keys(bossBook).forEach((id,i)=>{
    const [rx,ry,rw,rh]=rectangles[i],sx=windup.width/1536,sy=windup.height/1024;
    const x0=Math.round(rx*sx),y0=Math.round(ry*sy),x1=Math.min(windup.width,Math.round((rx+rw)*sx)),y1=Math.min(windup.height,Math.round((ry+rh)*sy));
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(posed[(y*windup.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    bossWindupRegions.set(id,right>left?{x:left,y:top,w:right-left+1,h:bottom-top+1}:{x:x0,y:y0,w:x1-x0,h:y1-y0});
  });
  bossWindupAtlas=windup;bossAtlas=image;
}
const palettes = {
  warrior: ['#263443','#627988','#d5d7c8','#c8aa78','#435b68'],
  archer: ['#26372f','#60734c','#c9a57c','#d6c7a3','#8b6847'],
  mage: ['#29263b','#655476','#d7b894','#b5a0d5','#72d1ca'],
  gunslinger: ['#302827','#755247','#d1ad89','#d6c18f','#aa5949'],
  fighter: ['#382d29','#96604b','#d5b18a','#ddd5bc','#648077'],
};
function poly(g, pts, fill, stroke = ink, width = 1) {
  g.beginPath(); pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y)); g.closePath();
  g.fillStyle=fill; g.fill(); if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
}
function oval(g,x,y,rx,ry,fill,stroke=null,width=1,rotation=0){
  g.beginPath();g.ellipse(x,y,rx,ry,rotation,0,TAU);g.fillStyle=fill;g.fill();
  if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
}
function line(g,pts,color,width=1){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.lineJoin='round';g.stroke();}
function grad(g,x1,y1,x2,y2,stops){const v=g.createLinearGradient(x1,y1,x2,y2);stops.forEach(([p,c])=>v.addColorStop(p,c));return v;}
function metal(g){return grad(g,-16,0,16,0,[[0,'#18232d'],[.22,'#526671'],[.48,'#9eadae'],[.62,'#cbd3ce'],[.82,'#53636d'],[1,'#18232d']]);}
function cloth(g,light='#675748',mid='#302c31'){return grad(g,-25,-50,28,22,[[0,light],[.35,mid],[.72,'#1a202a'],[1,'#0b111a']]);}
function jewel(g,x,y,r,c){poly(g,[[x,y-r],[x+r*.7,y],[x,y+r],[x-r*.7,y]],c,'#f5f0d466',.6);line(g,[[x,y-r],[x-r*.1,y],[x,y+r]],'#fff8d988',.7);}

function drawWeapon(g,id,color,length,attack=0,muzzle=false,charge=0){
  const region=weaponRegions.get(id==='staff'?'lightning':id);
  if(weaponAtlas&&region){
    const bow=id==='bow',sizes={sword:57,spear:83,axe:57,crossbow:49,fire:64,water:64,lightning:64,staff:64,revolver:42,sniper:73,greatsword:72,dagger:34,boomerang:37,'battle-staff':80,shotgun:63,cannon:56,machinegun:65,'dual-pistols':48,flamethrower:61};
    const width=bow?62*region.w/region.h:sizes[id]||length+18,height=bow?62:width*region.h/region.w;
    const x=bow?-width*.8:['spear','battle-staff','fire','water','lightning','staff'].includes(id)?-width*.34:id==='crossbow'?-width*.38:-width*.22;
    g.save();if(muzzle)g.translate(-2,0);
    if(bow)g.scale(1-charge*.07,1+charge*.02);
    if(id==='boomerang'){
      // The source has a neighboring dagger tip in its middle-left gutter.
      // Exclude that transparent gutter with a cheap clip; keep both curved blade tips.
      g.beginPath();[[0,0],[1,0],[1,1],[0,1],[0,.76],[.3,.62],[.3,.28],[0,.2]].forEach(([px,py],i)=>i?g.lineTo(x+px*width,(py-.5)*height):g.moveTo(x+px*width,(py-.5)*height));g.closePath();g.clip();
    }
    g.drawImage(weaponAtlas,region.x,region.y,region.w,region.h,x,-height/2,width,height);
    if(bow){
      const tip=x+width*.28,pull=tip-5-charge*18;
      line(g,[[tip,-height*.46],[pull,0],[tip,height*.46]],'#ded6bd',.8);
      line(g,[[pull,0],[pull+42,0]],'#c6b48d',1.1);poly(g,[[pull+46,0],[pull+39,-2],[pull+39,2]],'#cbd5d3',null);
    }else if(id==='crossbow'){
      const pull=charge*4;line(g,[[3-pull,0],[width*.85-pull,0]],'#c9cec2',.9);
    }
    if(muzzle){g.save();g.globalCompositeOperation='lighter';poly(g,[[x+width,0],[x+width+7,-4],[x+width+15,0],[x+width+7,4]],'#fff0ac',null);g.restore();}
    g.restore();return;
  }
  const m=grad(g,0,-8,0,8,[[0,'#d6d5c4'],[.24,'#869197'],[.47,'#bec8c9'],[.55,'#667078'],[1,'#202c34']]), extension=Math.sin(attack*Math.PI)*8;
  if(id==='punch'||id==='kick'){
    oval(g,4,0,7,5,id==='kick'?'#34404a':'#caa27d','#131923');
    poly(g,[[5,-4],[14,-5],[22+extension,-4],[26+extension,1],[21+extension,5],[12,4],[6,3]],id==='kick'?m:'#c6a07d');
    for(let i=0;i<3;i++)line(g,[[15+i*2,-3],[17+i*2,3]],'#e2d3b5',.7);return;
  }
  if(['fire','water','lightning','staff','battle-staff'].includes(id)){
    line(g,[[-9,1],[length+5,1]],'#49372e',5);line(g,[[-8,-1],[length+4,-1]],'#b99b68',1);
    oval(g,length,0,8,9,'#101a25',gold,1.2);
    if(id==='fire')poly(g,[[length-4,3],[length-7,-2],[length,-12],[length+1,-5],[length+7,-8],[length+5,2],[length,7]],color,null);
    else if(id==='lightning')poly(g,[[length+4,-10],[length-4,1],[length+1,1],[length-3,10],[length+8,-2],[length+2,-2]],color,null);
    else jewel(g,length,0,6,color);
    return;
  }
  if(id==='bow'||id==='crossbow'){
    if(id==='bow'){
      g.beginPath();g.moveTo(8+charge*3,-25);g.quadraticCurveTo(34-charge*3,0,8+charge*3,25);g.strokeStyle='#a77a48';g.lineWidth=4;g.stroke();
      line(g,[[8+charge*3,-25],[11-charge*18,0],[8+charge*3,25]],'#ded6bd',1);
    }else{
      poly(g,[[-4,-4],[25,-5],[34,0],[25,5],[-4,4]],'#684a36');
      poly(g,[[14,-2],[11,-18],[18,-24],[23,-18],[22,-2],[27,0],[22,2],[23,18],[18,24],[11,18],[14,2]],m);
      line(g,[[11,-18],[25,0],[11,18]],'#dedac7',1);
    }
    const pull=id==='bow'?charge*14:charge*5;
    line(g,[[4-pull,0],[length+8-pull,0]],'#d8e0d2',1.2);poly(g,[[length+9-pull,0],[length+2-pull,-3],[length+4-pull,3]],m,null);return;
  }
  if(['revolver','sniper','shotgun','cannon','machinegun','dual-pistols','flamethrower'].includes(id)){
    const end=id==='sniper'?49:id==='cannon'?42:id==='shotgun'?36:id==='machinegun'?34:id==='flamethrower'?31:id==='dual-pistols'?25:29;
    const thick=id==='cannon'?8:id==='shotgun'?5:3.5;
    poly(g,[[-7,-thick],[end,-thick],[end+4,0],[end,thick],[4,thick],[2,13],[-5,12],[-1,2],[-7,2]],grad(g,0,-9,0,15,[[0,'#c9d0c8'],[.3,'#5c6b70'],[1,'#202a31']]));
    line(g,[[-3,-thick-2],[end,-thick-2]],'#e8d9ad',1.2);poly(g,[[0,3],[8,3],[6,13],[-1,12]],'#694832');
    if(id==='sniper'){poly(g,[[9,-11],[28,-11],[31,-7],[10,-6]],'#1a252d');oval(g,18,-9,3,2,'#8cb6bb');}
    if(id==='shotgun')line(g,[[6,-8],[end-4,-8]],'#303c43',2);
    if(id==='cannon')oval(g,end+1,0,4,6,'#202932','#c4ae82');
    if(id==='machinegun')line(g,[[11,6],[11,17],[16,17]],'#99a19b',2);
    if(id==='dual-pistols')poly(g,[[5,6],[22,6],[21,11],[8,11]],'#59666b');
    if(id==='flamethrower'){oval(g,9,17,6,5,'#704936');oval(g,end,0,4,4,'#d27948');}
    if(muzzle){g.save();g.globalCompositeOperation='lighter';poly(g,[[end,0],[end+8,-5],[end+7,-1],[end+16,0],[end+7,2],[end+8,6]],'#fff0ac',null);g.restore();}return;
  }
  if(id==='spear'){
    line(g,[[-17,1],[length+10,1]],'#6e523b',4);line(g,[[-16,-1],[length+8,-1]],gold,.8);
    poly(g,[[length-7,-4],[length+13,0],[length-7,4],[length-1,0]],m);line(g,[[length-9,-4],[length-9,4]],gold,2);return;
  }
  if(id==='axe'){
    line(g,[[-8,1],[length,1]],'#674932',5);poly(g,[[length-7,-3],[length-14,-20],[length+1,-27],[length+12,-18],[length+8,-4],[length+11,17],[length,25],[length-13,17],[length-8,4]],m);
    line(g,[[length-12,-19],[length+1,-24],[length+8,-16]],'#f0e9d9',1.8);jewel(g,length,0,3,gold);return;
  }
  const width=id==='greatsword'?8:id==='dagger'?2.4:4;
  poly(g,[[5,-width],[length-5,-width*.72],[length+13,0],[length-5,width*.72],[5,width]],m);
  poly(g,[[7,-width],[length-5,-width*.72],[length+13,0],[8,0]],grad(g,0,-width,0,0,[[0,'#bac3bf'],[.3,'#8a979b'],[1,'#cad1c9']]),null);
  line(g,[[7,-width],[length-5,-width*.72],[length+13,0]],'#e0dfcb',.6);
  line(g,[[5,-width-5],[2,0],[5,width+5]],gold,2.6);line(g,[[-8,0],[4,0]],'#654932',5);jewel(g,-8,0,2.5,'#b9c8bd');
}

function drawHeroArt(g,cfg,scale,time,motion){
  const cls=palettes[cfg.classId]?cfg.classId:'warrior',[dark,mid,skin,trim,accent]=palettes[cls],color=cfg.color||accent;
  const reduced=motion.reducedMotion===true,t=reduced?0:time, dodge=Math.max(0,motion.dodgeTime||0),kind=motion.dodgeKind;
  const rolling=dodge>0&&kind==='roll',dash=dodge>0&&kind==='dash',blink=dodge>0&&kind==='blink';
  const progress=Math.max(0,Math.min(1,motion.dodgeProgress||0)),walk=motion.walk&&!reduced;
  const stride=walk?Math.sin(t*13)*3.4:0, crouch=rolling?(reduced?4:7+Math.sin(progress*Math.PI)*7):dash?3:0;
  const id=cfg.weaponId,attack=motion.attackProgress||0,kickActive=id==='kick'&&attack>0;
  g.save();g.scale(scale,scale);g.scale(.72,.72);
  if(rolling){const rollProgress=reduced?0:progress;g.translate((motion.dodgeDirection||1)*Math.sin(rollProgress*Math.PI)*5,0);g.translate(0,-20);g.rotate((motion.dodgeDirection||1)*rollProgress*TAU);g.translate(0,20);}
  else g.rotate((motion.lean||0)+(dash?-.35:0));
  // Ground contact and split, weight-bearing greaves.
  oval(g,0,2,19,4,'#02060ab0');
  const leg=(x,offset,front)=>{g.save();g.translate(x,0);g.rotate(offset*.04);poly(g,[[-5,-31+crouch],[5,-31+crouch],[7,-20+crouch],[6,-10+offset],[5,0],[-6,0],[-7,-10+offset]],grad(g,-7,-27,8,0,[[0,front?'#75868a':'#475762'],[.38,mid],[.7,dark],[1,'#141b24']]),'#151b22',.6);poly(g,[[-6,-12+offset],[6,-12+offset],[7,-8+offset],[-6,-7+offset]],front?metal(g):'#39383a',null);poly(g,[[-7,-2],[6,-2],[8,1],[-8,1]],'#171c22');line(g,[[-4,-25+crouch],[3,-24+crouch]],'#aeb7ac',.7);g.restore();};
  if(kickActive){leg(-7,stride,false);g.save();g.translate(7,-30+crouch);g.rotate(-.15-attack*.95);poly(g,[[-5,0],[5,-1],[7,12],[4,19],[-5,18],[-7,9]],grad(g,-7,0,7,20,[[0,mid],[.55,dark],[1,'#141b24']]),'#151b22',.6);g.translate(0,18);g.rotate(.25+attack*.55);poly(g,[[-4,0],[4,0],[5,13],[4,22],[-5,22],[-6,12]],grad(g,-6,0,6,22,[[0,'#56636a'],[.5,dark],[1,'#141b24']]),'#151b22',.6);poly(g,[[-6,17],[5,17],[6,20],[-7,20]],'#171c22');g.restore();}else{leg(-7,stride,false);leg(7,-stride,true);}
  // Back cloak/cape gives each silhouette depth without hiding legs.
  if(['warrior','mage','fighter'].includes(cls))poly(g,[[-12,-60+crouch],[-20,-54+crouch],[-24,-24+crouch],[-16,-14],[0,-20],[-6,-50]],cloth(g,cls==='mage'?'#8e7198':'#665848'), '#111923',1);
  // Articulated arms behind cuirass, with shoulder plates and gauntlets.
  for(const side of [-1,1]){
    g.save();g.translate(side*12,-53+crouch);const swing=walk?side*stride*.025:0;g.rotate(swing+(side===1&&(motion.attackProgress||0)>0?-.45*(motion.attackProgress||0):0));
    poly(g,[[-5,-4],[5,-5],[8,4],[5,15],[2,22],[-5,20],[-8,12]],grad(g,-8,0,8,18,[[0,mid],[.45,dark],[1,'#171c25']]));
    if(cls==='warrior')poly(g,[[-7,-5],[0,-9],[7,-4],[6,3],[-5,3]],metal(g));
    else if(cls==='fighter'){line(g,[[-6,-3],[0,-8],[6,-3],[5,2],[-5,3]],'#c4a782',2);line(g,[[-4,-2],[4,-2]],'#ead9bb',.8);}
    else poly(g,[[-6,-4],[5,-5],[7,3],[-5,4]],cloth(g,mid));
    oval(g,side*1,20,5,4,skin,'#1c2025');poly(g,[[-6,17],[5,16],[6,22],[-5,24]],metal(g));g.restore();
  }
  // Hip lames overlap thighs, keeping the torso-to-leg silhouette continuous.
  poly(g,[[-10,-39+crouch],[10,-39+crouch],[14,-31+crouch],[12,-24+crouch],[5,-21+crouch],[0,-25+crouch],[-6,-21+crouch],[-13,-25+crouch],[-14,-32+crouch]],cls==='mage'?cloth(g,'#75607e','#292331'):metal(g),'#171c22',.7);
  poly(g,[[-11,-31+crouch],[-3,-33+crouch],[0,-24+crouch],[-7,-22+crouch]],cls==='gunslinger'?'#59423a':dark,'#171c22',.5);
  poly(g,[[3,-33+crouch],[11,-31+crouch],[8,-22+crouch],[1,-24+crouch]],cls==='fighter'?'#98715a':mid,'#171c22',.5);
  if(cls==='gunslinger'){poly(g,[[-11,-48+crouch],[-15,-43+crouch],[-18,-7],[-10,-3],[-8,-28+crouch]],cloth(g,'#77584a','#302725'));poly(g,[[11,-48+crouch],[15,-43+crouch],[18,-7],[10,-3],[8,-28+crouch]],cloth(g,'#77584a','#302725'));}
  if(cls==='archer'){poly(g,[[-15,-54+crouch],[-20,-48+crouch],[-23,-20],[-15,-13],[-10,-37+crouch]],cloth(g,'#667044','#29362e'));line(g,[[-20,-55+crouch],[-25,-38+crouch],[-21,-24]],'#a58458',1);}
  if(cls==='mage')poly(g,[[-11,-38+crouch],[-13,-31+crouch],[-18,-4],[-11,1],[0,-4],[9,1],[18,-4],[13,-31+crouch],[10,-38+crouch]],cloth(g,'#76647d','#302a39'),'#171721',.7);
  // Ribbed cuirass, fitted waist and layered waistguard.
  poly(g,[[-12,-65+crouch],[0,-71+crouch],[12,-65+crouch],[17,-52+crouch],[12,-38+crouch],[7,-31+crouch],[-8,-31+crouch],[-15,-40+crouch],[-17,-54+crouch]],cls==='fighter'?cloth(g,'#b08a70','#554137'):grad(g,-17,-62,16,-38,[[0,'#aab5b0'],[.16,mid],[.43,dark],[.72,'#202c36'],[1,'#111821']]),'#111820',.65);
  poly(g,[[-9,-61+crouch],[0,-67+crouch],[9,-61+crouch],[11,-49+crouch],[6,-42+crouch],[-7,-42+crouch],[-12,-50+crouch]],cls==='fighter'?'#86634d':grad(g,-10,-65,11,-42,[[0,'#b9c2b8'],[.25,mid],[.62,dark],[1,'#18212b']]));
  // Central breastplate ridge and engraved, deliberately sparse seams.
  poly(g,[[-2,-63+crouch],[2,-63+crouch],[5,-48+crouch],[0,-44+crouch],[-4,-49]],'#9caa9f',null);
  line(g,[[-9,-57+crouch],[-4,-54+crouch],[-5,-47+crouch]],'#d1c7aa88',.8);line(g,[[9,-57+crouch],[5,-54+crouch],[6,-47+crouch]],'#101923',1);
  poly(g,[[-13,-46+crouch],[13,-46+crouch],[11,-38+crouch],[6,-34+crouch],[-7,-34+crouch],[-12,-39+crouch]],cloth(g,trim));
  line(g,[[-12,-43+crouch],[12,-43+crouch]],gold,1.3);jewel(g,0,-41+crouch,3,color);
  // Full neck bridges collar and jaw; face stays adult-sized at this scale.
  poly(g,[[-4,-68+crouch],[4,-68+crouch],[5,-61+crouch],[0,-58+crouch],[-5,-61+crouch]],skin,'#171b20',.5);
  line(g,[[-5,-63+crouch],[0,-61+crouch],[5,-63+crouch]],'#3c302b',1);
  // Class-specific headwear and adult face planes.
  g.save();g.translate(0,-74+crouch);g.scale(.76,.76);g.translate(0,74-crouch);
  if(cls==='warrior'){
    poly(g,[[-9,-77+crouch],[-7,-84+crouch],[5,-85+crouch],[10,-77+crouch],[9,-66+crouch],[0,-62+crouch],[-9,-67+crouch]],metal(g));
    poly(g,[[-10,-77+crouch],[0,-80+crouch],[11,-77+crouch],[8,-72+crouch],[-8,-72+crouch]],'#17212a');
    poly(g,[[-6,-71+crouch],[6,-71+crouch],[4,-66+crouch],[0,-64+crouch],[-5,-67+crouch]],'#987e66');
    line(g,[[-2,-83+crouch],[0,-79+crouch],[2,-83+crouch]],gold,1.4);
  }else if(cls==='archer'){
    poly(g,[[-8,-77+crouch],[-6,-84+crouch],[5,-83+crouch],[9,-75+crouch],[8,-66+crouch],[0,-63+crouch],[-8,-67+crouch]],skin);
    poly(g,[[-10,-78+crouch],[-8,-86+crouch],[2,-90+crouch],[10,-83+crouch],[14,-77+crouch],[3,-78+crouch],[-4,-74+crouch]],cloth(g,'#8d7451'));
    poly(g,[[-9,-75+crouch],[10,-77+crouch],[8,-72+crouch],[-8,-70+crouch]],dark);
    oval(g,3,-74+crouch,1.4,1,'#f4d8a5');
  }else if(cls==='mage'){
    poly(g,[[-8,-77+crouch],[-7,-83+crouch],[5,-83+crouch],[9,-76+crouch],[7,-66+crouch],[0,-63+crouch],[-8,-67+crouch]],skin);
    poly(g,[[-11,-78+crouch],[-9,-84+crouch],[-2,-89+crouch],[8,-87+crouch],[13,-77+crouch],[5,-79+crouch],[0,-75+crouch]],cloth(g,'#7e678f'));
    poly(g,[[-7,-76+crouch],[8,-76+crouch],[6,-73+crouch],[-7,-72+crouch]],'#111723');oval(g,2,-74+crouch,1.3,1,color);
    poly(g,[[0,-86+crouch],[4,-99+crouch],[7,-87+crouch]],color,null);
  }else if(cls==='gunslinger'){
    poly(g,[[-8,-77+crouch],[-7,-83+crouch],[5,-83+crouch],[9,-76+crouch],[8,-66+crouch],[0,-63+crouch],[-8,-67+crouch]],skin);
    poly(g,[[-12,-80+crouch],[-8,-82+crouch],[11,-81+crouch],[16,-77+crouch],[11,-75+crouch],[-13,-76+crouch]],'#40342f');
    poly(g,[[-5,-83+crouch],[0,-87+crouch],[8,-83+crouch]],'#312925');
    poly(g,[[-11,-76+crouch],[11,-77+crouch],[7,-73+crouch],[-10,-72+crouch]],'#171a20');oval(g,2,-74+crouch,1.3,1,'#e9d49f');
  }else{
    poly(g,[[-8,-78+crouch],[-7,-84+crouch],[5,-83+crouch],[9,-76+crouch],[7,-66+crouch],[0,-63+crouch],[-8,-68+crouch]],skin);
    poly(g,[[-11,-77+crouch],[-9,-86+crouch],[-2,-91+crouch],[8,-87+crouch],[12,-78+crouch],[6,-81+crouch],[0,-77+crouch]],cloth(g,'#665043'));
    poly(g,[[-8,-75+crouch],[9,-76+crouch],[5,-72+crouch],[-7,-72+crouch]],'#171c23');oval(g,2,-74+crouch,1.4,1,'#e9bd81');
  }
  g.restore();
  // Aimed weapon sits in the hand; roll counter-rotation preserves world aim.
  if(id&&id!=='kick'){const aim=Number.isFinite(motion.weaponAngle)?motion.weaponAngle:-.2;
    g.save();g.translate(17,-48+crouch);const melee=['sword','greatsword','axe','dagger'].includes(id);const attackAngle=melee&&attack?-.8+attack*1.7:0;
    const rollAngle=rolling&&!reduced?(motion.dodgeDirection||1)*progress*TAU:0;
    g.rotate((aim+attackAngle)-rollAngle);
    const reach=id==='sniper'?39:id==='spear'?38:id==='greatsword'?34:id==='axe'?22:id==='bow'?29:id==='crossbow'?30:['staff','battle-staff','fire','water','lightning'].includes(id)?31:id==='cannon'?33:25;
    drawWeapon(g,id,color,reach,attack,!!motion.muzzle);g.restore();
  }
  if(cls==='mage'&&(motion.charge||0)>0){oval(g,18,-52+crouch,4+motion.charge*3,4+motion.charge*3,`${color}66`,color);}
  if(cls==='archer'&&(motion.charge||0)>0){line(g,[[20,-48+crouch],[25,-48+crouch]],'#e9dfc9',2);}
  if(cls==='gunslinger'&&(motion.reloadTime||0)>0){poly(g,[[13,-40+crouch],[18,-40+crouch],[18,-35+crouch],[13,-35+crouch]],gold);}
  if(blink){g.globalAlpha=.45;poly(g,[[-19,-65],[-12,-78],[4,-83],[18,-63],[16,-32],[4,-16],[-18,-29]],color,null);g.globalAlpha=1;}
  if((motion.hurtFlash||0)>0){g.globalCompositeOperation='screen';g.globalAlpha=.5;poly(g,[[-15,-84],[13,-84],[19,-48],[12,-31],[11,-2],[-12,-2],[-17,-43]],'#fff3dc',null);g.globalAlpha=1;g.globalCompositeOperation='source-over';}
  if(attack>0){g.save();g.globalAlpha=.25+attack*.35;g.strokeStyle=color;g.lineWidth=2;const step=Math.max(1,Math.min(3,motion.comboStep||1));for(let i=0;i<step;i++){g.beginPath();g.arc(12,-47,28+i*4,-1.4+attack+i*.12,-.2+attack+i*.12,false);g.stroke();}g.restore();}
  if(motion.fused){jewel(g,-13,-49,4,'#e2b869');jewel(g,13,-49,4,'#b9a5fa');}
  if(motion.uniqueId==='one-cut'&&motion.timingMeter){g.fillStyle='#111820';g.fillRect(-18,-105,36,4);g.fillStyle='#d6c49a';g.fillRect(-17,-104,34,2);g.fillStyle='#fff1c5';g.fillRect(-17+Math.max(0,Math.min(1,motion.timingPhase||0))*32,-106,2,6);}
  if((motion.heat||0)>0){g.fillStyle='#ff7656';g.fillRect(-13,-110,26*Math.max(0,Math.min(1,motion.heat)),2);}
  g.restore();
}
export function drawHero(g,cfg,scale=1,time=0,motion={}){
  const sheet=heroFrames.get(cfg.classId),reduced=motion.reducedMotion===true;
  if(!heroAtlas||!sheet?.frames[0]){drawHeroArt(g,cfg,scale,time,motion);return;}
  const attack=Math.max(0,Math.min(1,motion.attackProgress||0)),charge=Math.max(0,Math.min(1,motion.chargeRatio??motion.charge??0));
  const dodging=(motion.dodgeTime||0)>0,progress=Math.max(0,Math.min(1,motion.dodgeProgress||0));
  const pose=dodging?5:motion.guardTime>0?(motion.guardKind==='slip'?5:3):charge>0?3:attack>0?(cfg.weaponId==='kick'?6:attack<.7?4:0):motion.walk&&!reduced?[1,0,2,0][Math.floor(time*9)%4]:0;
  const frame=sheet.frames[pose]||sheet.frames[0],u=sheet.unit;
  const color=cfg.color||palettes[cfg.classId][4],id=cfg.weaponId;
  g.save();g.scale(scale,scale);
  oval(g,0,1,17,4,'#02060a88');
  if(dodging&&motion.dodgeKind==='blink')g.globalAlpha*=.5;
  if(dodging&&motion.dodgeKind==='roll'&&!reduced){g.translate(0,-18);g.rotate((motion.dodgeDirection||1)*progress*TAU);g.translate(0,18);}
  else if(!reduced){g.translate(attack*Math.cos(motion.weaponAngle||0)*3,motion.walk?Math.sin(time*18)*.6:0);g.rotate(dodging?-.12:charge?-.035:0);}
  const drawBody=()=>g.drawImage(heroAtlas,frame.x,frame.y,frame.w,frame.h,(frame.x-frame.pivot)*u,-frame.h*u,frame.w*u,frame.h*u);
  drawBody();
  if((motion.hurtFlash||0)>0){g.save();g.globalCompositeOperation='screen';g.globalAlpha*=.5;drawBody();g.restore();}
  if(id&&!['punch','kick'].includes(id)){
    const hands=[[22,-51],[18,-50],[20,-50],[8,-53],[35,-53],[19,-24],[22,-51]],hand=hands[pose];
    const aim=Number.isFinite(motion.weaponAngle)?motion.weaponAngle:-.2;
    const slash=['sword','greatsword','axe','dagger'].includes(id);
    g.save();g.translate(hand[0],hand[1]);
    g.rotate(aim+(slash&&attack?-.9+attack*1.8:0)-(dodging&&motion.dodgeKind==='roll'&&!reduced?(motion.dodgeDirection||1)*progress*TAU:0));
    if(dodging)g.globalAlpha*=.7;
    g.scale(.74,.74);
    const reach=id==='sniper'?39:id==='spear'?43:id==='greatsword'?37:id==='axe'?24:['bow','crossbow'].includes(id)?31:29;
    drawWeapon(g,id,color,reach,attack,!!motion.muzzle,charge);
    if(charge>0){g.globalAlpha*=.45+charge*.4;oval(g,reach+5,0,2+charge*2,2+charge*2,charge>=.98?'#fff1aa':color);}
    g.restore();
  }
  if(charge>0&&['punch','kick'].includes(id)){
    const x=id==='kick'?12:10,y=id==='kick'?-13:-51;
    g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=.3+charge*.5;
    oval(g,x,y,4+charge*5,4+charge*5,color);g.restore();
  }
  if(motion.fused){jewel(g,-10,-45,2.3,'#e2b869');jewel(g,10,-45,2.3,'#b9a5fa');}
  g.restore();
}

const bossBook={
  'iron-warden':['knight','#718791','#c7d5cf'],'ravager':['beast','#765044','#e4a36e'],
  'ember-guardian':['ember','#573a37','#ffad52'],'frost-watcher':['ice','#527d90','#b4e9ed'],
  'storm-orb':['orb','#384967','#a7ddfb'],'iron-bastion':['construct','#58645f','#edb96d'],
  'twin-blades':['specter','#5a526a','#ded3f0'],'abyss-shaman':['shaman','#414355','#9dcac3'],
  'dusk-executioner':['executioner','#584753','#e7a183'],'rift-lord':['lord','#514763','#d2a9f7'],
  'glass-duelist':['duelist','#52636b','#b9f0dc'],'mire-queen':['queen','#435345','#a4c980'],
  'sun-eater':['sun','#654739','#ffcc72'],'clockwork-regent':['clockwork','#60594a','#e7c77b'],
  'void-leviathan':['leviathan','#3d4b59','#75c4d6'],'red-comet':['comet','#693e3b','#ff8061'],
  'pale-oracle':['oracle','#626778','#e4d9c7'],'thunder-colossus':['colossus','#53616b','#f2d783'],
  'night-matriarch':['matriarch','#534354','#d7acd9'],'rift-emperor':['emperor','#514050','#e3b76f'],
};
function drawBossVector(g,id,radius,state,time,motion){
  const [kind,base,accent]=bossBook[id]||bossBook['iron-warden'];
  const phase=state.phase>=2,reduced=motion.reducedMotion===true,clock=reduced?0:time;
  const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
  const anticipation=clamp(motion.anticipation),strike=motion.strike==null?0:clamp(motion.strike),recovery=motion.recovery==null?0:clamp(motion.recovery);
  const angle=Number.isFinite(motion.angle)?motion.angle:0,animated=motion.anticipation!==undefined||motion.strike!==undefined||motion.recovery!==undefined;
  const wind=state.state==='windup',active=state.state==='active';
  const swing=(a,b,c)=>!animated?(wind?a:active?b:c):motion.strike!=null?a+(b-a)*(1-(1-strike)**3):motion.recovery!=null?b+(c-b)*recovery:c+(a-c)*anticipation;
  const bob=reduced?0:Math.sin(clock*2)*(kind==='orb'||kind==='specter'||kind==='shaman'||kind==='lord'?2:.5)+(motion.moving?Math.sin(clock*10):0);
  g.save();g.scale(radius/42,radius/42);oval(g,0,19,43,12,'#02070bc9');g.translate(0,bob);
  if(animated){g.translate(Math.cos(angle)*(strike*4-anticipation*1.2+recovery*.5),Math.sin(angle)*(strike*2-anticipation*.5));g.translate(0,-18);g.rotate(Math.max(-.2,Math.min(.2,Math.sin(angle)*(anticipation*.12+strike*-.16+recovery*.05))));g.translate(0,18);const squash=(reduced?.025:.1)*anticipation;g.translate(0,18);g.scale(1+squash,1-squash);g.translate(0,-18);}
  const armor=metal(g),shadow=cloth(g,base), floating=['orb','specter','shaman','oracle'].includes(kind);
  if(kind==='orb'){
    for(let i=0;i<3;i++){g.save();g.rotate(clock*.3+i*Math.PI/3+(animated?anticipation*-.2+strike*.55+recovery*-.1+angle*.2:0));g.strokeStyle=i===1?gold:`${accent}bb`;g.lineWidth=1.5;g.beginPath();g.ellipse(0,-15,39,17,0,0,TAU);g.stroke();jewel(g,39,-15,4,accent);g.restore();}
    oval(g,0,-15,25,27,grad(g,-25,-40,25,10,[[0,'#a9bfca'],[.22,'#42566c'],[.7,'#1e2b41'],[1,'#0d1727']]),gold,1.5);
    poly(g,[[-22,-18],[0,-36],[23,-17],[0,0]],'#111a2a',accent);oval(g,0,-17,9,13,accent);oval(g,1,-17,3,9,'#10182b');oval(g,-3,-22,2,2,'#fff7dc');
  }else if(kind==='beast'||kind==='leviathan'){
    if(kind==='beast')for(const s of [-1,1]){g.save();g.scale(s,1);poly(g,[[14,-18],[30,-36],[45,-45],[37,-25],[46,-16],[31,-8],[21,2]],shadow);g.restore();}
    poly(g,[[-35,-31],[-19,-43],[12,-41],[34,-27],[40,-3],[22,14],[-19,12],[-39,-5]],grad(g,-36,-40,35,16,[[0,'#b5a18a'],[.25,base],[.65,'#403739'],[1,'#171a20']]));
    poly(g,[[-16,-34],[-8,-45],[7,-43],[24,-32],[28,-20],[14,-10],[-12,-12],[-25,-22]],shadow);
    poly(g,[[-20,-22],[17,-23],[13,-10],[-7,-7]],'#30282a');line(g,[[-15,-19],[-6,-20]],accent,2);line(g,[[4,-20],[14,-18]],accent,2);
    if(kind==='beast')for(const s of [-1,1]){g.save();g.scale(s,1);poly(g,[[11,-34],[22,-54],[26,-69],[29,-48],[38,-57],[32,-36]],'#9c7756');g.restore();}
    else for(let s=-1;s<=1;s++){g.save();g.translate(s*10,4);g.rotate(s*.32);line(g,[[0,0],[s*9,10],[s*17,17],[s*20,27]],accent,3);oval(g,s*20,27,2.5,3,base,accent,.7);g.restore();}
    for(let i=0;i<4;i++)poly(g,[[-16+i*9,6],[-10+i*9,16],[-3+i*9,7]],'#c4a87f');
  }else{
    const thin=['specter','shaman','executioner','duelist','oracle'].includes(kind),width=kind==='colossus'?39:thin?22:32;
    // Ragged mantle and heavy greaves create distinct grounded body mass.
    poly(g,[[-width,-39],[-19,-54],[16,-53],[width,-38],[width+4,8],[18,14],[7,25],[-5,15],[-21,23],[-width-5,10]],shadow);
    if(kind==='matriarch')for(const s of [-1,1]){g.save();g.scale(s,1);poly(g,[[20,-40],[35,-63],[52,-69],[48,-53],[61,-45],[44,-38],[54,-25],[31,-29]],`${accent}88`,accent,.7);line(g,[[25,-39],[43,-58],[53,-62]],'#ead5e5',.8);g.restore();}
    if(kind==='queen'){poly(g,[[-29,-40],[-42,-51],[-39,-15],[-24,4],[-17,-18]],cloth(g,'#7b8556','#303a31'),'#20271f',.8);poly(g,[[29,-40],[42,-51],[39,-15],[24,4],[17,-18]],cloth(g,'#7b8556','#303a31'),'#20271f',.8);}
    for(const s of [-1,1]){
      g.save();g.scale(s,1);
      poly(g,[[7,-6],[20,-7],[23,25],[14,32],[6,27]],'#151d27');
      poly(g,[[9,1],[20,0],[21,11],[17,14],[10,11]],armor);
      poly(g,[[10,14],[20,13],[22,25],[14,29],[9,26]],armor);
      poly(g,[[9,27],[22,25],[25,31],[11,33],[5,31]],'#28343e');
      poly(g,[[width-8,-39],[width+5,-43],[width+16,-32],[width+15,-15],[width+3,-11],[width-5,-21]],armor);
      poly(g,[[width-7,-38],[width+3,-42],[width+12,-33],[width+1,-30]],'#bec8bd',null);
      line(g,[[width+1,-26],[width+12,-25],[width+10,-21]],'#101923',1.4);
      g.restore();
    }
    poly(g,[[-22,-39],[-7,-51],[17,-46],[25,-27],[17,-7],[-16,-6],[-26,-24]],grad(g,-25,-50,26,-6,[[0,'#cad0c1'],[.18,base],[.52,'#37434b'],[1,'#151d27']]));
    poly(g,[[-19,-36],[-5,-44],[0,-22],[-13,-15],[-23,-25]],'#aab7ae',null);poly(g,[[0,-45],[17,-40],[22,-26],[9,-15],[0,-20]],base,null);
    line(g,[[-18,-37],[-4,-45],[15,-39]],gold,1.2);
    for(let j=0;j<3;j++)poly(g,[[-18,-8+j*6],[18,-8+j*6],[22,-2+j*6],[-21,-2+j*6]],shadow,'#91a69b66',.7);
    jewel(g,0,-25,7,accent);
    g.save();g.translate(0,-55);g.scale(.68,.68);g.translate(0,55);
    if(['shaman','specter','executioner','oracle','matriarch'].includes(kind)){
      poly(g,[[-17,-42],[-22,-61],[-6,-76],[14,-68],[23,-43],[9,-48],[6,-59],[-7,-57],[-9,-43]],shadow);
      poly(g,[[-8,-59],[8,-59],[9,-45],[0,-39],[-9,-46]],'#101923');line(g,[[-6,-52],[-1,-51]],accent,1.5);line(g,[[3,-51],[7,-52]],accent,1.5);
    }else{
      poly(g,[[-17,-45],[-18,-62],[-8,-71],[8,-71],[19,-61],[17,-44],[6,-37],[-7,-39]],armor);
      poly(g,[[-15,-57],[15,-57],[11,-52],[-12,-52]],'#0c1723');line(g,[[-11,-55],[11,-55]],`${accent}a0`,1.1);
      poly(g,[[-2,-60],[3,-59],[4,-43],[0,-38],[-3,-44]],armor);
    }
    if(kind==='queen')poly(g,[[-18,-59],[-20,-75],[-10,-65],[0,-83],[9,-65],[20,-76],[17,-56],[8,-52],[-9,-52]],'#b8a66b',gold,.9);
    if(['ice','ember','lord','sun','comet','emperor'].includes(kind)){
      const horns=['ice','ember','beast','comet'].includes(kind);
      poly(g,[[-17,-61],[-23,-79],[-8,-68],[0,-86],[8,-68],[24,-78],[18,-59]],kind==='lord'||kind==='emperor'?gold:armor);
      if(horns){poly(g,[[-18,-39],[-28,-58],[-22,-52],[-12,-41]],accent);poly(g,[[18,-39],[28,-58],[22,-52],[12,-41]],accent);}
    }
    g.restore();
    // A single clear signature ornament per variant; no random surface noise.
    if(kind==='ember'||kind==='sun'||kind==='comet'){
      line(g,[[-17,-32],[-9,-25],[-15,-14]],accent,2.3);line(g,[[12,-34],[7,-24],[16,-14]],'#ffd17a',1.7);
      if(kind==='sun')oval(g,0,-91,9,3,'#ffd38a');
    }else if(kind==='ice')poly(g,[[-20,-38],[-28,-59],[-18,-53],[-13,-67],[-7,-41]],'#addfe8','#e6ffff',1);
    else if(kind==='construct'||kind==='clockwork'){
      line(g,[[-25,-30],[25,-30]],gold,2);for(let i=-1;i<=1;i++)oval(g,i*12,-29,3,3,'#111c27',gold);jewel(g,0,-23,5,accent);
    }else if(kind==='specter'||kind==='duelist'){
      for(const s of [-1,1]){g.save();g.scale(s,1);poly(g,[[22,-22],[36,-42],[39,-15],[29,-4]],`${accent}55`,accent,.8);g.restore();}
    }else if(kind==='lord'||kind==='emperor'){
      for(const s of [-1,1]){g.save();g.scale(s,1);poly(g,[[25,-39],[43,-67],[62,-50],[48,-25],[62,-9],[38,8],[34,-19]],`${accent}66`,accent,.8);g.restore();}
      g.strokeStyle=`${accent}99`;g.lineWidth=1.2;g.beginPath();g.arc(0,-36,phase?59:50,0,TAU);g.stroke();
      for(let i=0;i<(phase?8:5);i++){const a=clock*.35+i*TAU/(phase?8:5);jewel(g,Math.cos(a)*56,Math.sin(a)*56-36,phase?5:3,accent);}
    }
    const weaponId=kind==='knight'||kind==='ice'||kind==='duelist'||kind==='emperor'?'greatsword':kind==='executioner'?'axe':kind==='shaman'||kind==='oracle'?'staff':kind==='specter'?'sword':kind==='clockwork'?'spear':'axe';
    g.save();g.translate(30,-19);g.rotate(swing(kind==='executioner'?-2.3:-1.7,1,kind==='executioner'?-1.2:-.6)+angle*.3);drawWeapon(g,weaponId,accent,weaponId==='greatsword'?48:42);g.restore();
  }
  // Variant mark is intentionally composed from armor/trim, not post-processing.
  if(phase){g.save();g.globalAlpha=.55;g.strokeStyle=accent;g.lineWidth=1.4;g.beginPath();g.arc(0,-39,47,Math.PI*1.08,Math.PI*1.92);g.stroke();g.restore();jewel(g,0,-42,4,accent);}
  g.restore();
}
export function drawBossArt(g,id,radius=42,state={},time=0,motion={}){
  const idle=bossRegions.get(id);
  if(!bossAtlas||!idle){drawBossVector(g,id,radius,state,time,motion);return;}
  const reduced=motion.reducedMotion===true,wind=Math.max(0,Math.min(1,motion.anticipation||0));
  const strike=motion.strike==null?0:Math.sin(Math.PI*Math.max(0,Math.min(1,motion.strike))),angle=motion.angle||0;
  const posed=wind>.14&&motion.strike==null,region=posed?bossWindupRegions.get(id)||idle:idle;
  const sheet=posed?bossWindupAtlas:bossAtlas;
  const [kind,,accent]=bossBook[id]||bossBook['iron-warden'];
  const caster=['orb','shaman','lord','queen','sun','oracle','matriarch','emperor'].includes(kind),heavy=['beast','ember','construct','leviathan','colossus'].includes(kind);
  const size=radius/42,height=134*size*(posed&&['knight','ember','ice','executioner','duelist','colossus','emperor'].includes(kind)?1.09:1),width=height*region.w/region.h;
  g.save();oval(g,0,17*size,radius*.88,radius*.23,'#010509a8');
  const bob=reduced?0:Math.sin(time*(motion.moving?9:2.5))*(motion.moving?2:1)*size;
  g.translate((Math.cos(angle)*strike*(heavy?14:9)-wind*3)*size,bob+Math.sin(angle)*strike*5*size-(caster?wind*(reduced?2:7)*size:0));
  g.translate(0,20*size);g.rotate((reduced?.02:.055)*(wind-strike)*Math.sign(Math.sin(angle)||1));
  g.scale(1+wind*(heavy?.045:.015),1-wind*(heavy?.055:.015));
  g.drawImage(sheet,region.x,region.y,region.w,region.h,-width/2,-height,width,height);
  if(caster&&wind>.3){
    g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=wind*.5;g.strokeStyle=accent;g.lineWidth=1.4*size;
    for(const side of [-1,1]){g.beginPath();g.arc(side*width*.23,-height*.55,(4+wind*5)*size,0,TAU);g.stroke();}
    g.restore();
  }
  g.restore();
}
