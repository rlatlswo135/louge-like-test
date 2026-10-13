import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../public/src/game.mjs';
import { BOSSES, PATTERNS, CAMPAIGN, CLASSES, STEP, PLAYER, ARENA } from '../public/src/content.mjs';

function reward(seed=12,stage=0){
  const r=game.createRun({seed,stage});r.player.hp=50;r.boss.hp=0;game.step(r,game.createInput());return r;
}
const snapshot=r=>JSON.stringify(r);

test('reward previews are detached, repeatable and never consume the offered choice or RNG',()=>{
  assert.equal(typeof game.previewReward,'function');
  const r=reward(),control=reward(),card=r.offers[0].id,before=snapshot(r);
  for(let i=0;i<4;i++){
    const preview=game.previewReward(r,card);
    assert.equal(preview.stage,r.stage+1);assert.equal(preview.status,'playing');
    assert.equal(preview.cards[card],1);preview.player.hp=1;preview.cards[card]=999;
    assert.equal(snapshot(r),before);
  }
  assert.equal(game.previewReward(r,'not-offered'),null);
  assert.equal(game.chooseCard(r,card),true);assert.equal(game.chooseCard(control,card),true);
  assert.equal(game.chooseCard(r,card),false,'commit cannot happen twice');
  r.boss.hp=control.boss.hp=0;game.step(r,game.createInput());game.step(control,game.createInput());
  assert.deepEqual(r.offers,control.offers,'preview must not reroll or advance reward RNG');
  assert.deepEqual(r.player,control.player);
});

test('every clear restores ten percent max HP once, stacks with fortune and never revives a death',()=>{
  const r=game.createRun();r.player.maxHp=140;r.player.hp=30;r.cards.fortune=1;r.boss.hp=0;
  game.step(r,game.createInput());assert.equal(r.player.hp,56);
  for(let i=0;i<50;i++)game.step(r,game.createInput());assert.equal(r.player.hp,56);
  const full=game.createRun();full.player.hp=119;full.boss.hp=0;game.step(full,game.createInput());assert.equal(full.player.hp,120);
  const final=game.createRun({stage:CAMPAIGN.stages.length-1});final.player.hp=50;final.boss.hp=0;
  game.step(final,game.createInput());assert.equal(final.status,'won');assert.equal(final.player.hp,62);
  const dead=game.createRun();dead.player.hp=dead.boss.hp=0;game.step(dead,game.createInput());
  assert.equal(dead.status,'dead');assert.equal(dead.player.hp,0);
});

function quiet(classId){
  const cls=CLASSES.find(c=>c.id===classId),r=game.createRun({classId,weaponId:cls.weapons[0].id});
  r.player.x=400;r.player.y=360;r.boss.x=80;r.boss.y=80;r.boss.timer=1e6;
  r.boss.def={...r.boss.def,pursuit:null,raid:null,raids:[],patterns:[]};return r;
}
function input(extra={}){return {...game.createInput(),aimX:1200,aimY:360,...extra};}

test('class dodges have distinct true travel distances; mage blinks once and all remain in arena',()=>{
  for(const [id,distance] of [['warrior',150],['fighter',85],['mage',185],['gunslinger',145],['archer',220]]){
    const r=quiet(id);game.step(r,input({right:true,dodge:true}));
    if(id==='mage')assert.equal(r.player.x,400+distance,'teleport completes on first frame');
    else assert.ok(r.player.x<400+distance);
    for(let i=0;i<60&&r.player.dodgeTime>0;i++)game.step(r,input({right:true}));
    assert.ok(Math.abs(r.player.x-400-distance)<1e-6,`${id}: ${r.player.x-400}`);
    r.player.x=ARENA.width-PLAYER.radius-2;r.player.dodgeCooldown=0;r.player.dodgeChainTime=0;
    game.step(r,input({right:true,dodge:true}));for(let i=0;i<30;i++)game.step(r,input());
    assert.ok(r.player.x<=ARENA.width-PLAYER.radius);
  }
});

test('fighter can buffer one second dash, never a third, and the chain expires',()=>{
  const r=quiet('fighter');game.step(r,input({right:true,dodge:true}));
  game.step(r,input({right:true,dodge:true}));
  for(let i=0;i<30&&(r.player.dodgeTime>0||r.player.dodgeQueued);i++){
    game.step(r,input({right:true,dodge:r.player.dodgeChainUsed}));
  }
  assert.ok(Math.abs(r.player.x-570)<1e-6,`two short dashes: ${r.player.x}`);
  assert.equal(r.events.filter(e=>e.type==='dodge').length,2);assert.equal(r.player.dodgeChainTime,0);
  const expired=quiet('fighter');game.step(expired,input({right:true,dodge:true}));
  for(let i=0;i<40;i++)game.step(expired,input());game.step(expired,input({dodge:true}));
  assert.equal(expired.events.filter(e=>e.type==='dodge').length,1,'late second press cannot bypass cooldown');
});

