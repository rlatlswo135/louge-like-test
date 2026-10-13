import test from 'node:test';
import assert from 'node:assert/strict';
import { paintArena } from '../public/src/arena-art.mjs';

function draw(accent,texture) {
  const calls=[];
  const g=new Proxy({}, {
    get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'
      ? (...args)=>{calls.push([key,...args]);return {addColorStop:(...args)=>calls.push(['stop',...args])};}
      : (...args)=>calls.push([key,...args]),
    set:(_,key,value)=>{calls.push([key,typeof value==='object'?'[gradient]':value]);return true;}
  });
  paintArena(g,accent,texture);return calls;
}
test('sanctuary material is deterministic, high-resolution and finite; no gameplay RNG',()=>{
  const a=draw('#a28b69');assert.deepEqual(draw('#a28b69'),a);
  assert.notDeepEqual(draw('#a27790'),a);
  assert.ok(a.flat(Infinity).every(x=>typeof x!=='number'||Number.isFinite(x)));
  assert.ok(a.some(([name,...v])=>name==='fillRect'&&v.join(',')==='0,0,1280,720'));
  assert.ok(!a.some(([name,x,y])=>name==='scale'&&x===.25&&y===.25),'no low-resolution enlargement');
  assert.ok(a.filter(([name])=>name==='createLinearGradient').length>150,'stone planes receive real material shading');
});
test('decoded scanned material replaces synthetic tile fill at native resolution',()=>{
  const image={width:1024,height:1024},calls=draw('#a28b69',image);
  assert.equal(calls.filter(([name])=>name==='drawImage').length,6);
  assert.ok(calls.some(([name,value])=>name==='filter'&&value==='saturate(.35)'));
  assert.ok(!calls.some(([name,x,y,x2,y2])=>name==='createLinearGradient'&&x2-x===82&&y2-y===64),'synthetic floor blocks are not painted over texture');
});
test('arena preparation waits for decode, reports failures and permits retry',async()=>{
  const {prepareArena}=await import('../public/src/arena-art.mjs?prepare-test');
  let resolves=[],loads=0,fail=true;
  const win={Image:class {constructor(){loads++;}decode(){return fail?Promise.reject(Error('bad image')):new Promise(r=>resolves.push(r));}}};
  await assert.rejects(prepareArena(win),/bad image/);
  fail=false;let ready=false;const pending=prepareArena(win).then(()=>ready=true);
  await Promise.resolve();assert.equal(ready,false);resolves[0]();await Promise.resolve();assert.equal(ready,false);
  resolves[1]();await pending;
  await prepareArena(win);assert.equal(loads,4);
});

test('painted boss atlas is prepared once and each boss uses a different complete crop',async()=>{
  const {prepareBossArt,drawBossArt}=await import('../public/src/art.mjs?atlas-test');
  const {CAMPAIGN}=await import('../public/src/content.mjs');
  let loads=0;
  const ctx={drawImage(){},getImageData(){return {data:new Uint8Array(1536*1024*4)};}};
  const win={Image:class{width=1536;height=1024;constructor(){loads++;}async decode(){}},document:{createElement:()=>({getContext:()=>ctx})}};
  await prepareBossArt(win);await prepareBossArt(win);assert.equal(loads,2);
  const crops=[],transforms=[],sheets=[];
  const g=new Proxy({drawImage(image,...args){crops.push(args);sheets.push(image.src);},translate(...args){transforms.push(args);}}, {get:(o,k)=>o[k]??(()=>{})});
  for(const id of CAMPAIGN.stages)drawBossArt(g,id,42,{},0,{anticipation:.5});
  assert.equal(crops.length,20);assert.equal(new Set(crops.map(c=>c.slice(0,4).join())).size,20);
  assert.ok(crops.flat().every(Number.isFinite));
  assert.ok(sheets.every(src=>src.endsWith('/boss-windup-v4.png')),'each boss uses its actual prepared-attack pose');
  const before=JSON.stringify(transforms);transforms.length=0;
  sheets.length=0;
  for(const id of CAMPAIGN.stages)drawBossArt(g,id,42,{},1,{strike:.5,angle:1});
  assert.ok(sheets.every(src=>src.endsWith('/boss-atlas-v3.png')),'the attack releases the prepared pose');
  assert.notEqual(JSON.stringify(transforms),before,'attack poses move the painted sprite');
});
