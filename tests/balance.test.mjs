import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../public/src/content.mjs';
import { createRun,createInput,getStats,step } from '../public/src/game.mjs';

// Sustained stationary-target check includes charge, travel, reload and overheat.
// It does not stand in for human clear rates or uptime against moving bosses.
function sustained(classId,weaponId,cards=[],{behind=false,close=false}={}){
  const r=createRun({classId,weaponId,seed:41});r.cards=Object.fromEntries(cards.map(id=>[id,1]));
  r.boss.def={...r.boss.def,speed:0,pursuit:null,raid:null,signature:null,phaseThresholds:[]};r.boss.timer=1e6;
  r.boss.state='recover';r.boss.faceX=1;r.boss.faceY=0;
  r.boss.hp=r.boss.maxHp=1e8;r.boss.x=640;r.boss.y=360;
  const stats=getStats(r);r.player.y=360;r.player.x=640+(behind?-1:1)*(close?65:Math.max(65,stats.weapon.distance?stats.reach*.8:Math.min(stats.reach*.72,240)));
  for(let tick=0;tick<2400;tick++){step(r,{...createInput(),aimX:640,aimY:360,attack:true});r.events.length=0;}
  return (1e8-r.boss.hp)/40;
}
test('base weapons retain a viable sustained-damage floor without a twofold class gap',()=>{
  const values=[];
  for(const cls of CLASSES)for(const w of cls.weapons){
    const dps=sustained(cls.id,w.id);values.push(dps);
    assert.ok(dps>=75&&dps<130,`${cls.id}/${w.id}: ${dps}`);
  }
  assert.ok(Math.max(...values)/Math.min(...values)<1.6);
});
test('fixed-charge fighter conversion cannot turn a slow kick into disproportionate DPS',()=>{
  const punch=sustained('fighter','punch',['charged-fist']),kick=sustained('fighter','kick',['charged-fist']);
  assert.ok(kick<140&&punch<140);assert.ok(Math.max(kick,punch)/Math.min(kick,punch)<1.15);
});
test('long-range triple arrows converge and short-range flame builds pay back their risk',()=>{
  for(const w of ['bow','crossbow'])assert.ok(sustained('archer',w,['longbow','multishot'])>100);
  for(const build of [['flamethrower'],['flamethrower','shotgun'],['flamethrower','dual-pistols']])assert.ok(sustained('gunslinger','revolver',build)>=70,build.join('+'));
});
test('outboxer and its fusions trade mobility for a separate counter',()=>{
  const r=createRun({classId:'fighter'});r.cards.outboxer=1;
  assert.equal(getStats(r).counter.cooldown,2.8);
  assert.ok(Math.abs(getStats(r).dodgeCooldown-.95*1.45)<1e-9);
  assert.equal(getStats(r).dodge.chainWindow,0);
  r.cards['charged-fist']=1;r.cards.dodge=1;
  assert.ok(Math.abs(getStats(r).dodgeCooldown-.95*1.45*.85)<1e-9);
  assert.equal(getStats(r).dodge.distance,68);
});
test('shadow sniper pays for its double condition and close shotgun fusion rewards its risk',()=>{
  for(const weapon of ['bow','crossbow']){
    const cards=['assassin','longbow'];
    const optimal=sustained('archer',weapon,cards,{behind:true});
    assert.ok(optimal>120&&optimal<150,`${weapon}: ${optimal}`);
    assert.ok(sustained('archer',weapon,cards)<optimal*.6,'front-facing shots pay the advertised penalty');
    assert.ok(sustained('archer',weapon,cards,{behind:true,close:true})<optimal*.6,'close shots lose the distance bonus');
  }
  for(const weapon of ['revolver','sniper'])assert.ok(sustained('gunslinger',weapon,['shotgun','dual-pistols'])>=80);
});