test('gunslinger fires while rolling without bypassing ammo or reload; other classes cannot attack during evade',()=>{
  const r=quiet('gunslinger');game.step(r,input({right:true,dodge:true,attack:true}));
  assert.equal(r.player.ammo,r.weapon.magazine-1);assert.equal(r.projectiles.length,1);assert.ok(r.player.dodgeTime>0);
  const empty=quiet('gunslinger');empty.player.ammo=0;empty.player.reloadTime=.5;
  game.step(empty,input({right:true,dodge:true,attack:true}));assert.equal(empty.projectiles.length,0);assert.equal(empty.player.ammo,0);
  for(const cls of ['warrior','fighter','mage','archer']){
    const other=quiet(cls);game.step(other,input({right:true,dodge:true,attack:true}));
    assert.equal(other.player.swing,null,cls);assert.equal(other.projectiles.length,0,cls);
  }
});

test('all catalog patterns execute actual locked hazards and composite stages reach final recovery',()=>{
  for(const pattern of Object.values(PATTERNS)){
    const r=game.createRun();r.player.hp=r.player.maxHp=10000;r.player.x=640;r.player.y=365;
    r.boss.x=640;r.boss.y=280;r.boss.timer=0;
    r.boss.def={...r.boss.def,patterns:[pattern],pursuit:null,raid:null};
    let hazards=0,finished=false;
    for(let i=0;i<900;i++){
      game.step(r,game.createInput());hazards+=r.hazards.length;
      for(const h of r.hazards){
        assert.ok(['circle','sector','ring','lane'].includes(h.shape),pattern.id);
        for(const key of ['x','y','windup','active','damage'])assert.ok(Number.isFinite(h[key]),`${pattern.id}/${key}`);
        assert.ok(h.windup>=.6,pattern.id);
        if(h.phase==='active')assert.equal(game.getHazardProgress(h),1);
      }
      if(r.boss.state==='recover'){finished=true;break;}
    }
    assert.ok(hazards>0&&finished,`${pattern.id}: execute and finish`);
    if(pattern.steps)for(const part of pattern.steps)assert.ok(r.events.some(e=>e.type==='telegraph'&&e.pattern===part.id),`${pattern.id}/${part.id}`);
  }
});

test('shrinking waves stay selectable at their widest ring and boss-orbits include their offset',()=>{
  const begins=(pattern,x)=>{
    const r=quiet('warrior');r.boss.x=640;r.boss.y=360;r.player.x=x;r.player.y=360;r.boss.timer=0;
    r.boss.def={...r.boss.def,patterns:[pattern]};game.step(r,game.createInput());return r.hazards.length>0;
  };
  assert.equal(begins(PATTERNS['double-ring'],860),true);
  assert.equal(begins({...PATTERNS['orbit-mines'],anchor:'boss',radius:50,orbitRadius:190,sequence:3},860),true);
  assert.equal(begins(PATTERNS['double-ring'],1000),false);
});

test('retargeted multi-charge inside a composite still executes its finisher and recovers only once',()=>{
  const r=quiet('warrior');r.player.hp=r.player.maxHp=10000;r.player.x=750;r.player.y=360;
  r.boss.x=400;r.boss.y=360;r.boss.timer=0;
  r.boss.def={...r.boss.def,patterns:[{...PATTERNS['twin-charge'],id:'charge-chain',steps:[PATTERNS['twin-charge'],PATTERNS['needle-lane']]}]};
  for(let i=0;i<800;i++){game.step(r,game.createInput());if(r.boss.state==='recover')break;}
  const stages=r.events.filter(e=>e.type==='telegraph').map(e=>e.pattern);
  assert.deepEqual(stages,['twin-charge','twin-charge','twin-charge-followup','needle-lane']);
  assert.equal(r.boss.state,'recover');assert.equal(r.boss.combo,null);
});

test('only every fifth boss changes phase; final boss has a third phase and clears all old attacks',()=>{
  for(let stage=0;stage<CAMPAIGN.stages.length;stage++){
    const r=game.createRun({stage});r.boss.hp=r.boss.maxHp*.49;game.step(r,game.createInput());
    assert.equal(r.boss.phase,(stage+1)%5===0?2:1,`stage ${stage+1}`);
    if((stage+1)%5===0){assert.equal(r.hazards.length,0);assert.equal(r.boss.raid,null);}
    if(stage===19){r.boss.hp=r.boss.maxHp*.3;game.step(r,game.createInput());assert.equal(r.boss.phase,3);}
  }
});

test('special rewards guarantee one unique, normal rewards stay rare',()=>{
  for(const [stage,minimum,maximum] of [[0,.045,.08],[4,1,1],[9,1,1],[14,1,1]]){
    let rare=0;
    for(let seed=1;seed<=1000;seed++){
      const r=reward(seed,stage),uniques=r.offers.filter(c=>c.rarity==='unique');
      assert.ok(uniques.length<=1);assert.equal(r.offers.length,3);rare+=uniques.length;
    }
    assert.ok(rare>=minimum*1000&&rare<=maximum*1000,`${stage+1}: ${rare}/1000`);
  }
});
