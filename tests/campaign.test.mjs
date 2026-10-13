import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BOSSES, CAMPAIGN, CARDS, CLASSES, LIMITS, PLAYER, STEP } from '../public/src/content.mjs';
import { chooseCard, createInput, createRun, getStats, hazardHitsCircle, step } from '../public/src/game.mjs';

test('campaign has 20 bosses, 5 classes/12 weapons, 12 basic cards, 25 uniques and 3 berserks', () => {
  assert.deepEqual(CAMPAIGN.stages, Object.keys(BOSSES));
  assert.equal(CLASSES.length, 5);
  assert.equal(CLASSES.reduce((n, c) => n + c.weapons.length, 0), 12);
  assert.equal(CARDS.filter(c => !c.rarity).length, 12);
  assert.equal(CARDS.filter(c => c.rarity === 'unique').length, 25);
  assert.throws(() => createRun({ stage: -1 }), /Invalid campaign stage/);
  assert.throws(() => createRun({ stage: CAMPAIGN.stages.length }), /Invalid campaign stage/);
});

test('reward choice advances campaign, preserves HP, and rejects invalid choices', () => {
  const run = createRun({ seed: 42 });
  run.player.hp = 61; run.boss.hp = 1;
  run.player.x = run.boss.x; run.player.y = run.boss.y + 60;
  const input = createInput(); input.attack = true; input.aimX = run.boss.x; input.aimY = run.boss.y;
  step(run, input);
  assert.equal(run.status, 'reward'); assert.equal(run.player.hp, 73); assert.equal(run.offers.length, 3);
  assert.equal(chooseCard(run, 'not-a-card'), false);
  const chosen = run.offers[0].id;
  assert.equal(chooseCard(run, chosen), true);
  assert.equal(run.status, 'playing'); assert.equal(run.stage, 1);
  assert.equal(run.player.hp, 73 + (chosen === 'healing' || chosen === 'vitality' ? 20 : 0));
  assert.equal(run.cards[chosen], 1); assert.equal(chooseCard(run, chosen), false);
  assert.ok(getStats(run).damage > 0);
});

test('all 12 loadouts run against all 20 bosses', () => {
  for (const cls of CLASSES) for (const weapon of cls.weapons) for (const bossId of CAMPAIGN.stages) {
    const run = createRun({ classId: cls.id, weaponId: weapon.id, stage: CAMPAIGN.stages.indexOf(bossId), seed: 19 });
    run.boss.timer = 1e6;
    run.player.x = run.boss.x; run.player.y = run.boss.y + run.boss.def.radius + 20;
    const input = createInput(); input.aimX = run.boss.x; input.aimY = run.boss.y; input.attack = true;
    for (let i=0;i<Math.ceil((weapon.interval + (weapon.chargeTime || 0)) / (1/60))+6;i++) step(run,input);
    assert.ok(run.boss.hp < run.boss.maxHp, `${cls.id}/${weapon.id} vs ${bossId}`);
    assert.ok(run.projectiles.length <= LIMITS.projectiles);
  }
});

