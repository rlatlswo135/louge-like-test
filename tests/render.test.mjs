import test from 'node:test';
import assert from 'node:assert/strict';
import { createView, resizeView, renderFrame, screenToWorld, worldToScreen } from '../public/src/render.mjs';
import { createInput, createRun, getStats, step } from '../public/src/game.mjs';
import * as renderer from '../public/src/render.mjs';

for (const [width, height, dpr] of [[1280, 720, 1], [1440, 900, 2], [900, 1440, 1.5]]) {
  test(`coordinate mapping round-trips ${width}x${height} DPR ${dpr}`, () => {
    const view = createView({ getContext: () => null, width: 0, height: 0 });
    resizeView(view, width, height, dpr);
    for (const point of [[0, 0], [640, 360], [1280, 720], [128, 611]]) {
      const screen = worldToScreen(view, ...point);
      const world = screenToWorld(view, screen.x, screen.y);
      assert.ok(Math.abs(world.x - point[0]) < 1e-9);
      assert.ok(Math.abs(world.y - point[1]) < 1e-9);
    }
    view.shakeX = 13.5; view.shakeY = -7.25;
    for (const point of [[0, 0], [640, 360], [1280, 720]]) {
      const screen = worldToScreen(view, ...point);
      const world = screenToWorld(view, screen.x, screen.y);
      assert.ok(Math.abs(world.x - point[0]) < 1e-9);
      assert.ok(Math.abs(world.y - point[1]) < 1e-9);
    }
  });
}

test('storm, charge, muzzle and melee impact render without mutating combat; reduced motion removes shake', () => {
  const ctx = new Proxy({}, { get: (target, key) => {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] ?? (target[key] = () => {});
  } });
  const view = createView({ width: 0, height: 0, getContext: () => ctx });
  resizeView(view, 1280, 720, 1);
  for (const [classId,weaponId] of [['warrior','sword'],['archer','bow'],['gunslinger','revolver']]) {
    const run = createRun({ classId, weaponId });
    run.stageTime = 125;
    run.player.x = 640; run.player.y = 270;
    run.cards['one-cut'] = weaponId === 'sword' ? 1 : 0;
    step(run, { ...createInput(), attack: true, aimX: 640, aimY: 200 });
    const before = JSON.stringify(run);
    assert.doesNotThrow(() => renderFrame(view, run, .1));
    assert.equal(JSON.stringify(run), before);
    if (weaponId === 'sword') assert.ok(Math.abs(view.shakeX) > 1);
    view.reducedMotion = true;
    renderFrame(view, run, .1);
    assert.equal(view.shakeX, 0); assert.equal(view.shakeY, 0);
    view.reducedMotion = false;
  }
});

test('actual Canvas warning fill grows inside fixed circle/sector/lane/ring bounds', () => {
  assert.equal(typeof renderer.drawHazard, 'function');
  for (const shape of ['circle','sector','lane','ring']) for (const progress of [.25,.5,1]) {
    let path = []; const fills = [], strokes = [];
    const ctx = new Proxy({
      beginPath() { path = []; }, arc(...args) { path.push(['arc',...args]); },
      rect(...args) { path.push(['rect',...args]); },
      fill() { fills.push([...path]); }, stroke() { strokes.push([...path]); },
    }, { get: (obj,key) => obj[key] ?? (() => {}) });
    const h = { shape, x:0,y:0,radius:100,innerRadius:40,gapAngle:0,gapHalfAngle:.5,
      length:200,width:50,angle:0,halfAngle:.5,t:progress,windup:1,phase:'warn' };
    const before = JSON.stringify(h);
    renderer.drawHazard(ctx,h,0,false);
    assert.equal(JSON.stringify(h),before);
    const full = shape === 'lane' ? 200 : 100;
    assert.equal(fills[0][0][3],full);
    const expected = shape === 'lane' ? 200*progress : shape === 'ring' ? Math.sqrt(40**2+(100**2-40**2)*progress) : 100*Math.sqrt(progress);
    assert.ok(Math.abs(fills[1][0][3]-expected)<1e-9, `${shape} at ${progress}: filled area must match clock`);
    assert.ok(strokes.some(p=>p[0]?.[3]===full), 'full boundary stays visible');
    if(shape==='ring') assert.equal(fills[1][1][3],40,'safe center cannot be filled');
  }
});

test('boss animation follows each real strike, including a charging follow-up during active state', () => {
  assert.equal(typeof renderer.getBossMotion,'function');
  const run=createRun();
  run.boss.state='active';run.boss.pattern={recover:.4};run.boss.timer=.2;
  run.hazards=[{shape:'circle',x:640,y:400,t:.4,windup:.8,active:.2,phase:'warn'}];
  assert.equal(renderer.getBossMotion(run).anticipation,.5);
  assert.equal(renderer.getBossMotion(run).strike,null);
  run.hazards[0].phase='active';run.hazards[0].t=.9;
  assert.ok(Math.abs(renderer.getBossMotion(run).strike-.5)<1e-9);
  run.hazards=[];run.boss.state='recover';
  assert.equal(renderer.getBossMotion(run).recovery,.5);
  assert.equal(renderer.getBossMotion(run,true).reducedMotion,true);
});

