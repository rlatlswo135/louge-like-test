import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHero, drawBossArt } from '../public/src/art.mjs';
import { drawPortrait } from '../public/src/render.mjs';

const gradient={addColorStop(){}};
function spy(){
  const calls=[];
  const g=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'? (...a)=>{calls.push([key,...a]);return gradient}:key==='createRadialGradient'? (...a)=>{calls.push([key,...a]);return gradient}:(...a)=>calls.push([key,...a]),set:(_,key,value)=>{calls.push(['set',key,value]);return true;}});
  return {g,calls};
}
const signature=(cfg,motion={},time=0)=>{const {g,calls}=spy();drawHero(g,cfg,1,time,motion);return JSON.stringify(calls);};

test('adult layered hero art differs by class and animates combat poses',()=>{
  const classes=['warrior','archer','mage','gunslinger','fighter'];
  assert.equal(new Set(classes.map(classId=>signature({classId,weaponId:'sword'}))).size,classes.length);
  for(const [classId,weaponId,motion] of [
    ['warrior','sword',{walk:true}],['warrior','sword',{attackProgress:.8}],['mage','fire',{charge:.8}],
    ['archer','bow',{charge:.8}],['gunslinger','revolver',{reloadTime:.4}],['gunslinger','revolver',{muzzle:true}],
    ['fighter','punch',{dodgeKind:'dash',dodgeTime:.1}],['mage','staff',{dodgeKind:'blink',dodgeTime:.1}],
    ['archer','bow',{dodgeKind:'roll',dodgeTime:.2,dodgeProgress:.5}],['warrior','sword',{hurtFlash:.1}],
  ])assert.notEqual(signature({classId,weaponId}),signature({classId,weaponId},motion,1),`${classId} ${JSON.stringify(motion)}`);
  assert.notEqual(signature({classId:'warrior',weaponId:'sword'},{walk:true},.1),signature({classId:'warrior',weaponId:'sword'},{walk:true},.3));
  const {g,calls}=spy();drawHero(g,{classId:'warrior',weaponId:'sword'});
  assert.ok(calls.filter(c=>c[0]==='createLinearGradient').length>=8);
  assert.ok(calls.filter(c=>c[0]==='lineTo').length>=80);
});

test('weapon silhouettes and timed roll poses stay distinct',()=>{
  const weapons=['bow','crossbow','revolver','sniper','sword','axe','spear','staff','punch','kick'];
  assert.equal(new Set(weapons.map(weaponId=>signature({classId:'archer',weaponId}))).size,weapons.length);
  assert.notEqual(signature({classId:'archer',weaponId:'bow'},{dodgeKind:'roll',dodgeTime:.4,dodgeProgress:.1}),signature({classId:'archer',weaponId:'bow'},{dodgeKind:'roll',dodgeTime:.2,dodgeProgress:.7}));
  assert.notEqual(signature({classId:'fighter',weaponId:'punch'},{attackProgress:.8}),signature({classId:'fighter',weaponId:'kick'},{attackProgress:.8}));
});

test('hip lames overlap continuous thighs; kick pivots from hip while idle leg stays grounded',()=>{
  const {g,calls}=spy();drawHero(g,{classId:'fighter',weaponId:'kick'},1,0,{attackProgress:.8});
  const vertices=[];let path=[];
  for(const [name,...args] of calls){if(name==='beginPath'){if(path.length)vertices.push(path);path=[];}if(name==='moveTo'||name==='lineTo')path.push(args);}
  vertices.push(path);
  const hasBounds=(minY,maxY)=>vertices.some(points=>points.length>=4&&Math.min(...points.map(p=>p[1]))<=minY&&Math.max(...points.map(p=>p[1]))>=maxY);
  assert.ok(hasBounds(-39,-21),'hip tassets reach over the thigh tops');
  assert.ok(hasBounds(-31,0),'thighs and shins form continuous full-height legs');
  assert.ok(calls.some(c=>c[0]==='translate'&&c[1]===7&&c[2]===-30),'kick leg articulates at hip');
  assert.equal(calls.some(c=>c[0]==='translate'&&c[1]===17&&c[2]===-48),false,'kick has no shoulder-mounted glove');
});

test('roll pivots at torso and weapon rotation cancels body roll to preserve world aim',()=>{
  const {g,calls}=spy();drawHero(g,{classId:'gunslinger',weaponId:'revolver'},1,0,{weaponAngle:.7,dodgeTime:.2,dodgeKind:'roll',dodgeProgress:.25,dodgeDirection:1});
  assert.ok(calls.some(c=>c[0]==='translate'&&c[1]===0&&c[2]===-20));
  const rotations=calls.filter(c=>c[0]==='rotate').map(c=>c[1]);
  assert.ok(Math.abs(rotations[0]-Math.PI/2)<1e-9);
  assert.ok(Math.abs(rotations.at(-1)-(.7-Math.PI/2))<1e-9);
  const reduced=signature({classId:'archer',weaponId:'bow'},{dodgeKind:'roll',dodgeTime:.2,dodgeProgress:.1,reducedMotion:true});
  assert.equal(reduced,signature({classId:'archer',weaponId:'bow'},{dodgeKind:'roll',dodgeTime:.2,dodgeProgress:.9,reducedMotion:true}));
});

test('phase-three boss keeps phase-two enhanced art',()=>{
  const capture=phase=>{const {g,calls}=spy();drawBossArt(g,'rift-lord',42,{phase},0);return JSON.stringify(calls);};
  assert.deepEqual(capture(3),capture(2));
});

test('hero drawing leaves animation state unchanged and reduced motion freezes walk',()=>{
  const motion=Object.freeze({walk:true,weaponAngle:.2,charge:.5});
  assert.ok(signature({classId:'mage',weaponId:'staff'},motion,2).length>0);
  assert.equal(signature({classId:'mage',weaponId:'staff'},{...motion,reducedMotion:true},2),signature({classId:'mage',weaponId:'staff'},{...motion,reducedMotion:true},8));
});

test('class portraits use direct vector art without low-resolution image blits',()=>{
  for(const classId of ['warrior','archer','mage','gunslinger','fighter']){
    const {g,calls}=spy();drawPortrait({width:128,height:112,getContext:()=>g},{classId,weaponId:'sword'});
    assert.ok(calls.length>100,classId);assert.ok(calls.some(c=>c[0]==='createLinearGradient'),classId);
    assert.equal(calls.some(c=>c[0]==='drawImage'),false,classId);
  }
});
