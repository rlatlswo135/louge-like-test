import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, CAMPAIGN, BOSSES, PLAYER, LIMITS } from '../public/src/content.mjs';
import { createRun, createInput, getStats, getStorm, hazardHitsCircle, step } from '../public/src/game.mjs';
import { SIGNATURES } from '../public/src/signatures.mjs';
import { STAGES } from '../public/src/stages.mjs';

function begin(stage,x=640,y=580,classId='warrior'){
  const r=createRun({stage,classId,seed:17});
  r.player.x=x;r.player.y=y;
  r.encounter={stage,phase:1,complete:true,active:false};
  r.stageTime=10;r.boss.timer=0;step(r,createInput());
  assert.equal(r.boss.raid.id,SIGNATURES[stage].id);
  return r;
}
const geometryDanger=(h,x,y,r)=>!h.gaze&&hazardHitsCircle(h,x,y,r);
function safeRoute(r){
  const p=r.player,b=r.boss,speed=getStats(r).speed,storm=getStorm(r);
  let best=null,cost=Infinity;
  const xs=[p.x,...Array.from({length:79},(_,i)=>16+i*16)],ys=[p.y,...Array.from({length:44},(_,i)=>16+i*16)];
  for(const y of ys)for(const x of xs){
    if(r.hazards.some(h=>geometryDanger(h,x,y,PLAYER.radius+12)))continue;
    if(r.boss.raid.pull&&Math.hypot(x-640,y-360)<235+r.boss.raid.pull*r.boss.timer)continue;
    if(storm.active&&Math.hypot(x-640,y-360)+PLAYER.radius+6>storm.radius)continue;
    const diagonal=Math.min(Math.abs(x-p.x),Math.abs(y-p.y));
    const routes=[{x:p.x+Math.sign(x-p.x)*diagonal,y:p.y+Math.sign(y-p.y)*diagonal},{x,y:p.y},{x:p.x,y}].map(turn=>[turn,{x,y}]);
    for(const side of [-1,1]){
      const dx=b.x+side*(b.def.radius+PLAYER.radius+36),dy=b.y+side*(b.def.radius+PLAYER.radius+36);
      routes.push([{x:dx,y:p.y},{x:dx,y},{x,y}],[{x:p.x,y:dy},{x,y:dy},{x,y}]);
    }
    for(const route of routes){
      let from=p,length=0,valid=true;
      for(const to of route){
        if(to.x<PLAYER.radius||to.x>1280-PLAYER.radius||to.y<PLAYER.radius||to.y>720-PLAYER.radius){valid=false;break;}
        if(storm.active&&Math.hypot(to.x-640,to.y-360)+PLAYER.radius+8>storm.radius){valid=false;break;}
        const dx=to.x-from.x,dy=to.y-from.y,l=Math.hypot(dx,dy);
        const t=Math.max(0,Math.min(1,((b.x-from.x)*dx+(b.y-from.y)*dy)/(l*l||1)));
        const clearance=b.def.radius+PLAYER.radius+4,fromDistance=Math.hypot(from.x-b.x,from.y-b.y);
        if(fromDistance>=clearance&&Math.hypot(from.x+dx*t-b.x,from.y+dy*t-b.y)<clearance){valid=false;break;}
        if(fromDistance<clearance&&Math.hypot(to.x-b.x,to.y-b.y)<fromDistance){valid=false;break;}
        for(let dist=0;dist<=l;dist+=8){
          const time=(length+dist)/speed,px=from.x+dx*dist/(l||1),py=from.y+dy*dist/(l||1);
          if(r.hazards.some(h=>h.t+time>=h.windup-1e-9&&h.t+time<h.windup+h.active&&geometryDanger(h,px,py,PLAYER.radius))){valid=false;break;}
        }
        if(!valid)break;
        length+=l;from=to;
      }
      if(valid&&length<cost){cost=length;best=route;}
    }
  }
  assert.ok(best,`reachable safe route: ${r.stage}/${r.boss.raid.round} from ${p.x},${p.y}; boss ${b.x},${b.y}/${b.def.radius}; hazards ${JSON.stringify(r.hazards.map(h=>({shape:h.shape,x:h.x,y:h.y,angle:h.angle,t:h.t,windup:h.windup,active:h.active})))}`);
  return best;
}

