// Real Web Audio graph taps on an isolated QA page; no production debug API.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runAudio({ send }, out) {
  const results = [];
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const check = (name, pass, detail) => { results.push({ name, pass: Boolean(pass), detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`); };
  const until = async expression => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(20); }
    throw new Error(`Timeout: ${expression}`);
  };
  const click = async selector => {
    const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, ...point });
  };
  const key = async (key, code, vk) => {
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk });
  };
  const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(out, name), Buffer.from(data, 'base64')); };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__audioProbe={contexts:[],timers:new Set()};
    const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
    window.setInterval=(...args)=>{const id=interval(...args);__audioProbe.timers.add(id);return id;};
    window.clearInterval=id=>{__audioProbe.timers.delete(id);clear(id);};
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(...args){
        super(...args);
        const record={context:this,live:new Set(),starts:0,history:[],gains:[],meters:[]};__audioProbe.contexts.push(record);
        const gain=this.createGain.bind(this),sink=gain();sink.gain.value=0;sink.connect(this.destination);
        // First three gains are master/music/effects; taps feed a zero-gain measurement sink.
        this.createGain=()=>{const node=gain();if(record.gains.length<3){const meter=this.createAnalyser();meter.fftSize=2048;node.connect(meter);meter.connect(sink);record.gains.push(node);record.meters.push(meter);}return node;};
        for(const name of ['createOscillator','createBufferSource']){
          const create=this[name].bind(this);this[name]=()=>{const node=create(),start=node.start.bind(node),disconnect=node.disconnect.bind(node);
            node.start=(...args)=>{record.starts++;record.live.add(node);record.history.push({node,at:this.currentTime,offset:args[1]||0,duration:node.buffer?.duration||0});return start(...args);};
            node.disconnect=(...args)=>{record.live.delete(node);return disconnect(...args);};
            node.addEventListener('ended',()=>record.live.delete(node));return node;
          };
        }
      }
    };
    __audioProbe.snapshot=()=>({contexts:__audioProbe.contexts.length,timers:__audioProbe.timers.size,...(__audioProbe.contexts[0]?(()=>{const r=__audioProbe.contexts[0];return {state:r.context.state,starts:r.starts,live:r.live.size,gains:r.gains.map(g=>g.gain.value),signal:r.meters.map(m=>{const data=new Float32Array(m.fftSize);m.getFloatTimeDomainData(data);return {peak:Math.max(...data.map(Math.abs)),rms:Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length)};})};})():{})});
  ` });
  await send('Page.reload');
  await until('Boolean(window.__qa && window.__audioProbe && document.body.dataset.screen==="home")');
  check('첫 진입은 무음 · AudioContext/음악 타이머 생성 없음', await evaluate('__audioProbe.contexts.length===0&&__audioProbe.timers.size===0'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 768, deviceScaleFactor: 1, mobile: false });
  check('1365×768 홈 음량·음소거: 화면 안 · 접근성 이름', await evaluate('[...document.querySelectorAll("#screen-home .audio-controls input,#screen-home .audio-controls button")].every(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&(el.textContent||el.getAttribute("aria-label"));})'));
  await shot('01-audio-home.png');
  await click('#home-start');
  await until('__audioProbe.contexts[0]?.context.state==="running"');
  await until('__audioProbe.snapshot().signal[1].rms>.0001');
  let audio = await evaluate('__audioProbe.snapshot()');
  check('실제 클릭: 메뉴 BGM 신호 · 렌더 RAF 없이 재생', audio.contexts === 1 && audio.timers === 0 && audio.signal[1].rms > .0001 && await evaluate('__qa.snapshot().pendingRaf===0'), audio);
  await click('#start-button'); await until('__qa.app.screen==="briefing"');
  await click('#briefing-start'); await until('__qa.app.screen==="battle"');
  const loadouts = await evaluate('import("/src/content.mjs").then(({CLASSES})=>CLASSES.flatMap(c=>c.weapons.map(w=>({classId:c.id,weaponId:w.id}))))');
  for (const o of loadouts) {
    await evaluate(`__qa.fixture.loadRun(${JSON.stringify(o)});__qa.fixture.quietBoss();__qa.app.run.player.x=640;__qa.app.run.player.y=__qa.app.run.boss.y+__qa.app.run.boss.def.radius+25;__qa.app.stageAt=-2`);
    await sleep(70);
    const point = await evaluate('__qa.app.worldToScreen(__qa.app.run.boss.x,__qa.app.run.boss.y)');
    const before = await evaluate('__audioProbe.snapshot().starts');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point });
    let peak = 0, hit = false;
    for (let i = 0; i < 70; i++) {
      const data = await evaluate('({hit:__qa.app.run.boss.hp<__qa.app.run.boss.maxHp,peak:__audioProbe.snapshot().signal[2].peak})');
      peak = Math.max(peak, data.peak); hit = data.hit;
      if (hit && peak > .001) break;
      await sleep(25);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point });
    check(`${o.weaponId}: 실제 공격·명중 → 효과음 파형`, hit && peak > .001 && await evaluate(`__audioProbe.snapshot().starts>${before}`), { peak });
  }
  for (const classId of ['warrior', 'archer', 'mage', 'gunslinger', 'fighter']) {
    await evaluate(`__qa.fixture.loadRun({classId:${JSON.stringify(classId)}});__qa.fixture.quietBoss()`);
    await sleep(350);
    await key(' ', 'Space', 32); await sleep(45);
    audio = await evaluate('__audioProbe.snapshot()');
    check(`${classId}: 승인된 회피 → 직업별 효과음`, audio.signal[2].peak > .001 && await evaluate('__qa.app.run.player.dodgeCooldown>0'), { peak: audio.signal[2].peak });
  }
  await evaluate('__qa.fixture.loadRun({});__qa.fixture.quietBoss();__qa.app.run.hazards.push({shape:"circle",x:640,y:580,radius:100,phase:"active",t:0,windup:0,active:.15,damage:20,hitDone:false})');
  await sleep(70); audio = await evaluate('__audioProbe.snapshot()');
  check('실제 피격: 효과음 + BGM 잠깐 낮추기', audio.signal[2].peak > .001 && audio.gains[1] < .48 && await evaluate('__qa.app.run.player.hp<__qa.app.run.player.maxHp'), audio);
  await evaluate('__qa.app.run.player.hp=20'); await sleep(1500); audio = await evaluate('__audioProbe.snapshot()');
  check('저체력 관현악 BGM: 실제 신호 · 출력 상한 · 컨텍스트 하나/반복 타이머 없음', audio.signal[1].rms > .0001 && audio.signal[0].peak < 1 && audio.live <= 64 && audio.contexts === 1 && audio.timers === 0, audio);
  await key('Escape', 'Escape', 27); await until('__qa.app.screen==="pause"'); await sleep(150);
  audio = await evaluate('__audioProbe.snapshot()');
  check('Esc 정지: 예약 음원까지 제거 · 무음 · 음악 타이머 없음', audio.live === 0 && audio.timers === 0 && audio.signal[0].peak === 0, audio);
  await shot('02-audio-pause.png');
  await click('#screen-pause [data-audio-mute]'); await click('#resume-button'); await sleep(250);
  check('음소거 후 전투 복귀: 무음 유지', await evaluate('__audioProbe.snapshot().live===0&&__audioProbe.snapshot().timers===0&&[...document.querySelectorAll("[data-audio-mute]")].every(b=>b.getAttribute("aria-pressed")==="true")'));
  await key('Escape', 'Escape', 27); await click('#screen-pause [data-audio-mute]');
  await evaluate('const slider=document.querySelector("#screen-pause [data-audio-volume]");slider.value="25";slider.dispatchEvent(new Event("input",{bubbles:true}))');
  await click('#resume-button'); await sleep(200);
  check('음소거 해제·음량 동기화: 컨텍스트 재생성 없음', await evaluate('__audioProbe.snapshot().contexts===1&&Math.abs(__audioProbe.snapshot().gains[0]-.25)<.01&&[...document.querySelectorAll("[data-audio-volume]")].every(s=>s.value==="25")'));
  await evaluate('window.dispatchEvent(new Event("blur"))'); await sleep(150);
  check('포커스 이탈: BGM/SFX/타이머 모두 정지', await evaluate('__qa.app.screen==="pause"&&__audioProbe.snapshot().live===0&&__audioProbe.snapshot().timers===0'));
  await evaluate('window.dispatchEvent(new Event("focus"))'); await click('#resume-button'); await sleep(150);
  check('포커스 복귀·수동 재개: 버퍼 음악 재생 · 반복 스케줄러 없음', await evaluate('__audioProbe.snapshot().contexts===1&&__audioProbe.snapshot().timers===0&&__audioProbe.snapshot().signal[1].rms>.0001'));
  await evaluate('Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});document.dispatchEvent(new Event("visibilitychange"))'); await sleep(100);
  check('숨긴 탭도 무음', await evaluate('__audioProbe.snapshot().timers===0&&__audioProbe.snapshot().live===0'));
  await evaluate('delete document.visibilityState;document.dispatchEvent(new Event("visibilitychange"))'); await click('#resume-button');

  for (const [stage, rarity, label] of [[4, 'unique', '유니크'], [9, 'berserk', '버서크']]) {
    await evaluate(`__qa.fixture.loadRun({stage:${stage},classId:'warrior',seed:12});${rarity === 'berserk' ? "__qa.app.run.cards['throw-master']=1;__qa.app.run.cards['one-cut']=1;" : ''}__qa.fixture.killBoss()`);
    await until('__qa.app.screen==="clear"');await sleep(100);
    const cue=await evaluate('(()=>{const r=__audioProbe.contexts[0],h=r.history.findLast(h=>h.duration>1.19&&h.duration<1.21);window.__victoryProbe=h?.node;return {duration:h?.duration,live:r.live.has(h?.node),signal:__audioProbe.snapshot().signal[1]};})()');
    check('격파 즉시 약1.2초 짧은 승리음 재생',cue.live&&cue.duration>1.19&&cue.duration<1.21&&cue.signal.rms>.005,cue);
    await until('__qa.app.screen==="reward"'); await sleep(650);
    check('보상 진입 후 짧은 승리음 자연 종료',await evaluate('!__audioProbe.contexts[0].live.has(window.__victoryProbe)'));
    const cards = await evaluate('[...document.querySelectorAll(".reward-card")].map(b=>({id:b.dataset.cardId,type:b.dataset.rarity,label:b.querySelector(".card-rarity").textContent}))');
    check(`${stage + 1}보스: ${label} 1 + 일반 2 · 다른 종류 없음`, cards.length === 3 && cards.filter(c => c.type === rarity && c.label.includes(label)).length === 1 && cards.filter(c => c.type === 'normal' && c.label.includes('일반')).length === 2, cards);
    check('1365×768 세 종류 표기·카드 버튼 잘림 없음', await evaluate('[...document.querySelectorAll(".reward-card")].every(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})'));
    await shot(`03-${rarity}-reward.png`);
    const before = await evaluate('JSON.stringify(__qa.app.run.cards)');
    await click(`.reward-card[data-rarity="${rarity}"]`); await until('__qa.app.screen==="briefing"');
    check(`${label} 선택: 미리보기만 적용`, before === await evaluate('JSON.stringify(__qa.app.run.cards)'));
    check('카드 미리보기에서 끝난 승리음 재시작 없음',await evaluate('__audioProbe.contexts[0].history.filter(h=>h.duration>1.19&&h.duration<1.21).at(-1)?.node===window.__victoryProbe'));
    await click('#briefing-back'); await until('__qa.app.screen==="reward"');
    check('뒤로: 추첨 종류·ID 유지', JSON.stringify(cards.map(c => c.id)) === await evaluate('JSON.stringify(__qa.app.run.offers.map(c=>c.id))'));
    check('보상 되돌리기: 승리곡 처음부터 재생하지 않음',await evaluate('__audioProbe.contexts[0].history.filter(h=>h.node===window.__victoryProbe).length===1&&!__audioProbe.contexts[0].live.has(window.__victoryProbe)'));
    await sleep(650); await click(`.reward-card[data-rarity="${rarity}"]`); await click('#briefing-start');
    check(`${label} 확정: 선택한 각인 한 번 적용`, await evaluate(`__qa.app.run.cards[${JSON.stringify(cards.find(c => c.type === rarity).id)}]===1&&__qa.app.run.stage===${stage + 1}`));
  }
  await evaluate('__qa.fixture.loadRun({stage:19});__qa.fixture.killBoss()');await until('__qa.app.screen==="won"');await sleep(150);
  const finale=await evaluate('(()=>{const r=__audioProbe.contexts[0],h=r.history.findLast(h=>h.duration>2.59&&h.duration<2.61);return {live:r.live.has(h?.node),duration:h?.duration,signal:__audioProbe.snapshot().signal[1]};})()');
  check('20보스 최종 승리: 별도2.6초 짧은 피날레 · 실제 신호',finale.live&&finale.signal.rms>.005,finale);
  await shot('04-finale.png');await click('#won-restart');await sleep(150);
  await click('#start-button');await click('#briefing-start');await until('__qa.app.screen==="battle"');
  await evaluate('__qa.fixture.loadRun({});__qa.fixture.setPlayerHp(0)');await until('__qa.app.screen==="dead"');await sleep(70);
  check('실제 사망 전환 뒤에도 충격음 유지',await evaluate('__audioProbe.snapshot().signal[2].peak>.001'));
  await click('#dead-restart');await sleep(150);
  check('새 런/보상 반복 후 오디오 자원 제한 유지', await evaluate('__audioProbe.snapshot().contexts===1&&__audioProbe.snapshot().timers===0&&__audioProbe.snapshot().live<=64&&__qa.snapshot().pendingRaf===0'));
  return results;
}
