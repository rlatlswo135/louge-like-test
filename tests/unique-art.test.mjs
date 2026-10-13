import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHero } from '../public/src/art.mjs';
import { createInput, createRun } from '../public/src/game.mjs';
import { createView, renderFrame, resizeView } from '../public/src/render.mjs';

function artSignature(weaponId, motion={},time=0) {
  const calls=[],gradient={addColorStop:(...args)=>calls.push(['stop',...args])};
  const g=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'? (...args)=>{calls.push([key,...args]);return gradient}:(...args)=>calls.push([key,...args]),set:(_,key,value)=>{calls.push(['set',key,value]);return true;}});
  drawHero(g,{classId:'gunslinger',weaponId,color:'#ed9560'},1,time,motion);
  return JSON.stringify(calls);
}

test('new original weapon silhouettes stay visually distinct',()=>{
  const ids=['dagger','battle-staff','shotgun','cannon','machinegun','dual-pistols','flamethrower'];
  assert.equal(new Set(ids.map(id=>artSignature(id))).size,ids.length);
  assert.notEqual(artSignature('cannon'),artSignature('cannon',{muzzle:true}));
});

test('timing, combo and heat cues remain distinct and motion-independent',()=>{
  const stand=artSignature('sword');
  assert.notEqual(artSignature('sword',{uniqueId:'one-cut',timingMeter:true,timingPhase:.5}),stand);
  assert.notEqual(artSignature('sword',{comboStep:3,attackProgress:.7}),artSignature('sword',{comboStep:1,attackProgress:.7}));
  assert.notEqual(artSignature('sword',{heat:.7}),stand);
  assert.equal(artSignature('sword',{walk:true,reducedMotion:true},0),artSignature('sword',{walk:true,reducedMotion:true},8));
});

test('shared beam, meteor and echo geometry renders read-only with reduced-motion cues',()=>{
  const ctx=new Proxy({}, {get:(target,key)=>{
    if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
    return target[key]??(target[key]=()=>{});
  }});
  const view=createView({width:0,height:0,getContext:()=>ctx});resizeView(view,1280,720,1);
  const run=createRun();run.attacks=[
    {kind:'beam',x:200,y:200,angle:.3,length:100,width:9,t:.2,windup:.3,active:.2,color:'#9de6e2'},
    {kind:'meteor',x:300,y:200,radius:24,t:.1,windup:.4,active:.1,color:'#f3a66f'},
    {kind:'echo',x:400,y:200,angle:1,length:35,t:.3,windup:0,active:.2,color:'#c9adf4'},
  ];
  const before=JSON.stringify(run);
  assert.doesNotThrow(()=>renderFrame(view,run,.2));
  view.reducedMotion=true;assert.doesNotThrow(()=>renderFrame(view,run,.2));
  assert.equal(JSON.stringify(run),before);
  assert.deepEqual(createInput().attackPressed,false);
});

test('player beams and meteors render at the same world origin and direction as their collision geometry',async()=>{
 const {drawUniqueAttacks}=await import('../public/src/render.mjs');
 let m=[1,0,0,1,0,0];const stack=[],rects=[],arcs=[];
 const point=(x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
 const methods={save(){stack.push([...m]);},restore(){m=stack.pop();},translate(x,y){const p=point(x,y);m[4]=p[0];m[5]=p[1];},rotate(a){const [aa,b,c,d]=m,co=Math.cos(a),si=Math.sin(a);m[0]=aa*co+c*si;m[1]=b*co+d*si;m[2]=-aa*si+c*co;m[3]=-b*si+d*co;},rect(x,y,w,h){rects.push([point(x,y),point(x+w,y+h)]);},arc(x,y,r){arcs.push([...point(x,y),r]);}};
 const ctx=new Proxy(methods,{get:(t,k)=>t[k]||(()=>{})});
 drawUniqueAttacks(ctx,{attacks:[{kind:'beam',shape:'lane',x:300,y:240,angle:Math.PI/2,length:100,width:20,t:.05,windup:0,active:.1},{kind:'meteor',shape:'circle',x:800,y:400,radius:70,t:.3,windup:.6,active:.2}]},true);
 assert.deepEqual(rects[0].map(p=>p.map(Math.round)),[[310,240],[290,340]]);
 assert.ok(arcs.some(([x,y,r])=>x===800&&y===400&&r===70));assert.deepEqual(m,[1,0,0,1,0,0]);
});
