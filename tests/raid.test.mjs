import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BOSSES, CAMPAIGN, PLAYER, STEP, UNIQUE_CHANCE, RAID_DAMAGE_MULTIPLIER } from '../public/src/content.mjs';
import { createInput, createRun, getHazardProgress, getStorm, hazardHitsCircle, step } from '../public/src/game.mjs';

function raidRun(stage=0, x=640, y=580, phase=1) {
  const run=createRun({stage,seed:12});
  // Retain coverage of the legacy fallback layouts. Production signatures have their own suite.
  run.boss.def={...run.boss.def,signature:null};
  run.player.x=x;run.player.y=y;
  if(phase>1){run.boss.hp=run.boss.maxHp*(phase===3?.3:.49);step(run,createInput());}
  run.encounter={stage,phase:run.boss.phase,complete:true,active:false};
  run.boss.timer=0;run.stageTime=phase>1?30:10;
  step(run,createInput());return run;
}
const safe=(run,x,y)=>run.hazards.every(h=>!hazardHitsCircle(h,x,y,PLAYER.radius));

test('raid constituent boundaries deal one hit per round, never double or triple damage',()=>{
  const run=raidRun(2), gap=run.hazards.find(h=>h.gapHalfAngle)?.gapAngle||0;
  run.player.hp=run.player.maxHp=1000;
  run.hazards=run.hazards.filter(h=>!h.raidPressure);run.boss.raid.pressureAt=Infinity;
  run.player.x=640+70*Math.cos(gap+Math.PI);run.player.y=360+70*Math.sin(gap+Math.PI);
  const h=run.hazards[0];
  while(h.phase==='warn')step(run,createInput());
  assert.equal(run.player.hp,1000-50*(1+run.stage*.025)*(1-run.cls.damageReduction));
  for(let i=0;i<15;i++)step(run,createInput());
  assert.equal(run.player.hp,1000-50*(1+run.stage*.025)*(1-run.cls.damageReduction));
});

test('all twenty bosses have named major mechanics with three different spatial programs and rare unique chance',()=>{
  const raids=CAMPAIGN.stages.map(id=>BOSSES[id].raid);
  assert.equal(new Set(raids.map(r=>r.id)).size,CAMPAIGN.stages.length);
  assert.ok(raids.every(r=>r.name.length>2));
  assert.equal(new Set(raids.map(r=>r.kind)).size,3);
  assert.equal(UNIQUE_CHANCE,.06);
});

test('every raid uses renderer-supported locked geometry and covers most of the arena',()=>{
  for(let stage=0;stage<CAMPAIGN.stages.length;stage++){
    const run=raidRun(stage), raid=run.boss.raid;
    assert.ok(raid);assert.equal(run.boss.pattern.raid,true);
    assert.ok(run.hazards.every(h=>['lane','circle','ring','sector'].includes(h.shape)&&h.raid));
    assert.ok(run.hazards.every(h=>getHazardProgress(h)===0));
    if(raid.kind==='in-out'&&raid.invert)continue; // reverse variant opens with the center blast
    let total=0,danger=0;
    for(let y=16;y<720;y+=24)for(let x=16;x<1280;x+=24){total++;if(!safe(run,x,y))danger++;}
    assert.ok(danger/total>.6,`${stage}: ${danger}/${total} danger`);
  }
});

function routeAvoidsActiveWindows(run,route){
  let x=run.player.x,y=run.player.y,time=0;
  for(const goal of route){
    for(let n=0;n<300&&Math.hypot(x-goal.x,y-goal.y)>=5;n++){
      const dx=Math.abs(x-goal.x)>3?Math.sign(goal.x-x):0,dy=Math.abs(y-goal.y)>3?Math.sign(goal.y-y):0;
      if(!dx&&!dy)break;
      const length=Math.hypot(dx,dy);x+=dx/length*PLAYER.speed*STEP;y+=dy/length*PLAYER.speed*STEP;time+=STEP;
      if(run.hazards.some(h=>h.t+time>=h.windup-1e-9&&h.t+time<h.windup+h.active-1e-9&&hazardHitsCircle(h,x,y,PLAYER.radius+2)))return false;
    }
  }
  return true;
}

function shortestSafeRoute(run){
  let best=null, distance=Infinity;
  const p=run.player,storm=getStorm(run);
  for(let y=28;y<ARENA.height-24;y+=12)for(let x=28;x<ARENA.width-24;x+=12){
    if(run.hazards.some(h=>hazardHitsCircle(h,x,y,PLAYER.radius+8)))continue;
    const diagonal=Math.min(Math.abs(x-p.x),Math.abs(y-p.y));
    // Actual eight-direction movement: diagonal then axis, or a detour around the boss.
    for(const turn of [{x:p.x+Math.sign(x-p.x)*diagonal,y:p.y+Math.sign(y-p.y)*diagonal},{x,y:p.y},{x:p.x,y}]){
      const route=[turn,{x,y}];let from=p,cost=0,valid=true;
      for(const to of route){
        if(storm.active&&Math.hypot(to.x-storm.x,to.y-storm.y)+PLAYER.radius+8>storm.radius){valid=false;break;}
        const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy;
        const t=Math.max(0,Math.min(1,((640-from.x)*dx+(360-from.y)*dy)/(len2||1)));
        if(Math.hypot(from.x+dx*t-640,from.y+dy*t-360)<70){valid=false;break;}
        cost+=Math.sqrt(len2);from=to;
      }
      if(valid&&cost<distance&&routeAvoidsActiveWindows(run,route)){best=route;distance=cost;}
    }
  }
  assert.ok(best,`safe route must exist: stage${run.stage} round${run.boss.raid.round}`);return best;
}

