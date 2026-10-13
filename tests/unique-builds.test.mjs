import test from 'node:test';
import assert from 'node:assert/strict';
import {CLASSES,CARDS} from '../public/src/content.mjs';
import {createRun,getStats,step,createInput} from '../public/src/game.mjs';
import {CLASS_UNIQUES} from '../public/src/builds.mjs';

test('25 class uniques cataloged once; class hp and mitigation fixed',()=>{
 assert.equal(Object.values(CLASS_UNIQUES).flat().length,25);
 for(const c of CLASSES){assert.ok(c.maxHp>0);assert.ok(c.damageReduction>=0);for(const id of CLASS_UNIQUES[c.id]){const card=CARDS.find(x=>x.id===id);assert.equal(card.classId,c.id);assert.equal(card.maxStacks,1);}}
});
test('all 25 solos and 50 order-independent pairs derive canonical effective profiles',()=>{
 for(const [classId,ids] of Object.entries(CLASS_UNIQUES)){
  for(const id of ids){const s=createRun({classId});s.cards[id]=1;const v=getStats(s);assert.deepEqual(v.uniqueIds,[id]);assert.ok(v.weapon.damage>0);assert.ok(v.buildDescription.length>5);}
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=createRun({classId}),b=createRun({classId});a.cards[ids[i]]=a.cards[ids[j]]=1;b.cards[ids[j]]=b.cards[ids[i]]=1;
   const x=getStats(a),y=getStats(b);assert.deepEqual(x.uniqueIds,y.uniqueIds);assert.equal(x.buildName,y.buildName);assert.equal(x.weapon.id,y.weapon.id);assert.ok(x.fusion);assert.deepEqual(x,y);
  }
 }
});
test('class reduction applied to enemy hit and basic weapon still damages boss',()=>{
 const s=createRun({classId:'warrior'});s.hazards.push({phase:'active',shape:'circle',x:s.player.x,y:s.player.y,radius:1000,t:0,windup:0,active:1,damage:20,hitDone:false});step(s,createInput());assert.equal(s.player.hp,120-17.6); // 12% reduction
 const before=s.boss.hp;s.player.x=s.boss.x;s.player.y=s.boss.y+58;const i=createInput();i.attack=true;for(let n=0;n<30;n++)step(s,i);assert.ok(s.boss.hp<before);
});