test('persistent damage pools cannot suppress the next cast animation or replay a strike',()=>{
  const run=createRun();
  run.hazards=[{shape:'circle',x:400,y:300,t:3,windup:1,active:6,phase:'active'},
    {shape:'lane',x:640,y:360,angle:1,t:.6,windup:1.2,active:.4,phase:'warn'}];
  const before=JSON.stringify(run),motion=renderer.getBossMotion(run);
  assert.equal(motion.anticipation,.5);assert.equal(motion.strike,null);assert.equal(motion.shape,'lane');
  assert.equal(JSON.stringify(run),before);
  run.hazards.pop();assert.equal(renderer.getBossMotion(run).strike,null);
  run.hazards[0].t=1.1;assert.ok(renderer.getBossMotion(run).strike>0);
});

test('open arena and warning show no damaging storm boundary; active storm uses its real radius', () => {
  let radii = [];
  const ctx = new Proxy({ arc(x,y,r) { if(x===640&&y===360)radii.push(r); } }, { get: (obj,key) => {
    if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
    return obj[key] ?? (()=>{});
  } });
  const view = createView({width:0,height:0,getContext:()=>ctx});resizeView(view,1280,720,1);
  const run = createRun();
  for(const time of [0,60,65,125]) {
    run.stageTime=time;radii=[];renderFrame(view,run,time);
    assert.equal(radii.includes(time===125?500:760),time>=65,`storm boundary at ${time}s`);
  }
});

test('major raid shield remains visible in reduced motion and rendering does not change raid state', () => {
  const strokes = [];
  const ctx = new Proxy({ stroke() { strokes.push(this.strokeStyle); } }, { get: (obj,key) => {
    if(key==='createLinearGradient'||key==='createRadialGradient') return ()=>({addColorStop(){}});
    return obj[key] ?? (()=>{});
  } });
  const view = createView({width:0,height:0,getContext:()=>ctx});resizeView(view,1280,720,1);
  const run = createRun();
  run.boss.raid={name:'철의 심판',kind:'corridor',round:0,total:3,hint:'안전 통로로 이동'};
  const before=JSON.stringify(run);
  for(const reduced of [false,true]){
    view.reducedMotion=reduced;strokes.length=0;renderFrame(view,run,0);
    assert.ok(strokes.includes('#c4b0fb'),'shield cue must not rely on shake or animation');
    assert.equal(JSON.stringify(run),before);
  }
});

test('null run renders safely without browser canvas APIs', () => {
  const ctx = new Proxy({}, { get: (target, key) => target[key] || (target[key] = () => {}) });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const view = createView(canvas);
  resizeView(view, 720, 620, 2);
  assert.doesNotThrow(() => renderFrame(view, null, 0));
  assert.equal(Number.isFinite(view.shakeX), true);
});

test('floating health stays above the player and every charged weapon exposes progress and full release',()=>{
  for(const [classId,weaponId,cards] of [['archer','bow',{}],['archer','crossbow',{}],['fighter','punch',{'charged-fist':1}],['fighter','kick',{'charged-fist':1}]]){
    const r=createRun({classId,weaponId});r.cards=cards;r.player.hp=r.player.maxHp/2;
    const s=getStats(r),rects=[],labels=[];
    const ctx=new Proxy({fillRect(...a){rects.push(a);},fillText(text){labels.push(text);}}, {get:(o,k)=>o[k]??(()=>{})});
    r.player.charge=s.chargeTime*.5;const before=JSON.stringify(r);
    renderer.drawPlayerStatus(ctx,r,s);
    assert.equal(JSON.stringify(r),before);assert.ok(labels.includes('50%'));
    assert.ok(rects.some(([x,y,w,h])=>x===r.player.x-28&&y<r.player.y-40&&w===28&&h===5),'half HP uses the floating bar');
    r.player.charge=0;r.player.chargeFlash=.2;r.player.chargeShotPower=1;
    renderer.drawPlayerStatus(ctx,r,s);assert.ok(labels.includes('완충'));
  }
});

test('refuge field uses an unfilled safe circle matching player-radius collision',()=>{
  const fills=[],circles=[];
  const g=new Proxy({fill(rule){fills.push(rule);},arc(...a){circles.push(a);}}, {get:(o,k)=>o[k]??(()=>{})});
  const h={shape:'field',x:0,y:0,width:1280,height:720,safe:[{x:350,y:240,radius:108}],phase:'warn',t:1,windup:2,raid:true};
  renderer.drawHazard(g,h,0,false);
  assert.ok(fills.includes('evenodd'));assert.ok(circles.some(([x,y,r])=>x===350&&y===240&&r===108));
});
