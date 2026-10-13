import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

// Decode the actual supplied RGBA atlas so an empty/cropped pose cannot pass via a mock image.
async function pixels(file='hero-atlas-v4.png'){
  const b=await readFile(new URL('../public/assets/art/'+file,import.meta.url));
  const width=b.readUInt32BE(16),height=b.readUInt32BE(20),chunks=[];
  assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);
  for(let p=8;p<b.length;){const size=b.readUInt32BE(p);if(b.toString('ascii',p+4,p+8)==='IDAT')chunks.push(b.subarray(p+8,p+8+size));p+=size+12;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,data=new Uint8Array(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const offset=y*(stride+1),filter=raw[offset];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const at=y*stride+x,a=x>=4?data[at-4]:0,b=y?data[at-stride]:0,c=y&&x>=4?data[at-stride-4]:0;
      data[at]=(raw[offset+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  return {width,height,data};
}

test('five painted heroes have real idle, opposite steps, charge, attack and dodge frames with grounded feet',async()=>{
  const atlas=await pixels(),art=await import('../public/src/art.mjs?real-hero-atlas');
  let decodes=0,reads=0;
  const win={Image:class{width=atlas.width;height=atlas.height;async decode(){decodes++;}},document:{createElement:()=>({getContext:()=>({drawImage(){},getImageData(){reads++;return atlas;}})})}};
  await art.prepareHeroArt(win);await art.prepareHeroArt(win);assert.equal(decodes,1);assert.equal(reads,1);
  const calls=[],g=new Proxy({drawImage(image,...args){calls.push(args);}}, {get:(o,k)=>o[k]??(k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{})});
  const poses=[{}, {walk:true}, {walk:true,time:2/9}, {chargeRatio:.5}, {attackProgress:.4}, {dodgeTime:.1,dodgeKind:'dash'}];
  const allCrops=[];
  for(const classId of ['warrior','archer','mage','gunslinger','fighter']){
    const cropKeys=[];
    for(const pose of poses){
      calls.length=0;const before=JSON.stringify(pose);
      art.drawHero(g,{classId},1,pose.time||0,pose);
      assert.equal(JSON.stringify(pose),before);assert.equal(calls.length,1);
      const [x,y,w,h,dx,dy,dw,dh]=calls[0];
      assert.ok(w>50&&h>70,`${classId} has a complete pose`);
      assert.ok(x>=0&&y>=0&&x+w<=atlas.width&&y+h<=atlas.height);
      assert.equal(dy+dh,0,'pose feet remain at the world anchor');
      assert.ok([x,y,w,h,dx,dy,dw,dh].every(Number.isFinite));
      cropKeys.push([x,y,w,h].join());
    }
    assert.equal(new Set(cropKeys).size,poses.length,`${classId} changes the sprite, not just its scale`);
    calls.length=0;art.drawHero(g,{classId},1,2/9,{walk:true,reducedMotion:true});
    assert.equal(calls[0].slice(0,4).join(),cropKeys[0],'reduced motion keeps the idle walk pose');
    allCrops.push(...cropKeys);
  }
  assert.equal(new Set(allCrops).size,30);
  calls.length=0;art.drawHero(g,{classId:'fighter',weaponId:'kick'},1,0,{attackProgress:.4});
  assert.ok(calls[0][0]>atlas.width*.85,'kick uses the extended-leg pose');
  assert.equal(reads,1,'combat rendering never reads atlas pixels again');
});

test('painted base and transformed weapons use complete, distinct crops loaded once',async()=>{
  const atlas=await pixels('weapon-atlas-v4.png'),art=await import('../public/src/art.mjs?real-weapon-atlas');
  let reads=0;
  const win={Image:class{width=atlas.width;height=atlas.height;async decode(){}},document:{createElement:()=>({getContext:()=>({drawImage(){},getImageData(){reads++;return atlas;}})})}};
  await art.prepareWeaponArt(win);await art.prepareWeaponArt(win);
  const crops=[],g=new Proxy({drawImage(image,...args){crops.push(args);}}, {get:(o,k)=>o[k]??(['createLinearGradient','createRadialGradient'].includes(k)?()=>({addColorStop(){}}):()=>{})});
  for(const weaponId of ['sword','spear','axe','bow','crossbow','fire','water','lightning','revolver','sniper','greatsword','dagger','boomerang','battle-staff','shotgun','cannon','machinegun','dual-pistols','flamethrower']){
    art.drawHero(g,{classId:'warrior',weaponId,color:'#abcdef'},1,0,{});
  }
  assert.equal(crops.length,19);assert.equal(new Set(crops.map(c=>c.slice(0,4).join())).size,19);
  assert.ok(crops.every(([x,y,w,h])=>w>25&&h>20&&x>=0&&y>=0&&x+w<=atlas.width&&y+h<=atlas.height));
  assert.ok(crops.flat().every(Number.isFinite));assert.equal(reads,1);
});
