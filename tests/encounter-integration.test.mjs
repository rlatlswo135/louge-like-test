import test from 'node:test';
import assert from 'node:assert/strict';
import {CLASSES,PLAYER} from '../public/src/content.mjs';
import {createRun,createInput,getStats,step} from '../public/src/game.mjs';
import {ENCOUNTER_ROCKS,ENCOUNTER_SEALS,ENCOUNTER_SIGILS,encounterCovered} from '../public/src/encounters.mjs';

const begin=(stage,classId='warrior',weaponId)=>{
 const s=createRun({stage,classId,weaponId});s.stageTime=10;s.boss.timer=0;step(s,createInput());assert.ok(s.encounter?.active);return s;
};
const controls=(s,target)=>Object.assign(createInput(),{aimX:target.x,aimY:target.y,left:s.player.x>target.x+3,right:s.player.x<target.x-3,up:s.player.y>target.y+3,down:s.player.y<target.y-3});

test('cover has a real 200ms walking escape from all corners and final-storm safe samples for every class',()=>{
 for(const cls of CLASSES)for(const origin of [[16,16],[1264,16],[16,704],[1264,704],[180,360],[1100,360],[640,40],[640,680]]){
  // Find a straight path around rock bodies before running the actual walking input.
  const choices=ENCOUNTER_ROCKS.map(r=>{const d=Math.hypot(r.x-640,r.y-360);return{x:r.x+(r.x-640)/d*85,y:r.y+(r.y-360)/d*85};}).sort((a,b)=>Math.hypot(origin[0]-a.x,origin[1]-a.y)-Math.hypot(origin[0]-b.x,origin[1]-b.y));
  let succeeded=false;
  for(const target of choices){
   const s=createRun({stage:4,classId:cls.id});s.player.x=origin[0];s.player.y=origin[1];s.stageTime=origin[0]===16||origin[0]===1264?10:125;s.boss.timer=0;step(s,createInput());const hp=s.player.hp;
   const route=[{x:target.x,y:origin[1]},target];
   for(let n=0;n<600&&s.encounter?.active;n++){
    if(route.length>1&&Math.hypot(s.player.x-route[0].x,s.player.y-route[0].y)<5)route.shift();
    step(s,n<12?createInput():controls(s,route[0]));
   }
   if(s.player.hp===hp&&s.encounter.complete&&encounterCovered(s.player.x,s.player.y,PLAYER.radius)){succeeded=true;break;}
  }
  assert.ok(succeeded,`${cls.id}/${origin}: walking cover escape`);
 }
});
test('seals break through live locked enemy lasers, not player damage',()=>{
 const s=begin(9);s.player.hp=1000;
 for(const seal of ENCOUNTER_SEALS){
  const dx=seal.x-s.boss.x,dy=seal.y-s.boss.y,d=Math.hypot(dx,dy);
  s.player.x=seal.x+dx/d*80;s.player.y=seal.y+dy/d*80;
  for(let n=0;n<200&&!(s.encounter.sealMask&(1<<ENCOUNTER_SEALS.indexOf(seal)));n++)step(s,createInput());
 }
 assert.equal(s.encounter.complete,true);assert.equal(s.encounter.sealMask,3);
});
test('all twelve loadouts can destroy sigils with their real attack input',()=>{
 for(const cls of CLASSES)for(const w of cls.weapons){
  const s=begin(14,cls.id,w.id);s.player.hp=1000;
  for(const [index,target] of ENCOUNTER_SIGILS.entries()){
   s.player.x=target.x;s.player.y=target.y+65;
   const i=Object.assign(createInput(),{aimX:target.x,aimY:target.y,attack:true});
   for(let n=0;n<180&&!(s.encounter.sigilMask&(1<<index));n++)step(s,i);
   assert.ok(s.encounter.sigilMask&(1<<index),`${w.id}: target ${index}`);
  }
  assert.equal(s.encounter.complete,true);
 }
});
test('final boss can be completed with real dodge timing and returning projectiles for every class',()=>{
 for(const cls of CLASSES){
  const s=begin(19,cls.id);s.player.hp=1000;
  for(let n=0;n<2400&&!s.encounter.complete;n++){
   const i=createInput();i.aimX=s.boss.x;i.aimY=s.boss.y;
   const q=s.projectiles.find(p=>p.owner==='boss'&&p.encounterBit);
   if(!q){i.down=s.player.y<577;i.up=s.player.y>583;}
   if(q&&s.player.dodgeCooldown<=0){
    const d=Math.hypot(q.x-s.player.x,q.y-s.player.y);
    // Dodge into the incoming orb; blink must land on the orb during true invulnerability.
    if(d<(cls.dodge.kind==='blink'?cls.dodge.distance+28:60)){
      i.dodge=true;i.up=q.y<s.player.y;i.down=q.y>s.player.y;i.left=q.x<s.player.x-5;i.right=q.x>s.player.x+5;
    }
   }
   step(s,i);
  }
  assert.equal(s.encounter.complete,true,cls.id);assert.equal(s.encounter.reflectMask,7);assert.ok(s.events.some(e=>e.type==='reflect'));
 }
});
test('unresolved objectives stop burst phase skips; phase change and death release objectives and their attacks',()=>{
 const s=begin(9,'gunslinger');s.projectiles.push({owner:'player',x:s.boss.x,y:s.boss.y,vx:0,vy:0,radius:10,life:1,damage:1e9});step(s,createInput());
 assert.equal(s.boss.phase,1);assert.ok(s.boss.hp>s.boss.maxHp*.5);
 s.encounter.complete=true;s.encounter.active=false;s.boss.hp=s.boss.maxHp*.49;step(s,createInput());assert.equal(s.boss.phase,2);assert.equal(s.encounter,null);assert.equal(s.hazards.length,0);
 s.stageTime=20;step(s,createInput());assert.ok(s.encounter);s.player.hp=0;step(s,createInput());assert.equal(s.status,'dead');assert.equal(s.encounter,null);
});