test('all raid rounds allow actual 200ms walking escapes from corners and within final storm',()=>{
  for(const stage of Array.from({length:CAMPAIGN.stages.length},(_,i)=>i))for(const phase of stage===19?[1,2,3]:(stage+1)%5===0?[1,2]:[1])for(const late of [false,true])for(const [x,y] of late?[[180,360],[1100,360],[640,40],[640,680]]:[[16,16],[1264,16],[16,704],[1264,704]]){
    const run=raidRun(stage,x,y,phase), total=run.boss.raid.total;
    if(late)run.stageTime=125;
    let round=-1,reactAt=0,route=null,seen=0,pressure=null,replan=false;
    for(let tick=0;tick<1500&&run.boss.raid;tick++){
      if(round!==run.boss.raid.round){round=run.boss.raid.round;route=null;pressure=null;seen++;reactAt=run.time+.2;replan=true;}
      const fresh=run.hazards.findLast(h=>h.raidPressure);
      if(fresh&&fresh!==pressure){pressure=fresh;reactAt=run.time+.2;replan=true;}
      const input=createInput();
      if(replan&&run.time>=reactAt-1e-9){route=shortestSafeRoute(run);replan=false;}
      if(route){
        while(route.length&&Math.hypot(run.player.x-route[0].x,run.player.y-route[0].y)<5)route.shift();
        const goal=route[0];
        if(goal){input.left=run.player.x>goal.x+3;input.right=run.player.x<goal.x-3;
          input.up=run.player.y>goal.y+3;input.down=run.player.y<goal.y-3;}
      }
      step(run,input);
      assert.equal(run.player.hp,run.player.maxHp,`${stage}/phase${phase}/late${late}/origin${x},${y}/round${round} time${run.time.toFixed(2)} at${run.player.x.toFixed(0)},${run.player.y.toFixed(0)} target${JSON.stringify(route)} threats${JSON.stringify(run.hazards.filter(h=>h.phase==='active').map(h=>({shape:h.shape,x:h.x,y:h.y,angle:h.angle,pressure:h.raidPressure})))}`);
    }
    assert.equal(seen,total);assert.equal(run.boss.raid,null);
    assert.equal(run.boss.state,'recover');assert.ok(run.boss.timer>=.7);
    assert.ok(run.boss.nextRaidAt-run.stageTime>=(run.boss.def.special?12:18),'repeat cooldown starts after whole mechanic');
  }
});

test('HP checkpoint queues at idle, raid armor uses actual damage, final recovery is fully vulnerable',()=>{
  const run=createRun();run.boss.hp=run.boss.maxHp*.79;run.boss.timer=0;
  step(run,createInput());assert.ok(run.boss.raid,'80% checkpoint before ten seconds');
  run.player.x=run.boss.x+70;run.player.y=run.boss.y;
  const hp=run.boss.hp;step(run,{...createInput(),attack:true,aimX:run.boss.x,aimY:run.boss.y});
  const hit=run.events.filter(e=>e.type==='bossHit').at(-1);
  assert.ok(Math.abs(hit.damage-run.weapon.damage*.85*RAID_DAMAGE_MULTIPLIER)<1e-9);
  assert.ok(Math.abs(run.boss.hp-(hp-hit.damage))<1e-9);
  for(let i=0;i<1500&&run.boss.raid;i++){run.player.hp=100;step(run,createInput());}
  assert.equal(run.boss.raid,null);assert.equal(run.boss.state,'recover');
  run.player.x=run.boss.x+70;run.player.y=run.boss.y;run.player.attackCooldown=0;
  step(run,{...createInput(),attack:true,aimX:run.boss.x,aimY:run.boss.y});
  assert.equal(run.events.filter(e=>e.type==='bossHit').at(-1).damage,run.weapon.damage*.85);
});

test('phase change and terminal states clear raid geometry, armor and queued rounds',()=>{
  for(const terminal of ['phase','dead','reward']){
    const run=raidRun(terminal==='phase'?9:0);
    if(terminal==='phase')run.boss.hp=run.boss.maxHp*.49;
    else if(terminal==='dead')run.player.hp=0;
    else run.boss.hp=0;
    step(run,createInput());
    assert.equal(run.boss.raid,null);assert.equal(run.hazards.length,0);
    if(terminal==='phase')assert.equal(run.boss.phase,2);
    else {const time=run.time;step(run,createInput());assert.equal(run.time,time);}
  }
});