test('cards are naturally offered, selectable, and apply their described effects', () => {
  const winNaturally = (seed) => {
    const run=createRun({seed});run.player.hp=50;run.boss.hp=1;run.player.x=run.boss.x;run.player.y=run.boss.y+60;
    const input=createInput();input.attack=true;input.aimX=run.boss.x;input.aimY=run.boss.y;step(run,input);
    assert.equal(run.status,'reward');assert.equal(run.offers.length,3);
    assert.equal(new Set(run.offers.map(c=>c.id)).size,3);
    return run;
  };
  for (const card of CARDS.filter(card => !card.rarity)) {
    let run;
    for(let seed=1;seed<200;seed++){run=winNaturally(seed);if(run.offers.some(c=>c.id===card.id))break;}
    assert.ok(run.offers.some(c=>c.id===card.id),`${card.id} offered naturally`);
    run.player.hp=50;
    assert.equal(chooseCard(run,card.id),true);
    assert.equal(run.cards[card.id],1);
    assert.equal(run.hazards.length+run.projectiles.length+run.particles.length,0);
    assert.equal(run.player.x,ARENA.width/2);assert.equal(run.player.y,ARENA.height-140);
    assert.equal(run.player.attackCooldown,0);assert.equal(run.player.dodgeCooldown,0);
    const stats=getStats(run);
    if(card.id==='edge') assert.ok(stats.damage>32);
    if(card.id==='tempo'||card.id==='rapid') assert.ok(stats.interval<run.weapon.interval);
    if(card.id==='reach') assert.ok(stats.reach>run.weapon.reach);
    if(card.id==='vitality') assert.equal(run.player.maxHp,run.cls.maxHp+20);
    if(card.id==='healing'||card.id==='vitality') assert.equal(run.player.hp,70);
    if(card.id==='swift') assert.ok(stats.speed>PLAYER.speed);
    if(card.id==='dodge') assert.ok(stats.dodgeCooldown<run.cls.dodge.cooldown);
    if(card.id==='focus') {run.player.hp=40;assert.ok(getStats(run).damage>run.weapon.damage);}
    if(card.id==='heavy') {run.player.heavyReady=true;assert.ok(getStats(run).damage>run.weapon.damage);}
    if(card.id==='rapid') {run.player.hitCount=4;assert.ok(getStats(run).damage>run.weapon.damage);}
    assert.ok(stats.interval>0 && stats.reach>0 && stats.speed>0 && stats.dodgeCooldown>0);
  }

  const naturallyOffered = (cardId) => {
    for(let seed=1;seed<200;seed++) {
      const run=createRun({seed});run.player.hp=50;run.boss.hp=1;run.player.x=run.boss.x;run.player.y=run.boss.y+60;
      const attack=createInput();attack.attack=true;attack.aimX=run.boss.x;attack.aimY=run.boss.y;step(run,attack);
      if(run.offers.some(c=>c.id===cardId)) return run;
    }
    assert.fail(`${cardId} not naturally offered`);
  };
  const fortune= naturallyOffered('fortune');
  assert.equal(chooseCard(fortune,'fortune'),true);
  fortune.player.hp=30;fortune.boss.hp=1;fortune.player.x=fortune.boss.x;fortune.player.y=fortune.boss.y+60;
  const finish=createInput();finish.attack=true;finish.aimX=fortune.boss.x;finish.aimY=fortune.boss.y;step(fortune,finish);
  assert.equal(fortune.player.hp,54,'fortune adds to the base clear heal');

  const heavy=naturallyOffered('heavy');assert.equal(chooseCard(heavy,'heavy'),true);
  heavy.boss.timer=1e6;heavy.boss.hp=heavy.boss.maxHp;heavy.player.x=heavy.boss.x;heavy.player.y=heavy.boss.y+60;
  const charged=createInput();charged.attack=true;charged.aimX=heavy.boss.x;charged.aimY=heavy.boss.y;step(heavy,charged);
  assert.ok(heavy.events.filter(e=>e.type==='bossHit').at(-1).damage>heavy.weapon.damage,'heavy proc affects real hit');

  const dodge=naturallyOffered('dodge');assert.equal(chooseCard(dodge,'dodge'),true);
  dodge.boss.timer=1e6;dodge.player.x=dodge.boss.x;dodge.player.y=dodge.boss.y+60;
  step(dodge,Object.assign(createInput(),{dodge:true,right:true}));
  for(let i=0;i<20;i++)step(dodge,createInput());
  dodge.player.x=dodge.boss.x;dodge.player.y=dodge.boss.y+60;
  const buffed=createInput();buffed.attack=true;buffed.aimX=dodge.boss.x;buffed.aimY=dodge.boss.y;step(dodge,buffed);
  assert.ok(dodge.events.filter(e=>e.type==='bossHit').at(-1).damage>dodge.weapon.damage,'dodge proc affects real hit');
});

test('every actual boss pattern, including phase two, has a storm-safe escape after 200ms reaction', () => {
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const bossId of CAMPAIGN.stages) for (const phase of Array.from({length:BOSSES[bossId].phaseThresholds.length+1},(_,i)=>i+1)) for (const definition of BOSSES[bossId].patterns) {
    let escaped = false;
    for (const turn of [0,1,-1,2]) for (const useDodge of [false,true]) for (const [dx,dy] of directions) {
      if (escaped) break;
      const run = createRun({ stage: CAMPAIGN.stages.indexOf(bossId), seed: 1 });
      if(phase>1){run.boss.hp=run.boss.maxHp*(phase===3?.3:.49);step(run,createInput());}
      run.encounter={stage:run.stage,phase:run.boss.phase,active:false,complete:true};
      const pattern=run.boss.def.patterns.find(p=>p.id===definition.id);
      run.boss.def = { ...run.boss.def, patterns: [pattern], pursuit: null, raid: null };
      run.boss.timer = 0;
      const opening=pattern.steps?.[0]||pattern;
      run.player.x=run.boss.x;run.player.y=run.boss.y+Math.max(65,Math.min(130,opening.radius||100));
      if (opening.shape === 'ring') {
        run.player.x = (opening.anchor==='boss'?run.boss.x:640)+(opening.radius+opening.innerRadius)/2;
        run.player.y = opening.anchor==='boss'?run.boss.y:360;
      }
      step(run, createInput());
      assert.ok(run.hazards.length > 0 && run.hazards.every(h => h.rootPattern === pattern.id && h.phase === 'warn'),`${bossId}/${pattern.id}/phase${phase}: starts in reach`);
      assert.ok(run.hazards.every(h => h.windup >= .6));
      for (let i = 0; i < 12; i++) step(run, createInput());
      let shown=run.boss.pattern,reaction=0,segment=0;
      for (let i = 0; i < 1200 && (run.hazards.length || run.projectiles.length); i++) {
        // Isolate one complete cast, not a subsequent unrelated pattern.
        if (run.boss.state === 'recover') run.boss.timer = 1e6;
        if(run.boss.pattern!==shown){shown=run.boss.pattern;reaction=12;segment++;}
        const unsafe = run.hazards.some(h => hazardHitsCircle(h, run.player.x, run.player.y, PLAYER.radius + 3));
        const controls = createInput();
        if (unsafe && reaction<=0) {
          const a=Math.atan2(dy,dx)+segment*turn*Math.PI/2,mx=Math.round(Math.cos(a)),my=Math.round(Math.sin(a));
          controls.right=mx>0;controls.left=mx<0;controls.down=my>0;controls.up=my<0;
          controls.dodge = useDodge && run.player.dodgeCooldown<=STEP;
        }
        reaction--;
        step(run, controls);
        if (run.player.hp < run.player.maxHp) break;
      }
      escaped = run.player.hp === run.player.maxHp && !run.hazards.length && !run.projectiles.length;
    }
    assert.ok(escaped, `${bossId}/${definition.id}/phase${phase}: telegraph must allow a real, storm-safe escape`);
  }
});

