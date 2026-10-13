import test from 'node:test';
import assert from 'node:assert/strict';
import {CLASSES,CARDS,LIMITS} from '../public/src/content.mjs';
import {CLASS_UNIQUES,FUSIONS} from '../public/src/builds.mjs';
import {createRun,createInput,getStats,step,chooseCard,previewReward,makeOffers,cancelPlayerActions} from '../public/src/game.mjs';

const fixture=(classId,ids=[],weaponId)=>{
 const s=createRun({classId,weaponId,seed:51});for(const id of ids)s.cards[id]=1;
 s.boss.timer=1e8;s.boss.hp=s.boss.maxHp=1e7;s.player.x=640;s.player.y=260;
 return s;
};
function fight(s,frames=360){
 const stats=getStats(s);const i=createInput();i.aimX=s.boss.x;i.aimY=s.boss.y;
 for(let n=0;n<frames;n++){
  const tap=stats.manualCombo||stats.timingMeter;
  i.attack=tap?n%Math.ceil((stats.interval+.04)*60)!==1:true;
  i.attackPressed=tap&&n%Math.ceil((stats.interval+.04)*60)===0;
  step(s,i);
  assert.ok(Number.isFinite(s.player.x)&&Number.isFinite(s.boss.hp));
  assert.ok(s.projectiles.length<=LIMITS.projectiles&&s.attacks.length<=LIMITS.playerAttacks);
 }
 return s;
}
test('all 25 solos and 50 explicit fusions execute, match reversed pickup order, and stay bounded on every base weapon',()=>{
 assert.equal(FUSIONS.length,50);assert.equal(new Set(FUSIONS.map(f=>f.key)).size,50);
 let solos=0,pairs=0;
 for(const cls of CLASSES){
  for(const ids of [...CLASS_UNIQUES[cls.id].map(id=>[id]),...FUSIONS.filter(f=>CLASS_UNIQUES[cls.id].includes(f.ids[0])).map(f=>f.ids)]){
   ids.length===1?solos++:pairs++;
   for(const w of cls.weapons){
    const a=fixture(cls.id,ids,w.id),b=fixture(cls.id,[...ids].reverse(),w.id);
    assert.deepEqual(getStats(a),getStats(b));fight(a);fight(b);
    assert.ok(a.boss.hp<a.boss.maxHp,`${cls.id}/${w.id}/${ids}: real damage`);
    assert.equal(a.boss.hp,b.boss.hp);assert.deepEqual(a.events,b.events);
    assert.ok(getStats(a).dodge.distance>=cls.dodge.distance*.65,`${ids}: preserve dodge travel`);
   }
  }
 }
 assert.deepEqual([solos,pairs],[25,50]);
});
test('one primary action counts once across pellets and cannot recursively trigger finishers',()=>{
 const s=fixture('gunslinger',['shotgun']);s.cards.rapid=3;fight(s,1);
 for(let n=0;n<30;n++)step(s,createInput());
 assert.equal(s.player.hitCount,1);assert.equal(s.player.primaryHits,1);
 const f=fixture('fighter',['final-attack','afterimage']);fight(f,180);
 const swings=f.events.filter(e=>e.type==='swing').length;
 assert.ok(f.player.hitCount<=swings);assert.equal(f.events.filter(e=>e.type==='finisher').length,Math.floor(f.player.primaryHits/3));
});
test('shotgun and cannon create a real shell then five finite, non-recursive fragments',()=>{
 const s=fixture('gunslinger',['shotgun','cannon']);s.player.y=340;fight(s,1);
 const shell=s.projectiles[0];assert.equal(shell.kind,'fragment-shell');
 for(let n=0;n<12;n++)step(s,createInput());
 assert.equal(s.events.filter(e=>e.type==='fragmentBurst').length,1);
 assert.equal(s.events.find(e=>e.type==='fragmentBurst').count,5);
 assert.equal(s.player.hitCount,1);
 for(let n=0;n<80;n++)step(s,createInput());assert.equal(s.projectiles.length,0);
});
test('boomerang hits outgoing and returning only once each; rear attacks use actual boss facing',()=>{
 const s=fixture('warrior',['throw-master']);fight(s,1);for(let n=0;n<100;n++)step(s,createInput());
 assert.equal(s.events.filter(e=>e.type==='bossHit').length,2);assert.equal(s.player.hitCount,1);
 const front=fixture('archer',['assassin']),back=fixture('archer',['assassin']);back.boss.faceY=-1;
 fight(front,1);fight(back,1);assert.ok(front.boss.maxHp-front.boss.hp<back.boss.maxHp-back.boss.hp);
});
test('water archmage consumes exactly three timed primary stacks; echoes do not add stacks',()=>{
 const s=fixture('mage',['archmage','illusionist'],'water');
 const i=createInput();i.attack=true;i.aimX=640;i.aimY=200;
 for(let n=0;n<85;n++)step(s,i);
 assert.equal(s.events.filter(e=>e.type==='waterBurst').length,1);assert.equal(s.boss.wetStacks,0);
 assert.ok(s.player.hitCount<=3);assert.ok(s.player.shield<=16);
 for(let n=0;n<300;n++)step(s,createInput());assert.equal(s.boss.wetStacks,0);
});
test('heat builds on missed shots; cancelling clears delayed damage and charged input',()=>{
 const s=fixture('gunslinger',['machinegun']);s.player.x=100;s.player.y=650;
 const i=Object.assign(createInput(),{attack:true,aimX:100,aimY:700});
 for(let n=0;n<150;n++)step(s,i);
 assert.ok(s.events.some(e=>e.type==='overheat'));assert.equal(s.player.hitCount,0);
 const e=fixture('mage',['illusionist','meteor-mage']);fight(e,1);assert.ok(e.attacks.length>0);
 cancelPlayerActions(e);const hp=e.boss.hp;for(let n=0;n<90;n++)step(e,createInput());assert.equal(e.boss.hp,hp);
});
test('special reward guarantees, third unique rejection, preview isolation, and berserk HP/healing are consistent',()=>{
 for(const cls of CLASSES){const s=createRun({classId:cls.id,stage:4,seed:88});s.status='reward';s.offers=makeOffers(s);
  assert.equal(s.offers.filter(c=>c.rarity==='unique').length,1);
  s.cards[CLASS_UNIQUES[cls.id][0]]=s.cards[CLASS_UNIQUES[cls.id][1]]=1;s.offers=makeOffers(s);
  assert.equal(s.offers.filter(c=>c.rarity==='unique').length,0);assert.equal(s.offers.filter(c=>c.rarity==='berserk').length,1);
  s.offers=[CARDS.find(c=>c.id===CLASS_UNIQUES[cls.id][2])];assert.equal(chooseCard(s,s.offers[0].id),false);
 }
 const s=createRun();s.player.hp=50;s.status='reward';s.offers=[CARDS.find(c=>c.id==='glass-heart')];
 const before=JSON.stringify(s),preview=previewReward(s,'glass-heart');assert.equal(JSON.stringify(s),before);assert.equal(preview.player.maxHp,96);
 chooseCard(s,'glass-heart');s.status='reward';s.offers=[CARDS.find(c=>c.id==='vitality')];chooseCard(s,'vitality');assert.equal(s.player.maxHp,getStats(s).maxHp);assert.equal(s.player.maxHp,112);
 s.cards['blood-price']=1;s.player.hp=40;s.boss.hp=0;step(s,createInput());assert.equal(s.player.hp,45.6);
});
test('Q counter requires an incoming hit and never grants blanket immunity after success',()=>{
 const s=fixture('warrior',['iron-counter']);const i=Object.assign(createInput(),{counter:true,aimX:640,aimY:200});
 s.hazards=[{shape:'circle',x:640,y:180,radius:200,t:0,windup:0,active:.05,phase:'active',damage:20}];
 step(s,i);assert.ok(s.player.counterTime>0);const hp=s.player.hp;
 for(let n=0;n<30;n++)step(s,createInput());
 s.hazards=[{shape:'circle',x:s.player.x,y:s.player.y,radius:100,t:0,windup:0,active:.05,phase:'active',damage:20}];step(s,createInput());assert.ok(s.player.hp<hp);
});
