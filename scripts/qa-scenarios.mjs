// Expanded browser checks share production boot. Fixtures prove wiring/load, not player skill.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function harness({ send }) {
  const results = [];
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const check = (name, pass, detail) => {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  };
  const snap = () => evaluate('__qa.snapshot()');
  const until = async (expression) => {
    for(let i=0;i<75;i++){if(await evaluate(expression))return true;await sleep(20);}
    return false;
  };
  const wait = async (screen) => {
    for (let i = 0; i < 150; i++) {
      const state = await snap();
      if (state.screen === screen) return state;
      await sleep(20);
    }
    throw new Error(`Screen timeout: ${screen}`);
  };
  const click = async (selector) => {
    const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...rect });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...rect });
  };
  const shot = async (out, name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(out, name), Buffer.from(data, 'base64'));
  };
  return { results, evaluate, check, snap, until, wait, click, shot };
}

export async function runCampaign(page, out) {
  const { results, evaluate, check, snap, until, wait, click, shot } = harness(page);
  const { send } = page;
  await wait('home');await click('#home-start');
  await wait('start');
  const fire = async (pressed, x = 1000, y = 580) => {
    const point = await evaluate(`__qa.app.worldToScreen(${x},${y})`);
    await send('Input.dispatchMouseEvent', { type: pressed ? 'mousePressed' : 'mouseReleased', button: 'left', buttons: pressed ? 1 : 0, clickCount: 1, ...point });
  };
  const enterBattle = async () => { await wait('briefing'); await click('#briefing-start'); return wait('battle'); };
  const portraits = await evaluate(`(async()=>{
    const {BOSSES}=await import('/src/content.mjs');const {drawPortrait}=await import('/src/render.mjs');
    return Object.keys(BOSSES).map(bossId=>{
      const canvas=document.createElement('canvas');canvas.width=360;canvas.height=360;drawPortrait(canvas,{bossId});
      const data=canvas.getContext('2d').getImageData(0,0,360,360).data;
      let ink=0,edge=0;for(let y=0;y<360;y++)for(let x=0;x<360;x++)if(data[(y*360+x)*4+3]>20){ink++;if(x<3||y<3||x>356||y>356)edge++;}
      return {bossId,ink,edge};
    });
  })()`);
  check('20보스 초상화: 그림 존재 · 가장자리 잘림 없음', portraits.every(p=>p.ink>1000&&p.edge===0),portraits);
  const options = await evaluate("[...document.querySelectorAll('.choice')].map(b=>({cls:b.dataset.classId,weapon:b.dataset.weaponId}))");
  check('5직업 · 12무기 선택 UI', options.length === 12 && new Set(options.map((o) => o.cls)).size === 5);
  const heroPixels=await evaluate(`(async()=>{
    const {CLASSES}=await import('/src/content.mjs'),{drawHero}=await import('/src/art.mjs');
    const c=document.createElement('canvas');c.width=c.height=240;const g=c.getContext('2d',{willReadFrequently:true});
    return CLASSES.flatMap(cls=>cls.weapons.map(weapon=>{
      const hashes=[];let edge=0,minInk=Infinity,waist=false,connected=true;
      for(const [i,pose] of [{},{walk:true},{attackProgress:.6},{charge:.6},{reloadTime:.5},{dodgeTime:.1,dodgeKind:cls.dodge.kind,dodgeProgress:.25,dodgeDirection:1},{dodgeTime:.1,dodgeKind:cls.dodge.kind,dodgeProgress:.65,dodgeDirection:-1}].entries()){
        g.clearRect(0,0,240,240);g.save();g.translate(120,140);drawHero(g,{classId:cls.id,weaponId:weapon.id,color:weapon.color},1,pose.walk?0:.15,pose);g.restore();
        const data=g.getImageData(0,0,240,240).data;let ink=0,hash=2166136261;
        for(let y=0;y<240;y++)for(let x=0;x<240;x++){const at=(y*240+x)*4;if(data[at+3]){ink++;if(x<2||y<2||x>237||y>237)edge++;for(let k=0;k<4;k++)hash=Math.imul(hash^data[at+k],16777619);}}
        hashes.push(hash);minInk=Math.min(minInk,ink);if(i===0){
          let beltInk=0;for(let y=100;y<113;y++)for(let x=105;x<135;x++)if(data[(y*240+x)*4+3]>100)beltInk++;
          waist=beltInk>50;
          for(let y=96;y<139;y++){let body=false;for(let x=105;x<=134;x++)if(data[(y*240+x)*4+3]>100)body=true;if(!body)connected=false;}
        }
      }
      return {id:weapon.id,edge,minInk,waist,connected,idle:hashes[0],poses:new Set(hashes).size};
    }));
  })()`);
  check('실제 Canvas: 12무기 실루엣 구분 · 걷기/공격/회피 포즈 · 잘림 없음',new Set(heroPixels.map(p=>p.idle)).size===12&&heroPixels.every(p=>p.edge===0&&p.minInk>300&&p.waist&&p.connected&&p.poses>=3),heroPixels);
  await shot(out, '20-loadout.png');
  for (const option of options) {
    await click(`.class-choice[data-class-id="${option.cls}"]`);
    await click(`.choice[data-weapon-id="${option.weapon}"]`);
    const layout = await evaluate("[...document.querySelectorAll('#screen-start button:not([hidden])')].every(b=>{ const r=b.getBoundingClientRect(); return r.x>=0 && r.right<=innerWidth && r.y>=0 && r.bottom<=innerHeight; })");
    await click('#start-button');
    const intro = await wait('briefing');
    const s = await enterBattle();
    check(`${option.cls}/${option.weapon} 선택 → 소개 → 실제 런`, intro.run.time===0 && layout && s.run.classId === option.cls && s.run.weaponId === option.weapon && s.run.stage === 0 && s.run.player.hp === s.run.player.maxHp && await evaluate('document.getElementById("stat-dodge").textContent.includes(__qa.app.run.cls.dodge.cooldown.toFixed(2)) && document.getElementById("dodge-description").textContent.includes(__qa.app.run.cls.dodge.label)'));
    if(option.weapon==='punch'){
      await evaluate('__qa.fixture.quietBoss()');
      const key=type=>send('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});
      await key('keyDown');await until('__qa.app.run.player.dodgeTime>0');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,autoRepeat:true});
      check('격투가: 키 반복은 2차 대시가 아님',await evaluate('!__qa.app.run.player.dodgeQueued&&!__qa.app.run.player.dodgeChainUsed'));
      await key('keyUp');await key('keyDown');await key('keyUp');
      check('격투가: 새로 누르면 2차 대시',await until('__qa.app.run.player.dodgeChainUsed'));
      await click('#pause-button');await wait('pause');
      check('정지: 연속 회피 예약 제거',await evaluate('__qa.app.run.player.dodgeChainTime===0&&!__qa.app.run.player.dodgeQueued'));
      await click('#resume-button');await wait('battle');
    }
    if (option.weapon === 'bow') {
      await evaluate('__qa.fixture.quietBoss()');
      await fire(true); await sleep(180);
      check('궁수: 누르는 동안 충전 · 첫 클릭 즉시 발사하지 않음', await evaluate('__qa.app.run.player.charge>0 && __qa.app.run.projectiles.length===0 && document.getElementById("hud-weapon-state").textContent.includes("충전")'));
      // Screenshot encoding must not turn a partial draw into a fully charged shot.
      await evaluate('__qa.fixture.freezeTime(true)');
      await shot(out, '17-bow-charge.png');
      await fire(false);
      await evaluate('__qa.fixture.freezeTime(false)');
      check('궁수: 일찍 놓으면 약한 화살 1발', await until('__qa.app.run.projectiles.length===1 && __qa.app.run.projectiles[0].damage<__qa.app.run.weapon.damage'));
      await sleep(300); await evaluate('__qa.fixture.quietBoss()');
      await fire(true); await sleep(150);
      await click('#pause-button'); await wait('pause');
      check('충전 중 정지: 충전 취소', await evaluate('__qa.app.run.player.charge===0'));
      await click('#resume-button'); await wait('battle'); await sleep(80);
      check('재개 시 충전 화살이 저절로 발사되지 않음', await evaluate('__qa.app.run.projectiles.length===0'));
    }
    if (option.weapon === 'revolver') {
      await evaluate('__qa.fixture.quietBoss()');
      await fire(true); await sleep(1000);
      check('총술사: 6발 소진 후 재장전 · 탄약 HUD', await evaluate('__qa.app.run.player.ammo===0 && __qa.app.run.player.reloadTime>0 && document.getElementById("hud-weapon-state").textContent.includes("재장전")'));
      await shot(out, '18-gun-reload.png');
      await fire(false); await sleep(1500);
      check('재장전 후 탄창 6발 복구', await evaluate('__qa.app.run.player.ammo===6 && __qa.app.run.player.reloadTime===0'));
    }
    await evaluate('__qa.fixture.setPlayerHp(0)');
    await wait('dead');
    await click('#dead-restart');
    await wait('start');
  }
  await click('.class-choice[data-class-id="warrior"]');
  await click('.choice[data-weapon-id="sword"]');
  await click('#start-button'); await enterBattle();
  await evaluate('__qa.fixture.quietBoss(); __qa.app.stageAt=-2; __qa.app.run.player.x=35; __qa.app.run.player.y=360');
  await sleep(150);
  check('전장 개방: 가장자리 무피해 · 개방 HUD', await evaluate('__qa.app.run.player.hp===__qa.app.run.player.maxHp && document.getElementById("hud-storm").textContent.includes("전장 개방")'));
  const floor=await evaluate('(()=>{const v=__qa.app.view,d=v.ctx.getImageData(300,396,6,6).data;let uniform=true;for(let i=4;i<d.length;i++)if(d[i]!==d[i%4])uniform=false;return {width:v.floor.width,height:v.floor.height,uniform};})()');
  check('실제 경기장: 1280×720 재질 캐시 · 저해상도 픽셀 확대 없음',floor.width===1280&&floor.height===720&&!floor.uniform,floor);
  await shot(out, '30-open-arena.png');
  await evaluate('__qa.app.run.stageTime=60'); await sleep(60);
  check('60초 이후 폭풍 예고 · 아직 무피해', await evaluate('__qa.app.run.player.hp===__qa.app.run.player.maxHp && document.getElementById("hud-storm").textContent.includes("폭풍 접근")'));
  await shot(out, '31-storm-warning.png');
  await evaluate('__qa.app.run.stageTime=125'); await sleep(150);
  check('늦은 축소 자기장 밖: 약해진 지속 피해 + HUD 위험', await evaluate('__qa.app.run.player.hp<__qa.app.run.player.maxHp && __qa.app.run.player.hp>__qa.app.run.player.maxHp-5 && document.getElementById("hud-storm").dataset.outside==="true"'));
  await shot(out, '19-storm.png');
  await evaluate('__qa.fixture.loadRun({stage:4,classId:"warrior",weaponId:"sword",seed:12}); __qa.fixture.killBoss()');
  await wait('reward');
  check('희귀 보상 seed: 금색 UNIQUE 카드 한 장', await evaluate('document.querySelectorAll(".reward-card[data-rarity=unique]").length===1 && document.querySelector(".reward-card[data-rarity=unique]").textContent.includes("UNIQUE")'));
  await shot(out, '20-unique.png');
  await sleep(650); await click('.reward-card[data-rarity="unique"]'); await enterBattle();
  check('유니크 선택 후 빌드 HUD에 유지', await evaluate('document.querySelectorAll(".build-chip[data-rarity=unique]").length===1'));
  await evaluate('__qa.fixture.loadRun({classId:"warrior",weaponId:"sword"}); __qa.fixture.quietBoss(); __qa.app.run.player.x=640; __qa.app.run.player.y=360; __qa.app.run.boss.x=640; __qa.app.run.boss.y=270; __qa.app.stageAt=-2');
  await fire(true,640,270);
  check('근접 명중: 전용 충격 이펙트와 카메라 충격', await until('__qa.app.run.feedback.melee>0 && __qa.app.run.particles.some(p=>p.type==="meleeImpact")'));
  await evaluate('__qa.fixture.freezeTime(true)');
  await shot(out, '21-melee.png'); await fire(false,640,270);
  await evaluate('__qa.fixture.freezeTime(false)');
  await evaluate('__qa.fixture.setPlayerHp(0)'); await wait('dead'); await click('#dead-restart'); await wait('start');
  // Explicitly enable full effects, independently of host accessibility preference.
  await evaluate("if(document.getElementById('start-motion').checked) document.getElementById('start-motion').click()");
  await click('#start-button');
  await enterBattle();
  // Real Canvas pixels, not a fake drawing context: progress grows filled area, including reduced motion.
  const pixels = await evaluate(`(async()=>{
    const {drawHazard}=await import('/src/render.mjs');
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;
    const g=canvas.getContext('2d',{willReadFrequently:true});
    return ['circle','sector','lane','ring'].map(shape=>{
      const h={shape,x:150,y:180,radius:100,innerRadius:55,gapAngle:0,gapHalfAngle:.45,
        angle:0,halfAngle:.6,length:220,width:64,phase:'warn',windup:1};
      const count=(t,reduced=false)=>{g.clearRect(0,0,480,360);drawHazard(g,{...h,t},0,reduced);
        const data=g.getImageData(0,0,480,360).data;let n=0;for(let i=3;i<data.length;i+=4)n+=data[i]/255;return n;};
      const early=count(.25),late=count(.75),reduced=count(.75,true);
      const safeHole=shape!=='ring'||g.getImageData(185,180,1,1).data[3]===0;
      let noFalseSeam=true;
      if(shape==='ring'){h.gapHalfAngle=0;count(.5);noFalseSeam=g.getImageData(245,180,1,1).data[3]<25;}
      return {shape,early,late,reduced,safeHole,noFalseSeam};
    });
  })()`);
  for(const sample of pixels) check(`${sample.shape}: 범위 내부 충전 증가 · 모션 감소에서도 표시`,sample.late>sample.early*1.7&&sample.late===sample.reduced&&sample.safeHole&&sample.noFalseSeam,sample);
  const poses = [
    [0,'slam',.22,'22-fill-early.png'],[0,'slam',.62,'23-fill-late.png'],[0,'slam',.76,'24-fill-attack.png'],
    [0,'cleave',.86,'25-combo-charge.png'],[0,'fault-line',.91,'26-fault-line.png'],
    [1,'charge-burst',1.48,'27-retarget-finisher.png',1,{right:true}],[3,'frost-waves',1.18,'28-frost-waves.png'],
    [9,'rift-collapse',1.4,'29-rift-collapse.png',2],
  ];
  for(const [stage,id,seconds,file,phase=1,controls={}] of poses){
    const hazards=await evaluate(`__qa.fixture.patternPose(${stage},${JSON.stringify(id)},${seconds},${phase},${JSON.stringify(controls)})`);
    const ui=await evaluate('({warning:document.getElementById("hud-warning").textContent,progress:document.getElementById("hud-cast-progress").textContent})');
    const next=hazards.filter(h=>h.phase==='warn').sort((a,b)=>a.remaining-b.remaining)[0];
    const expected=next?Math.floor(next.progress*100):100;
    check(`${id} ${seconds}s: 충전/발동 상태와 HUD 일치`,hazards.length>0&&hazards.every(h=>h.phase!=='active'||h.progress===1)&&Number(ui.progress.match(/\d+/)?.[0])===expected,{hazards,ui});
    await shot(out,file);
  }
  // Real raid programs, with a frozen capture clock and synthetic survival only.
  for(let stage=0;stage<20;stage++){
    const pose=await evaluate(`__qa.fixture.raidPose(${stage},0,.7)`);
    check(`${stage+1}보스 대형 기믹: 단계·대응·강인함 HUD`,await evaluate('!document.getElementById("hud-raid").hidden && document.getElementById("hud-raid-round").textContent.includes(`1 / ${__qa.app.run.boss.raid.total}`) && document.getElementById("hud-raid-hint").textContent===__qa.app.run.boss.raid.hint && document.getElementById("hud-raid").textContent.includes("20%")'));
    if(pose.pressure.some(h=>h.phase==='active')&&pose.hazards.every(h=>h.phase==='warn'))check('기믹 본체 충전 중 별도 견제 발동 HUD',await evaluate('document.getElementById("hud-warning").textContent.includes("기믹 견제")'));
    if(!pose.hazards.length){
      check(`${pose.kind}: 위치 암기 또는 정면 반격 자세`,await evaluate('(__qa.app.run.boss.raid.memory?.length===3)||__qa.app.run.boss.raid.counterWindow'));
      continue;
    }
    const pixels=await evaluate(`(async()=>{
      const {drawHazard}=await import('/src/render.mjs');const {hazardHitsCircle}=await import('/src/game.mjs');
      const hazards=__qa.app.run.hazards,c=document.createElement('canvas');c.width=1280;c.height=720;
      const g=c.getContext('2d',{willReadFrequently:true});
      const count=(progress,reduced=false)=>{g.clearRect(0,0,1280,720);for(const h of hazards)drawHazard(g,{...h,t:h.windup*progress,phase:'warn'},0,reduced);
        const data=g.getImageData(0,0,1280,720).data;let n=0;for(let i=3;i<data.length;i+=4)n+=data[i]/255;return n;};
      const early=count(.25),late=count(.75),reduced=count(.75,true);
      let safe=null;for(let y=32;y<700&&!safe;y+=24)for(let x=32;x<1260;x+=24)if(hazards.every(h=>!hazardHitsCircle(h,x,y,24))){safe={x,y};break;}
      return {early,late,reduced,safe,gaze:hazards.some(h=>h.gaze),empty:safe&&g.getImageData(safe.x,safe.y,1,1).data[3]===0};
    })()`);
    check(`${pose.kind}: 실제 대형 범위 충전 · 안전 공간 비움 · 모션 감소 유지`,(pixels.gaze?pixels.late<5000:pixels.late>pixels.early&&pixels.empty)&&pixels.late===pixels.reduced,pixels);
    if(stage<3)await shot(out,['34-raid-corridor.png','35-raid-in-out.png','36-raid-carousel.png'][stage]);
  }
  for(const [stage,round,phase,file] of [[1,1,1,'37-raid-outside.png'],[2,1,1,'38-raid-turn.png'],[7,2,1,'39-raid-miasma-finale.png'],[19,3,2,'40-raid-phase-two.png']]){
    const pose=await evaluate(`__qa.fixture.raidPose(${stage},${round},.7,${phase})`);
    check(`${stage+1}보스 기믹 ${round+1}번째: 새 예고와 갱신된 지시`,pose.round===round&&pose.hazards.every(h=>h.phase==='warn')&&Math.max(...pose.hazards.map(h=>h.progress))>=.7&&Math.max(...pose.hazards.map(h=>h.progress))<1&&await evaluate('document.getElementById("hud-raid-hint").textContent===__qa.app.run.boss.raid.hint'));
    await shot(out,file);
  }
  for(const [stage,round,file] of [[0,0,'41-raid-impact.png'],[2,1,'42-raid-rotation-impact.png']]){
    const pose=await evaluate(`__qa.fixture.raidPose(${stage},${round},1)`);
    check('대형 기믹: 100%에서만 발동 · 실제 충격 이펙트',pose.hazards.every(h=>h.phase==='active'&&h.progress===1)&&await evaluate('__qa.app.run.particles.some(p=>p.type==="bossImpact")'));
    await shot(out,file);
  }
  // Leave enough remaining warning time to test pause/resume, not a terminal hit.
  await evaluate('__qa.fixture.raidPose(0,0,.4);');
  await evaluate('__qa.fixture.freezeTime(false)');
  await click('#pause-button');await wait('pause');
  const raidPaused=await snap();await sleep(100);
  check('대형 기믹 도중 정지: 시계·단계·RAF 정지',(await snap()).run.time===raidPaused.run.time&&(await snap()).run.boss.raid.round===raidPaused.run.boss.raid.round&&(await snap()).pendingRaf===0);
  await click('#resume-button');await wait('battle');await sleep(100);
  check('대형 기믹 재개: 시계 복구 · 입력 누수 없음',(await snap()).run.time>raidPaused.run.time&&await evaluate('!__qa.app.input.attack&&!__qa.app.input.dodge'));
  await evaluate('__qa.fixture.loadRun({classId:"warrior",weaponId:"sword"})');
  await evaluate('__qa.fixture.setPlayerHp(18); __qa.app.run.player.hurtFlash=.25; __qa.app.run.feedback.shake=1');
  await sleep(60);
  let s = await snap();
  check('저체력 신호 + 실제 카메라 흔들림', s.lowHealth === 'true' && s.shake.some((n) => Math.abs(n) > .01), { low: s.lowHealth, shake: s.shake });
  await shot(out, '11-danger.png');
  await click('#pause-button');
  await wait('pause');
  await click('#pause-motion');
  await click('#resume-button');
  await evaluate('__qa.app.run.feedback.shake=1; __qa.app.run.player.hurtFlash=.25');
  await sleep(35);
  s = await snap();
  check('모션 감소: 흔들림 제거, 위험 신호 유지', s.reducedMotion && s.shake.every((n) => n === 0) && s.lowHealth === 'true');

  // Test non-16:9 letterboxing and HiDPI with actual pointer dispatch, not a mocked mapping.
  await evaluate('__qa.app.run.boss.timer=1000; __qa.app.run.boss.def={...__qa.app.run.boss.def,speed:0}; __qa.fixture.setPlayerHp(100)');
  await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 2, mobile: false });
  await sleep(100);
  const target = await evaluate('__qa.app.worldToScreen(850,420)');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y, button: 'none' });
  const aim = await evaluate('({x:__qa.app.input.aimX,y:__qa.app.input.aimY,w:__qa.app.view.width,h:__qa.app.view.height})');
  check('resize/DPR2 후 마우스 조준 일치', Math.abs(aim.x - 850) < 1 && Math.abs(aim.y - 420) < 1 && aim.w === 2730 && aim.h === 1800, aim);
  await shot(out, '12-resized.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(100);

  let rewards = 0;
  for (let stage = 0; stage < 20; stage++) {
    if([4,9,14].includes(stage)){
      await evaluate('__qa.fixture.setBossHp(__qa.app.run.boss.maxHp*.49)');await sleep(70);
      check(`${stage+1} 특수 보스 2페이즈 전환`,(await snap()).run.boss.phase===2);
    }
    if (stage === 19) {
      await evaluate('__qa.fixture.setBossHp(__qa.app.run.boss.maxHp*.66)');
      await sleep(70);
      s = await snap();
      check('최종 보스 67%에서 2페이즈', s.run.boss.phase === 2);
      await evaluate('__qa.fixture.setBossHp(__qa.app.run.boss.maxHp*.32)'); await sleep(70); s=await snap();
      check('최종 보스 33%에서 3페이즈 · HUD',s.run.boss.phase===3&&await evaluate('document.getElementById("hud-boss-title").textContent.includes("PHASE III")'));
      await shot(out, '13-final-phase.png');
    }
    if (stage === 0) {
      await send('Input.dispatchKeyEvent', {type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
      const point = await evaluate('({x:innerWidth/2,y:innerHeight/2})');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point });
    }
    await evaluate('__qa.fixture.killBoss()');
    if(stage<19){
      const cleared=await wait('clear');
      check(`${stage+1}보스: 카드 이전 클리어 화면`,cleared.run.stage===stage&&cleared.run.status==='reward'&&await evaluate('document.getElementById("screen-reward").hidden&&document.getElementById("clear-boss").textContent===__qa.app.run.boss.def.name'));
    }
    s = await wait(stage === 19 ? 'won' : 'reward');
    if (stage === 0) {
      const rect = await evaluate('(()=>{const r=document.querySelector(".reward-card").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...rect });
      s = await snap();
      check('팝업 전 Enter·마우스 누름 해제: 카드 선택 누수 차단', s.screen === 'reward' && s.pendingCard === null);
      const delayedMouseRect = await evaluate(`(()=>{const r=document.querySelector('.reward-card').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      // Start this independent gesture-boundary check with a fresh guard; earlier CDP calls consume wall time.
      await evaluate('__qa.app.rewardAt=performance.now()');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, autoRepeat: true });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, autoRepeat: true });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, autoRepeat: true });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...delayedMouseRect });
      check('가드 안에서 각 입력 시작 확인',await evaluate('__qa.app.blockedPointer&&["Enter","Space","Digit1"].every(k=>__qa.app.blockedKeys.has(k))'));
      await sleep(650);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...delayedMouseRect });
      check('게이트 중 시작한 Enter/Space-repeat/마우스: 해제 후에도 선택 거부', (await snap()).screen === 'reward',await evaluate('({screen:__qa.app.screen,card:__qa.app.pendingCard,blocked:[...__qa.app.blockedKeys]})'));
      await evaluate('window.dispatchEvent(new Event("blur"))');
      check('포커스 이탈로 잃은 keyup: 보상 입력 잠금 해제',await evaluate('__qa.app.heldKeys.size===0&&__qa.app.blockedKeys.size===0'));
    }
    check(`${stage + 1}보스 종료 · 위험 정리`, s.run.hazards.length === 0 && s.run.projectiles === 0 && s.run.stage === stage);
    if (stage === 19) break;
    rewards++;
    const offers = s.run.offers;
    check(`${stage + 1}보스 카드 3개 · 중복 없음`, offers.length === 3 && new Set(offers).size === 3 && s.activeClass === 'reward-card');
    if (stage === 0) await shot(out, '14-cards.png');
    const hpBefore = s.run.player.hp;
    const id = offers[stage % 3];
    await evaluate(`window.__oldReward = document.querySelector('[data-card-id="${id}"]')`);
    await sleep(650);
    if(stage===0)await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    await click(`[data-card-id="${id}"]`);
    s = await wait('briefing');
    if(stage===0){check('이동 키를 누른 채 새 카드 클릭 가능',s.pendingCard===id);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});}
    const total = Object.values(s.previewCards).reduce((a, b) => a + b, 0);
    check(`${stage + 1}보상 → 분리된 미리보기, 원본 미변경`, s.run.stage === stage && s.previewStage === stage + 1 && total === rewards && s.run.player.hp === hpBefore && s.pendingCard === id);
    check(`${stage + 2}보스 소개 내용 일치`, await evaluate('(async()=>{const r=__qa.app.rewardPreview,info=(await import("/src/encounters.mjs")).ENCOUNTER_INFO[r.stage];return document.getElementById("briefing-boss-name").textContent===r.boss.def.name && document.getElementById("briefing-hint").textContent===r.boss.def.hint && document.getElementById("briefing-patterns").children.length===3 && document.getElementById("briefing-raid-name").textContent===[r.boss.def.signature.name,info?.name].filter(Boolean).join(" · ") && (document.getElementById("briefing-raid-hint").textContent===r.boss.def.signature.hint+(info?" "+info.hint:""));})()'));
    await click('#briefing-back');
    check('소개 뒤로: 같은 카드 제안 유지 · 미리보기 폐기', (await snap()).screen === 'reward' && JSON.stringify((await snap()).run.offers) === JSON.stringify(offers) && (await snap()).pendingCard === null);
    const reselected = offers[(stage + 1) % 3];
    await sleep(650); await click(`[data-card-id="${reselected}"]`); s = await wait('briefing');
    const expectedHp = s.previewPlayer.hp;
    if(stage===0)await shot(out,'32-next-boss.png');
    if(stage===18){
      await send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});await sleep(70);
      check('1365×768 최종 소개: 19카드·버튼 잘림 없음',await evaluate('(()=>{const p=document.querySelector(".briefing-panel"),r=p.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&p.scrollHeight<=p.clientHeight;})()'));
      await shot(out,'33-final-briefing-1365.png');
      await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await sleep(70);
    }
    await enterBattle(); s=await snap();
    check('보상 재선택 후 시작: 카드·회복 1회 확정', s.run.stage === stage + 1 && Object.values(s.run.cards).reduce((a,b)=>a+b,0) === rewards && s.run.player.hp === Math.min(s.run.player.maxHp, expectedHp));
  }
  s = await snap();
  check('19회 보상·20보스 완주·21스테이지 없음', rewards === 19 && s.screen === 'won' && s.run.stage === 19 && s.active === 'won-restart');
  await shot(out, '15-victory.png');
  await click('#won-restart');
  s = await wait('start');
  check('완주 후 런·카드 초기화', s.run === null && s.pendingRaf <= 1);
  await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 768, deviceScaleFactor: 1, mobile: false });
  await sleep(70);
  check('1365×768 선택 화면 가로 넘침 없음', await evaluate('document.querySelector(".start-shell").getBoundingClientRect().right<=innerWidth'));
  await shot(out, '16-menu-1365.png');
  await click('#start-button'); await wait('briefing');
  await click('#briefing-menu'); await wait('start'); await sleep(70);
  check('소개 화면에서 런 포기 · 런 참조/RAF 해제', (await snap()).run===null && (await snap()).pendingRaf===0);
  const listenersBefore=await evaluate('JSON.stringify(__qa.listenerCounts)');
  for(let i=0;i<3;i++)await evaluate('__qa.fixture.cycle()');
  await sleep(70);
  check('소개 포함 3회 재시작 · listener/RAF 누적 없음',listenersBefore===await evaluate('JSON.stringify(__qa.listenerCounts)') && (await snap()).screen==='start' && (await snap()).run===null && (await snap()).pendingRaf===0);
  // Fixture entry wiring only; no frame-time/GPU claim from this headless check.
  await evaluate('__qa.fixture.freezeTime(true); __qa.startLoad("final-build")'); await sleep(100);
  s=await snap();
  check('부하 fixture: 소개 후 실제 시계 복구 · 최종 보스/19카드 HUD',s.screen==='battle'&&s.run.stage===19&&s.run.time>.05&&Object.values(s.run.cards).reduce((a,b)=>a+b,0)===19&&await evaluate('document.querySelectorAll("#hud-build .build-chip").length===8 && document.getElementById("hud-stage").textContent.includes("20 / 20")'));
  await evaluate('__qa.stopLoad()');
  return results;
}

export async function runTutorial(page,out) {
  const {results,evaluate,check,snap,until,wait,click,shot}=harness(page),{send}=page;
  const key=(code,type)=>{
    const [value,vk]={KeyW:['w',87],KeyA:['a',65],KeyD:['d',68],Space:[' ',32],Enter:['Enter',13],Escape:['Escape',27]}[code];
    const text=code==='Enter'?'\r':code==='Space'?' ':null;
    return send('Input.dispatchKeyEvent',{type,code,key:value,windowsVirtualKeyCode:vk,...(type==='keyDown'&&text?{text,unmodifiedText:text}:{})});
  };
  const fire=async pressed=>{
    const point=await evaluate('__qa.app.worldToScreen(__qa.app.run.boss.x,__qa.app.run.boss.y)');
    await send('Input.dispatchMouseEvent',{type:pressed?'mousePressed':'mouseReleased',button:'left',buttons:pressed?1:0,clickCount:1,...point});
  };
  await wait('home');await click('#home-start');await wait('start');
  const seed=await evaluate('__qa.app.nextSeed'),listeners=await evaluate('JSON.stringify(__qa.listenerCounts)');
  const options=await evaluate('[...document.querySelectorAll(".choice")].map(b=>({cls:b.dataset.classId,weapon:b.dataset.weaponId}))');
  for(const o of options){
    await click(`.class-choice[data-class-id="${o.cls}"]`);await click(`.choice[data-weapon-id="${o.weapon}"]`);
    await click('#practice-button');await wait('battle');
    await until('document.getElementById("tutorial-class-tip").textContent.startsWith(__qa.app.run.cls.name+":")');
    check(`${o.weapon}: 선택 장비 연습 · 직업 회피 설명 · 진입 입력 유출 없음`,await evaluate(`(()=>{const a=__qa.app,r=a.run;return r.weapon.id===${JSON.stringify(o.weapon)}&&!!r.tutorial&&r.stageCount===1&&!document.getElementById('tutorial-guide').hidden&&document.getElementById('tutorial-class-tip').textContent.startsWith(r.cls.name+':')&&!a.input.attack&&!a.input.dodge&&r.player.dodgeCooldown===0;})()`));
    await click('#tutorial-exit');await wait('start');
  }
  await click('.class-choice[data-class-id="warrior"]');await click('.choice[data-weapon-id="sword"]');
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});await sleep(80);
  check('1365×768: 입장/연습 버튼 모두 화면 안',await evaluate('["start-button","practice-button"].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;})'));
  await shot(out,'00-practice-button.png');
  await evaluate('document.getElementById("practice-button").focus()');await key('Enter','keyDown');await key('Enter','keyUp');await wait('battle');
  await until('document.getElementById("tutorial-heading").textContent.startsWith("1 / 3")');
  check('1365×768: 연습 안내/종료 버튼 잘림 없음',await evaluate('(()=>{const r=document.getElementById("tutorial-guide").getBoundingClientRect(),e=document.getElementById("tutorial-exit").getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&e.bottom<=r.bottom;})()'));
  await shot(out,'01-practice-movement.png');
  await key('KeyW','keyDown');await until('__qa.app.run.tutorial.walked>=60');await key('KeyW','keyUp');
  check('실제 WASD 이동 → 공격 안내',await until('document.getElementById("tutorial-heading").textContent.startsWith("2 / 3")'));
  await fire(true);await until('__qa.app.run.tutorial.attacked');await sleep(2300);await fire(false);
  check('실제 명중 → 회피 안내 · 회피 전 조기 처치 방지',await evaluate('__qa.app.screen==="battle"&&__qa.app.run.boss.hp===1&&document.getElementById("tutorial-heading").textContent.startsWith("3 / 3")'));
  await shot(out,'02-practice-dodge.png');
  await key('KeyA','keyDown');await key('Space','keyDown');await until('__qa.app.run.tutorial.dodged');await key('Space','keyUp');await key('KeyA','keyUp');
  check('실제 Space 회피 → 마무리 안내',await until('document.getElementById("tutorial-heading").textContent.includes("쓰러뜨리세요")'));
  await until('__qa.app.run.player.dodgeTime===0');
  await key('KeyD','keyDown');await until('Math.abs(__qa.app.run.player.x-__qa.app.run.boss.x)<60');await key('KeyD','keyUp');
  await fire(true);await wait('practice-done');await fire(false);await sleep(80);
  let s=await snap();const finished=s.run.time;
  check('실제 보스 처치 → 연습 완료 · 캠페인 승리/카드 없음',s.run.status==='won'&&s.active==='practice-return'&&s.run.offers.length===0&&Object.keys(s.run.cards).length===0&&await evaluate('document.getElementById("screen-won").hidden&&document.getElementById("screen-reward").hidden'));
  await shot(out,'03-practice-done.png');await sleep(100);s=await snap();
  check('완료 화면: 시간/RAF 정지',s.run.time===finished&&s.pendingRaf===0);
  await click('#practice-return');await wait('start');await sleep(60);
  check('복귀: 선택 유지 · 런/RAF 해제 · 실전 seed 보존',await evaluate(`__qa.app.selection.weaponId==='sword'&&__qa.app.run===null&&__qa.app.nextSeed===${seed}`)&&(await snap()).pendingRaf===0);
  await click('#practice-button');await wait('battle');await key('KeyW','keyDown');await fire(true);
  await until('__qa.app.input.up&&__qa.app.input.attack');await evaluate('window.dispatchEvent(new Event("blur"))');await wait('pause');
  await key('KeyW','keyUp');await fire(false);
  const paused=(await snap()).run.time;await sleep(100);
  check('연습 blur: 정지/입력 초기화 · 연습 전용 설명',paused===(await snap()).run.time&&await evaluate('!__qa.app.input.up&&!__qa.app.input.attack&&!document.getElementById("pause-tutorial-help").hidden&&document.getElementById("pause-combat-help").hidden&&document.getElementById("pause-tutorial-help").textContent.includes("WASD")'));
  await click('#resume-button');await wait('battle');await sleep(100);
  const x=(await snap()).run.player;await sleep(100);s=await snap();
  check('연습 재개: 유령 이동/공격 없음 · RAF 하나',s.run.player.x===x.x&&s.run.player.y===x.y&&s.pendingRaf===1&&await evaluate('!__qa.app.input.attack'));
  await key('KeyW','keyDown');await fire(true);await click('#tutorial-exit');await wait('start');await key('KeyW','keyUp');
  await evaluate('document.getElementById("practice-button").focus()');await key('Space','keyDown');await key('Space','keyUp');await wait('battle');await sleep(100);
  check('누른 채 종료/Space 재진입: 안내·체력·입력 초기화',await evaluate('(()=>{const a=__qa.app,r=a.run;return r.tutorial.walked===0&&!r.tutorial.attacked&&!r.tutorial.dodged&&r.player.hp===r.player.maxHp&&!a.input.up&&!a.input.attack&&r.player.dodgeCooldown===0;})()'));
  await key('Escape','keyDown');await key('Escape','keyUp');await wait('pause');await click('#pause-menu');await wait('start');await sleep(80);
  check('반복 연습: listener/RAF 누적 없음',listeners===await evaluate('JSON.stringify(__qa.listenerCounts)')&&(await snap()).pendingRaf===0);
  await click('#start-button');await wait('briefing');
  check('연습 뒤 실전은 기존 첫 보스/직업별 체력/빈 각인/소개',await evaluate('(()=>{const r=__qa.app.run;return !r.tutorial&&r.stage===0&&r.stageCount===20&&r.player.hp===r.player.maxHp&&r.boss.def.id==="iron-warden"&&Object.keys(r.cards).length===0;})()'));
  await click('#briefing-start');await wait('battle');await sleep(60);
  check('실전 HUD 복원: 연습 숨김 · 진행20개 · 자기장 안내',await evaluate('document.getElementById("tutorial-guide").hidden&&!document.getElementById("stage-track").hidden&&document.getElementById("stage-track").children.length===20&&document.getElementById("hud-storm").textContent.includes("전장 개방")'));
  return results;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] || 0;
}
function summary(data) {
  const elapsed = data.intervals.reduce((a, b) => a + b, 0);
  return {
    frames: data.intervals.length,
    fps: data.intervals.length / (elapsed / 1000),
    frameP95: percentile(data.intervals, .95), frameP99: percentile(data.intervals, .99),
    stallsPercent: data.intervals.filter((n) => n > 33.34).length / data.intervals.length * 100,
    cpuP95: percentile(data.cpu, .95), cpuP99: percentile(data.cpu, .99),
    unfocusedFrames: data.unfocusedFrames, max: data.max,
  };
}

export async function runPerformance(page, report) {
  const { results, evaluate, check, wait, click } = harness(page);
  const { send } = page;
  const info = report.system.gpu;
  const gpuText = JSON.stringify(info);
  const gpuHardware = /Apple M4|Metal Renderer/i.test(gpuText)
    && !/SwiftShader|llvmpipe/i.test(JSON.stringify(info.devices))
    && info.featureStatus?.gpu_compositing === 'enabled' && info.featureStatus?.['2d_canvas'] === 'enabled';
  const hardwareReady = report.headed && report.focusEmulated === false && gpuHardware;
  check('실제 headed Chrome / Apple GPU / 비모의 포커스', hardwareReady, { devices: info.devices, featureStatus: info.featureStatus });
  if (!hardwareReady) throw new Error('Performance QA requires --headed, real Apple GPU, and no focus emulation.');
  console.log('15초 안에 QA Chrome 창을 클릭해 활성화하고, 측정이 끝날 때까지 전경을 유지하세요.');
  const focusDeadline = Date.now() + 15000;
  while (!await evaluate('document.hasFocus() && document.visibilityState === "visible"')) {
    if (Date.now() >= focusDeadline) throw new Error('QA Chrome window was not activated. Foreground performance remains unverified.');
    await sleep(250);
  }
  const foregroundFor = async (milliseconds) => {
    const until = Date.now() + milliseconds;
    do {
      const state = await evaluate('({focus:document.hasFocus(),visibility:document.visibilityState,screen:__qa.app.screen})');
      if (!state.focus || state.visibility !== 'visible' || state.screen !== 'battle') {
        throw new Error(`Performance measurement stopped: keep the QA Chrome window in foreground. ${JSON.stringify(state)}`);
      }
      if (Date.now() >= until) return;
      await sleep(Math.min(1000, until - Date.now()));
    } while (true);
  };
  if(await evaluate('__qa.app.screen==="home"'))await click('#home-start');
  report.workloads = [];
  for (const workload of ['final-build', 'caps']) {
    await wait('start');
    await evaluate("if(document.getElementById('start-motion').checked) document.getElementById('start-motion').click()");
    await evaluate(`__qa.startLoad(${JSON.stringify(workload)})`);
    console.log(`WARMUP ${workload} 30s`);
    await foregroundFor(30000);
    await evaluate('__qa.startMeasure()');
    console.log(`MEASURE ${workload} 180s`);
    await foregroundFor(180000);
    const raw = await evaluate('__qa.finishMeasure()');
    const stats = summary(raw);
    const dimensions = await evaluate('[innerWidth,innerHeight,devicePixelRatio,document.getElementById("game").width,document.getElementById("game").height]');
    report.workloads.push({ name: workload, warmupSeconds: 30, measureSeconds: 180, syntheticSurvival: true, description: workload === 'caps' ? 'Synthetic ceiling scene: 32 hazards, up to 256 projectiles, 512 particles' : 'Final boss natural patterns, nine legal capped upgrades, lightning weapon; health replenished for sustained load', dimensions, stats, raw });
    check(`${workload}: 1920×1080/DPR1`, JSON.stringify(dimensions) === '[1920,1080,1,1920,1080]', dimensions);
    check(`${workload}: 60fps 예산`, stats.frames > 9000 && stats.fps >= 58 && stats.frameP95 <= 18.5 && stats.frameP99 <= 25 && stats.stallsPercent < 1 && stats.cpuP95 < 10 && stats.unfocusedFrames === 0, stats);
    await evaluate('__qa.stopLoad()');
  }
  await wait('start');
  // GC and lifecycle sampling are deliberately outside FPS timing windows.
  for (let i = 0; i < 5; i++) await evaluate('__qa.fixture.cycle()');
  await send('HeapProfiler.collectGarbage');
  const before = await send('Runtime.getHeapUsage');
  const listenersBefore = await evaluate('({...__qa.listenerCounts})');
  for (let i = 0; i < 30; i++) await evaluate('__qa.fixture.cycle()');
  await send('HeapProfiler.collectGarbage');
  const after = await send('Runtime.getHeapUsage');
  const listenersAfter = await evaluate('({...__qa.listenerCounts})');
  const state = await evaluate('__qa.snapshot()');
  const growth = after.usedSize - before.usedSize;
  report.memory = { warmupCycles: 5, measuredCycles: 30, before, after, growth, listenersBefore, listenersAfter };
  check('30회 재시작: retained heap 안정', growth <= Math.max(2 * 1024 * 1024, before.usedSize * .2), report.memory);
  check('재시작 후 listener/RAF/런 누적 없음', JSON.stringify(listenersBefore) === JSON.stringify(listenersAfter) && state.pendingRaf === 0 && state.run === null && state.screen === 'start', { listenersAfter, pendingRaf: state.pendingRaf, screen: state.screen });
  return results;
}