test('cosmetic RNG consumption cannot perturb seeded gameplay rewards', () => {
  const a=createRun({seed:912}),b=createRun({seed:912});
  for(let i=0;i<100;i++) b.cosmeticRng();
  for(let i=0;i<4;i++) assert.equal(a.rng(),b.rng());
  a.status=b.status='reward';a.offers=b.offers=[CARDS[0]];
  a.status='playing';b.status='playing';a.stage=b.stage=0;
  a.boss.hp=b.boss.hp=1;a.player.x=b.player.x=640;a.player.y=b.player.y=260;
  const input=()=>{const x=createInput();x.attack=true;x.aimX=640;x.aimY=200;return x;};
  step(a,input());step(b,input());
  assert.deepEqual(a.offers.map(x=>x.id),b.offers.map(x=>x.id));
});

test('exactly nineteen rewards lead to stage twenty victory and no stage twenty one', () => {
  const run=createRun({seed:77});let rewards=0;
  for(let stage=0;stage<20;stage++) {
    run.encounter={stage:run.stage,phase:1,active:false,complete:true};run.boss.def={...run.boss.def,phaseThresholds:[]};
    run.boss.hp=1;run.player.x=run.boss.x;run.player.y=run.boss.y+60;
    const input=createInput();input.attack=true;input.aimX=run.boss.x;input.aimY=run.boss.y;step(run,input);
    if(stage<19){assert.equal(run.status,'reward');rewards++;assert.equal(chooseCard(run,run.offers.find(c=>!c.rarity).id),true);assert.equal(run.stage,stage+1);}
    else assert.equal(run.status,'won');
  }
  assert.equal(rewards,19);assert.equal(run.stage,19);assert.equal(run.stageCount,20);assert.equal(run.offers.length,0);
});

test('projectiles sweep through high speed collisions; final phase triggers once and clears pending attacks', () => {
  const run=createRun({classId:'gunslinger',weaponId:'sniper'});run.boss.timer=1e6;
  run.player.x=run.boss.x-200;run.player.y=run.boss.y;
  const input=createInput();input.aimX=run.boss.x;input.aimY=run.boss.y;input.attack=true;
  step(run,input);for(let i=0;i<20;i++)step(run,createInput());
  assert.ok(run.boss.hp<run.boss.maxHp,'fast projectile hit');
  const end=createRun({stage:9});end.encounter={stage:9,phase:1,active:false,complete:true};end.boss.hp=end.boss.maxHp*.51;end.boss.phase=1;end.projectiles.push({owner:'boss',x:640,y:580,prevX:640,prevY:580,vx:0,vy:0,radius:4,life:1,damage:5});end.hazards.push({shape:'circle',x:640,y:580,radius:20,phase:'warn',t:0,windup:1,active:.2,damage:5});
  end.boss.hp=end.boss.maxHp*.49;step(end,createInput());
  assert.equal(end.boss.phase,2);assert.equal(end.hazards.length,0);assert.equal(end.projectiles.length,0);
  assert.equal(end.boss.timer,.7);
  assert.ok(end.boss.def.patterns.every(p=>p.windup<=(BOSSES['rift-lord'].patterns.find(x=>x.id===p.id).windup)));
  assert.ok(end.boss.def.patterns.some(p=>p.volley>BOSSES['rift-lord'].patterns.find(x=>x.id===p.id).volley || p.sequence===2));
  const phaseEvents=end.events.filter(e=>e.type==='phase').length;step(end,createInput());assert.equal(end.events.filter(e=>e.type==='phase').length,phaseEvents);
});