test('twenty production bosses select distinct named mechanics and stage themes',()=>{
  assert.equal(SIGNATURES.length,20);assert.equal(new Set(SIGNATURES.map(s=>s.kind)).size,20);
  assert.equal(new Set(STAGES.map(s=>s.name)).size,20);assert.equal(new Set(STAGES.map(s=>s.music)).size,7);
  for(let stage=0;stage<20;stage++)assert.equal(BOSSES[CAMPAIGN.stages[stage]].signature,SIGNATURES[stage]);
});

test('production mechanics allow 200ms reaction then real walking from edges, including the final storm',()=>{
  for(let stage=0;stage<20;stage++)for(const late of [false,true])for(const [x,y] of late?[[180,360],[1100,360],[640,40],[640,680]]:[[16,16],[1264,16],[16,704],[1264,704]]){
    const r=begin(stage,x,y);if(late)r.stageTime=125;
    let round=-1,reactAt=0,route=null,seen=0;
    for(let tick=0;tick<2000&&r.boss.raid;tick++){
      if(round!==r.boss.raid.round){round=r.boss.raid.round;route=null;reactAt=r.time+.2;seen++;}
      if(route===null&&r.time>=reactAt-1e-9)route=safeRoute(r);
      const input=createInput();
      // Looking away is ordinary mouse aim, not a geometry bypass.
      input.aimX=2*r.player.x-r.boss.x;input.aimY=2*r.player.y-r.boss.y;
      if(route){
        while(route.length&&Math.hypot(r.player.x-route[0].x,r.player.y-route[0].y)<5)route.shift();
        const goal=route[0];if(goal){input.left=r.player.x>goal.x+3;input.right=r.player.x<goal.x-3;input.up=r.player.y>goal.y+3;input.down=r.player.y<goal.y-3;}
      }
      step(r,input);
      assert.ok(r.hazards.length<=LIMITS.hazards&&r.projectiles.length<=LIMITS.projectiles);
      assert.equal(r.player.hp,r.player.maxHp,`stage ${stage}/late ${late}/${x},${y}/round ${round} at ${r.player.x.toFixed(1)},${r.player.y.toFixed(1)} t=${r.time.toFixed(2)}`);
    }
    assert.equal(seen,SIGNATURES[stage].rounds);assert.equal(r.boss.raid,null);
    assert.equal(r.boss.state,'recover');assert.ok(r.boss.timer>=1.5);
  }
});

test('gaze damages looking toward the boss, but looking away avoids it',()=>{
  for(const lookAway of [false,true]){
    const r=begin(8);const input=createInput();
    input.aimX=r.boss.x;input.aimY=lookAway?700:r.boss.y;
    for(let i=0;i<112;i++)step(r,input);
    assert.equal(r.player.hp<r.player.maxHp,!lookAway);
  }
});

test('every class can interrupt a blue counter using its actual dodge origin; early dodges cannot',()=>{
  for(const cls of CLASSES)for(const early of [false,true]){
    const r=begin(17,640,330,cls.id);
    for(let n=0;n<(early?40:78);n++)step(r,createInput());
    step(r,{...createInput(),up:true,dodge:true,aimX:640,aimY:200});
    assert.equal(r.boss.raid===null,!early,`${cls.id}/${early}`);
    if(!early){assert.equal(r.boss.state,'recover');assert.ok(r.events.some(e=>e.type==='counter'));assert.equal(r.hazards.length,0);}
  }
});

test('counter stance retaliates against frontal hits, not attacks from behind',()=>{
  for(const front of [true,false]){
    const r=begin(10,640,front?265:135);r.boss.faceX=0;r.boss.faceY=1;
    step(r,{...createInput(),attack:true,attackPressed:true,aimX:r.boss.x,aimY:r.boss.y});
    assert.equal(r.hazards.some(h=>h.pattern==='mirror-retaliation'),front);
  }
});

test('phase changes and death cancel production signatures and outstanding projectiles',()=>{
  for(const outcome of ['phase','dead','clear']){
    const r=begin(19);if(outcome==='phase')r.boss.hp=r.boss.maxHp*.49;else if(outcome==='dead')r.player.hp=0;else r.boss.hp=0;
    step(r,createInput());assert.equal(r.boss.raid,null);assert.equal(r.hazards.length,0);
    assert.ok(r.projectiles.every(q=>q.owner!=='boss'));
  }
});
