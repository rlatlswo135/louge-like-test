// 실브라우저 QA: 설치된 Chrome + Node 내장 WebSocket(CDP), 격리된 임시 프로필.
// Usage: --scenario core|campaign|tutorial|home|audio|performance; performance requires --headed.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_DIR, startServer } from './serve.mjs';
import { createLeaderboard } from './leaderboard.mjs';
import { runCampaign, runTutorial, runPerformance } from './qa-scenarios.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const scenario = arg('--scenario', 'core');
const headed = process.argv.includes('--headed');
const outDir = path.resolve(arg('--out', path.join(os.tmpdir(), 'boss-rush-qa')));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── QA 서버: 제품 public/ + QA 진입 페이지 ───────────────────
async function startQaServer(recordFile) {
  const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const qaHtml = html.replace('<script type="module" src="./src/boot.mjs"></script>', '<script type="module" src="/__qa-entry.mjs"></script>');
  if (qaHtml === html) throw new Error('index.html의 boot 스크립트를 찾지 못했습니다');
  const entry = await readFile(path.join(ROOT, 'tests', 'browser', 'entry.mjs'), 'utf8');
  return startServer({
    port: 0,
    leaderboard:createLeaderboard({file:recordFile}),
    routes: {
      '/__qa.html': async () => ({ body: qaHtml, type: 'text/html; charset=utf-8' }),
      '/__qa-entry.mjs': async () => ({ body: entry, type: 'text/javascript; charset=utf-8' }),
      '/__qa-bot.mjs': async () => ({ body: (await readFile(path.join(ROOT, 'tests', 'bot.mjs'), 'utf8')).replaceAll('../public/src/', '/src/'), type: 'text/javascript; charset=utf-8' }),
    },
  });
}

// ── 최소 CDP 클라이언트 ───────────────────────────────────
function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const waiting = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject, method } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 연결 실패')));
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params, sessionId }));
          return new Promise((res, rej) => waiting.set(id, { resolve: res, reject: rej, method }));
        },
        on(fn) {
          listeners.push(fn);
          return ()=>{const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);};
        },
        close() {
          ws.close();
        },
      }),
    );
  });
}

function launchChrome(profile) {
  const args = [
    ...(headed ? [] : ['--headless=new']),
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1920,1080',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools 시작 시간 초과')), 15000);
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome 종료(code ${code})`));
    });
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
  return { proc, args, ready };
}

// ── 시나리오 ──────────────────────────────────────────────
const KEYS = {
  w: { key: 'w', code: 'KeyW', vk: 87 },
  a: { key: 'a', code: 'KeyA', vk: 65 },
  s: { key: 's', code: 'KeyS', vk: 83 },
  d: { key: 'd', code: 'KeyD', vk: 68 },
  ctrl: { key: 'Control', code: 'ControlLeft', vk: 17, location: 1 },
  esc: { key: 'Escape', code: 'Escape', vk: 27 },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
};

async function runCore(page, out) {
  const results = [];
  const check = (name, pass, detail) => {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  };
  const { send } = page;
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`evaluate 실패: ${r.exceptionDetails.text} ${expression}`);
    return r.result.value;
  };
  const snap = () => evaluate('__qa.snapshot()');
  let modifiers = 0;
  const held = new Set();
  const key = async (name, type) => {
    const k = KEYS[name];
    if (name === 'ctrl') modifiers = type === 'keyDown' ? 2 : 0;
    await send('Input.dispatchKeyEvent', {
      type,
      key: k.key,
      code: k.code,
      windowsVirtualKeyCode: k.vk,
      location: k.location || 0,
      modifiers,
      ...(type === 'keyDown' && k.text ? { text: k.text, unmodifiedText: k.text } : {}),
    });
    if (type === 'keyDown') held.add(name);
    else held.delete(name);
  };
  const press = async (name) => {
    await key(name, 'keyDown');
    await key(name, 'keyUp');
  };
  const setMove = async (want) => {
    for (const k of ['w', 'a', 's', 'd']) {
      if (want.has(k) && !held.has(k)) await key(k, 'keyDown');
      if (!want.has(k) && held.has(k)) await key(k, 'keyUp');
    }
  };
  const mouse = (type, x, y) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, modifiers });
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(out, name), Buffer.from(data, 'base64'));
    return name;
  };
  const waitFor = async (pred, timeout, label) => {
    const end = Date.now() + timeout;
    let s;
    while (Date.now() < end) {
      s = await snap();
      if (pred(s)) return s;
      await sleep(20);
    }
    const input=await evaluate('({screen:__qa.app.screen,focus:document.activeElement?.className,held:[...__qa.app.heldKeys],blocked:[...__qa.app.blockedKeys],keyboard:__qa.app.blockedKeyboardClick,pointer:__qa.app.blockedPointer,rewardAge:performance.now()-__qa.app.rewardAt})');
    throw new Error(`대기 시간 초과: ${label} ${JSON.stringify(input)}`);
  };
  const toScreen = (x, y) => evaluate(`__qa.app.worldToScreen(${x}, ${y})`);
  const walkTo = async (tx, ty, stopDist, timeout) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const s = await snap();
      const dx = tx(s) - s.run.player.x;
      const dy = ty(s) - s.run.player.y;
      if (Math.hypot(dx, dy) <= stopDist) break;
      const want = new Set();
      if (dy < -8) want.add('w');
      if (dy > 8) want.add('s');
      if (dx < -8) want.add('a');
      if (dx > 8) want.add('d');
      await setMove(want);
      await sleep(30);
    }
    await setMove(new Set());
  };
  const attackBoss = async (ms) => {
    const s = await snap();
    const p = await toScreen(s.run.boss.x, s.run.boss.y);
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y);
    await sleep(ms);
    await mouse('mouseReleased', p.x, p.y);
  };
  const nearBoss = (s) => Math.hypot(s.run.boss.x - s.run.player.x, s.run.boss.y - s.run.player.y);

  // 1. 최초 준비가 끝나면 메인 메뉴, 명시적 게임 시작 후 직업 선택.
  await waitFor(x=>x.screen==='home',5000,'로딩 후 메인 메뉴');
  check('메인 게임 시작 포커스 · 로딩/선택창 숨김',await evaluate('document.activeElement.id==="home-start" && document.getElementById("screen-loading").hidden && document.getElementById("screen-start").hidden'));
  await press('enter');
  let s = await waitFor((x) => x.screen === 'start', 5000, '시작 화면');
  check('시작 화면과 1920×1080 canvas backing', s.canvas[0] === 1920 && s.canvas[1] === 1080, s.canvas);
  check('초기 포커스는 선택 버튼', s.activeClass.includes('choice'), s.active);
  const hudDisplay = await evaluate("getComputedStyle(document.getElementById('hud')).display");
  check('시작 화면에서 HUD 숨김', hudDisplay === 'none', hudDisplay);
  await shot('01-menu.png');
  await press('enter');
  s = await snap();
  check('Enter로 전사·검 선택', s.pressed[0] === 'true' && !s.startDisabled, s.pressed);
  await press('tab');
  s = await snap();
  check('Tab으로 다음 무기 포커스', s.activeClass.includes('choice'), s.active);
  await press('tab');
  await press('tab');
  check('Tab으로 직업 고유 각인 안내 포커스', await evaluate('document.activeElement.matches(".selection-uniques summary")'));
  await press('tab');
  check('Tab으로 합성 안내 포커스', await evaluate('document.activeElement.matches(".selection-uniques summary")'));
  await press('tab');
  s = await snap();
  check('Tab으로 전투 시작 버튼 포커스', s.active === 'start-button', s.active);
  await press('enter');
  s = await waitFor((x) => x.screen === 'briefing', 2000, '첫 보스 소개');
  check('선택 후 보스 소개 · 전투 시작 버튼 포커스', s.active === 'briefing-start' && s.run.time === 0 && s.run.hazards.length === 0, s);
  check('보스 초상화·이름·개요·공략 표시', await evaluate('document.getElementById("briefing-portrait").width>0 && document.getElementById("briefing-boss-name").textContent===__qa.app.run.boss.def.name && document.getElementById("briefing-overview").textContent.length>10 && document.getElementById("briefing-hint").textContent.length>10'));
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,autoRepeat:true});
  await key('enter','keyUp');
  await sleep(250);
  s = await snap();
  check('Enter 길게 누름으로 소개 건너뛰지 않음 · 전투/자기장/RAF 정지', s.screen === 'briefing' && s.run.time === 0 && s.run.stageTime === 0 && s.pendingRaf === 0);
  await key('w','keyDown');
  await evaluate('window.dispatchEvent(new Event("blur"))');
  await sleep(50);
  check('소개 중 blur에도 전투 시작·시간 진행 없음', (await snap()).screen==='briefing' && (await snap()).run.time===0);
  await key('w','keyUp');
  await shot('00-boss-briefing.png');
  await press('space');
  s = await waitFor((x) => x.screen === 'battle', 2000, '전투 진입');
  check('Space로 전투 진입 · 유령 회피/이동/발사 없음', s.active === 'game' && s.run.player.dodgeTime === 0 && await evaluate('!__qa.app.input.up && !__qa.app.input.attack && !__qa.app.input.dodge'), s.active);

  // Input/UI checks isolate combat pressure; difficulty has separate simulation probes.
  await evaluate('__qa.fixture.quietBoss()');
  // 2. 대각선 이동 속도
  const t0 = await snap();
  await setMove(new Set(['w', 'd']));
  await sleep(400);
  await setMove(new Set());
  const t1 = await snap();
  const moved = Math.hypot(t1.run.player.x - t0.run.player.x, t1.run.player.y - t0.run.player.y);
  const simDt = t1.run.time - t0.run.time;
  const speed = moved / simDt;
  check('대각선 이동 속도 ≤ 기본 속도(260)', speed > 200 && speed <= 260.5, { speed, simDt });

  // 3. 접근 후 공격 피해
  await walkTo((x) => x.run.boss.x, (x) => x.run.boss.y, 95, 6000);
  const hpBefore = (await snap()).run.boss.hp;
  const sAtk = await snap();
  const pAtk = await toScreen(sAtk.run.boss.x, sAtk.run.boss.y);
  await mouse('mouseMoved', pAtk.x, pAtk.y);
  await mouse('mousePressed', pAtk.x, pAtk.y);
  await sleep(60);
  await shot('02-attack.png');
  await sleep(1000);
  await mouse('mouseReleased', pAtk.x, pAtk.y);
  s = await snap();
  const dealt = hpBefore - s.run.boss.hp;
  check('좌클릭 유지로 보스 피해(44 단위, 2회 이상)', dealt >= 88 && dealt % 44 === 0, { dealt, dist: nearBoss(s) });

  // 4. Fixed single strike fixture tests Ctrl input/i-frames, not human difficulty.
  await evaluate('__qa.fixture.singlePattern("cleave")');
  await waitFor((x) => x.run.boss.state === 'idle' || x.run.boss.state === 'recover', 5000, '보스 대기 상태');
  s = await waitFor((x) => x.run.boss.state === 'windup' && x.run.hazards.length > 0, 8000, '보스 예고');
  const hpWind = s.run.player.hp;
  // PNG encoding of textured art must not consume the scripted reaction window.
  await evaluate('__qa.fixture.freezeTime(true)');
  await shot('03-telegraph.png');
  await evaluate('__qa.fixture.freezeTime(false)');
  const h = s.run.hazards[0];
  const bx = s.run.player.x - s.run.boss.x;
  const by = s.run.player.y - s.run.boss.y;
  // 보스→플레이어 축의 수직 방향 중 여유 공간이 큰 쪽으로 이동
  let px = -by;
  let py = bx;
  const room = (sx, sy) => Math.min(sx > 0 ? 1280 - s.run.player.x : sx < 0 ? s.run.player.x : 1e9, sy > 0 ? 720 - s.run.player.y : sy < 0 ? s.run.player.y : 1e9);
  if (room(-px, -py) > room(px, py)) {
    px = -px;
    py = -py;
  }
  const want = new Set();
  if (py < -0.3 * Math.abs(px)) want.add('w');
  if (py > 0.3 * Math.abs(px)) want.add('s');
  if (px < -0.3 * Math.abs(py)) want.add('a');
  if (px > 0.3 * Math.abs(py)) want.add('d');
  await setMove(want);
  await key('ctrl', 'keyDown');
  const pc = await toScreen(s.run.boss.x, s.run.boss.y);
  await mouse('mousePressed', pc.x, pc.y);
  await sleep(50);
  s = await snap();
  check('Ctrl 회피 실행(구르기·무적)', s.run.player.dodgeTime > 0 || s.run.player.dodgeCooldown > 0.8, s.run.player);
  await shot('04-dodge.png');
  await mouse('mouseReleased', pc.x, pc.y);
  await key('ctrl', 'keyUp');
  await sleep(150);
  await setMove(new Set());
  s = await waitFor((x) => x.run.hazards.length === 0 || x.run.boss.state === 'recover', 3000, '패턴 종료');
  await sleep(50);
  s = await snap();
  check(`예고(${h.shape}) 회피: 피해 없음`, s.run.player.hp === hpWind, { before: hpWind, after: s.run.player.hp });
  // 합성 contextmenu로 제품 핸들러의 기본 동작 차단을 확인한다(CDP 마우스가 macOS contextmenu를 만들지 않는 경우 대비).
  await evaluate("document.getElementById('game').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey: true }))");
  s = await snap();
  check('전투 중 contextmenu 기본 동작 차단', s.contextmenus.length > 0 && s.contextmenus.every(Boolean), s.contextmenus);
  check('조합 입력 후 스크롤·포커스 유지', s.scroll[0] === 0 && s.scroll[1] === 0 && s.active === 'game', { scroll: s.scroll, active: s.active });

  // 5. 피격: 보스 곁의 단일 강타 영역 안에 머문다
  await evaluate('__qa.fixture.quietBoss()');
  await walkTo((x) => x.run.boss.x, (x) => x.run.boss.y, 95, 6000);
  await evaluate('__qa.fixture.singlePattern("slam")');
  s = await waitFor((x) => x.run.boss.state === 'windup', 8000, '다음 예고');
  const hpHit = s.run.player.hp;
  s = await waitFor((x) => x.run.player.hp < hpHit, 3000, '피격');
  await shot('05-hit.png');
  await waitFor((x) => x.run.hazards.length === 0, 3000, '패턴 종료');
  s = await snap();
  check('활성 영역에서 1회 피격 · 전사 감소율 12%', Math.abs(hpHit - s.run.player.hp - 42 * .88) < 1e-8, { before: hpHit, after: s.run.player.hp });

  await evaluate('__qa.fixture.quietBoss()');
  // 6. Esc 정지/재개: 시간·쿨타임 정지, 재개 시 시간 점프 없음
  await key('d', 'keyDown');
  await sleep(100);
  await press('esc');
  s = await waitFor((x) => x.screen === 'pause', 1000, '정지');
  await shot('06-pause.png');
  const pa = s.run;
  await sleep(1000);
  const pb = (await snap()).run;
  check('정지 중 시뮬레이션·쿨타임 정지', pa.time === pb.time && pa.player.attackCooldown === pb.player.attackCooldown && pa.player.dodgeCooldown === pb.player.dodgeCooldown, { a: pa.time, b: pb.time });
  await press('esc');
  await waitFor((x) => x.screen === 'battle', 1000, '재개');
  const r0 = (await snap()).run;
  await sleep(200);
  const r1 = (await snap()).run;
  check('재개 후 시간 점프 없음', r1.time - pa.time < 0.4, { paused: pa.time, after: r1.time });
  check('정지 전 눌린 키 해제', Math.abs(r1.player.x - r0.player.x) < 1, { x0: r0.player.x, x1: r1.player.x });
  await key('d', 'keyUp');

  // 7. blur / visibility hidden
  await key('a', 'keyDown');
  await evaluate("window.dispatchEvent(new Event('blur'))");
  s = await snap();
  check('blur 시 정지', s.screen === 'pause', s.screen);
  await press('enter');
  await waitFor((x) => x.screen === 'battle', 1000, 'blur 후 재개');
  const b0 = (await snap()).run;
  await sleep(200);
  const b1 = (await snap()).run;
  check('blur 후 입력 해제', Math.abs(b1.player.x - b0.player.x) < 1, { x0: b0.player.x, x1: b1.player.x });
  await key('a', 'keyUp');
  await evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))");
  s = await snap();
  check('탭 숨김 시 정지', s.screen === 'pause', s.screen);
  await evaluate("delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))");
  await press('esc');
  await waitFor((x) => x.screen === 'battle', 1000, '숨김 후 재개');

  // 8. RAF 하나 유지
  for (let i = 0; i < 6; i++) await press('esc');
  await sleep(100);
  const rafA = await snap();
  await sleep(500);
  const rafB = await snap();
  check('반복 정지/재개 후 RAF 1개', rafA.pendingRaf <= 1 && rafB.pendingRaf <= 1 && rafB.rafCount - rafA.rafCount <= 40, { pending: rafB.pendingRaf, framesIn500ms: rafB.rafCount - rafA.rafCount });

  // 9. 사망 → 초기화 → 재시작
  await walkTo((x) => x.run.boss.x, (x) => x.run.boss.y, 95, 6000);
  await evaluate('__qa.fixture.setPlayerHp(1); __qa.fixture.singlePattern("slam")');
  await sleep(50);
  await shot('07-low-health.png');
  check('저체력 위험 문구 표시', (await snap()).lowHealth === 'true');
  s = await waitFor((x) => x.screen === 'dead', 10000, '사망');
  await shot('07-dead.png');
  const d0 = s.run;
  await sleep(800);
  const d1 = (await snap()).run;
  check('사망 후 보스 공격·시간 진행 없음', d0.time === d1.time && d1.hazards.length === 0, { t0: d0.time, t1: d1.time, hazards: d1.hazards.length });
  check('사망 화면 버튼 포커스', (await snap()).active === 'dead-restart');
  await press('enter');
  s = await waitFor((x) => x.screen === 'start', 1000, '직업 선택 복귀');
  check('사망 후 런 초기화', s.run === null, s.run);
  for (let i = 0; i < 5; i++) await press('tab');
  await press('enter');
  await waitFor((x) => x.screen === 'briefing', 1000, '재시작 소개');
  await press('enter');
  s = await waitFor((x) => x.screen === 'battle', 1000, '재시작');
  check(
    '새 런에 이전 엔티티 없음',
    s.run.time < 0.5 && s.run.hazards.length === 0 && s.run.particles === 0 && s.run.boss.hp === s.run.boss.maxHp && s.run.player.hp === s.run.player.maxHp && s.pendingRaf <= 1,
    s.run,
  );

  // 10. First boss now leads to a real reward, not premature campaign victory.
  await evaluate(`__qa.fixture.quietBoss(); __qa.fixture.setBossHp(44); window.__clearTimes={}; document.getElementById('clear-title').addEventListener('focus',()=>window.dispatchEvent(new Event('focus')),{once:true}); new MutationObserver(()=>{window.__clearTimes[document.body.dataset.screen]=performance.now()}).observe(document.body,{attributes:true,attributeFilter:['data-screen']})`);
  await walkTo((x) => x.run.boss.x, (x) => x.run.boss.y, 95, 6000);
  await attackBoss(300);
  const cleared=await waitFor((x)=>x.screen==='clear',700,'카드 이전 클리어 화면');
  check('처치 직후: 클리어 화면 · 카드 숨김 · 처치 보스 이름',cleared.run.status==='reward'&&cleared.active==='clear-title'&&await evaluate('document.getElementById("screen-reward").hidden&&document.getElementById("clear-boss").textContent===__qa.app.run.boss.def.name'));
  await sleep(350);s=await snap();
  check('클리어 중 시뮬레이션/HP/제안/RAF 정지',s.screen==='clear'&&s.run.time===cleared.run.time&&s.run.stageTime===cleared.run.stageTime&&s.run.player.hp===cleared.run.player.hp&&JSON.stringify(s.run.offers)===JSON.stringify(cleared.run.offers)&&s.pendingRaf===0);
  await shot('09-boss-clear.png');
  s = await waitFor((x) => x.screen === 'reward' || x.screen === 'dead', 3000, '첫 보스 처치');
  const clearMs=await evaluate('__clearTimes.reward-__clearTimes.clear');
  check('클리어 약1.5초 후 보상 자동 표시',clearMs>=1490&&clearMs<2400,clearMs);
  check('첫 보스 처치 시 카드 보상', s.screen === 'reward' && s.run.offers.length === 3, s.screen);
  await shot('08-reward.png');
  const w0 = s.run;
  await sleep(650);
  const w1 = (await snap()).run;
  check('처치 후 보스 상태 dead·공격 없음', w1.boss.state === 'dead' && w1.hazards.length === 0 && w0.time === w1.time, w1.boss);
  await press('enter');
  s = await waitFor((x) => x.screen === 'briefing', 1000, '두 번째 보스 소개');
  const introTime = s.run.time;
  await sleep(250);
  check('보상 선택 후 소개 화면에서 정지 · 선택 카드 표시', (await snap()).run.time === introTime && await evaluate('document.getElementById("briefing-build").textContent.includes("×1")'));
  await press('enter');
  s = await waitFor((x) => x.screen === 'battle', 1000, '두 번째 결투');
  check('카드 선택 후 2스테이지', s.run.stage === 1 && Object.values(s.run.cards).reduce((a,b) => a+b,0) === 1, s.run.cards);

  // UI-only fixture: verify the interlude's focus/timer lifecycle without another full fight.
  await evaluate('__qa.fixture.quietBoss(); __qa.fixture.killBoss()');
  const secondClear=await waitFor(x=>x.screen==='clear',1000,'두 번째 클리어');
  await evaluate('window.dispatchEvent(new Event("blur"))');await sleep(1600);s=await snap();
  check('클리어 중 blur: 자동 전환/전투/RAF 모두 정지',s.screen==='clear'&&s.run.time===secondClear.run.time&&s.pendingRaf===0);
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
  await evaluate('if(!document.getElementById("start-motion").checked)document.getElementById("start-motion").click()');
  await sleep(80);
  check('1365×768 클리어: 잘림 없음 · 모션 감소 시 정적 표시',await evaluate('(()=>{const p=document.querySelector(".clear-panel"),r=p.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&getComputedStyle(p).animationName==="none";})()'));
  await shot('10-clear-reduced-1365.png');
  await evaluate('Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"))');
  await sleep(1600);
  check('숨긴 탭의 focus 이벤트로 클리어를 넘기지 않음',(await snap()).screen==='clear');
  await evaluate('Object.defineProperty(document,"hasFocus",{configurable:true,value:()=>false});delete document.visibilityState;document.dispatchEvent(new Event("visibilitychange"))');
  await sleep(1600);
  check('보이지만 비활성인 창: 클리어 대기 유지',(await snap()).screen==='clear');
  await evaluate('delete document.hasFocus;window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("focus"))');
  await sleep(350);
  check('재활성화: 남은 클리어 시간 표시 · 즉시 카드 노출 없음',(await snap()).screen==='clear');
  s=await waitFor(x=>x.screen==='reward',2500,'재활성화 후 보상');
  check('재개 후 보상 한 번 · HP/제안 그대로',s.run.player.hp===secondClear.run.player.hp&&JSON.stringify(s.run.offers)===JSON.stringify(secondClear.run.offers));
  await sleep(650);await press('enter');await waitFor(x=>x.screen==='briefing',1000,'세 번째 소개');
  await press('enter');await waitFor(x=>x.screen==='battle',1000,'세 번째 결투');
  await evaluate('__qa.fixture.quietBoss();__qa.fixture.killBoss()');await waitFor(x=>x.screen==='clear',1000,'세 번째 클리어');
  // Exercise screen teardown through the existing menu handler, not a new production debug API.
  await evaluate('document.getElementById("briefing-menu").click();document.getElementById("start-button").click()');
  await waitFor(x=>x.screen==='briefing',1000,'새 런 소개');await sleep(1700);s=await snap();
  check('클리어 중 런 교체: 이전 타이머가 새 소개를 덮지 않음',s.screen==='briefing'&&s.run.stage===0&&s.run.time===0&&s.run.offers.length===0&&s.pendingRaf===0);
  return results;
}

async function main() {
  if (!['core', 'campaign', 'tutorial', 'home', 'audio', 'performance'].includes(scenario)) throw new Error(`알 수 없는 시나리오: ${scenario}`);
  if (scenario === 'performance' && !headed) throw new Error('성능 검증에는 --headed 실제 GPU 브라우저가 필요합니다');
  await mkdir(outDir, { recursive: true });
  const profile = await mkdtemp(path.join(os.tmpdir(), 'bossrush-qa-'));
  const server = await startQaServer(path.join(profile,'leaderboard.json'));
  const { port } = server.address();
  const chrome = launchChrome(profile);
  const errors = [],expectedNetworkFailures=[],expectedNetworkUrls=new Map();
  let browser;
  let report = { scenario, started: new Date().toISOString(), chrome: CHROME, args: chrome.args, viewport: { width: 1920, height: 1080, dpr: 1 } };
  try {
    browser = await connect(await chrome.ready);
    report.version = await browser.send('Browser.getVersion');
    report.system = await browser.send('SystemInfo.getInfo');
    report.hardware = { cpu: os.cpus()[0]?.model, ram: os.totalmem(), platform: os.platform(), release: os.release() };
    report.headed = headed;
    report.focusEmulated = scenario !== 'performance';
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => browser.send(m, p, sessionId);
    let loaded;
    const loadedP = new Promise((r) => (loaded = r));
    browser.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Page.loadEventFired') loaded();
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const entry=msg.params.entry,text=`${entry.text} ${entry.url||''}`,count=expectedNetworkUrls.get(entry.url)||0;
        if(entry.source==='network'&&count>0){expectedNetworkUrls.set(entry.url,count-1);expectedNetworkFailures.push(text);}
        else errors.push(text);
      }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    if (scenario !== 'performance') await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/__qa.html` });
    await loadedP;
    await sleep(300);
    if (headed) await send('Page.bringToFront');
    const results = scenario === 'core' ? await runCore({ send }, outDir)
      : scenario === 'campaign' ? await runCampaign({ send }, outDir)
      : scenario === 'tutorial' ? await runTutorial({ send }, outDir)
      : scenario === 'audio' ? await (await import('./qa-audio.mjs')).runAudio({ send }, outDir)
      : scenario === 'home' ? await (await import('./qa-home.mjs')).runHome({send,baseUrl:`http://127.0.0.1:${port}`,on:fn=>browser.on(msg=>{if(msg.sessionId===sessionId)fn(msg);}),expectNetworkFailure:url=>expectedNetworkUrls.set(url,(expectedNetworkUrls.get(url)||0)+1)},outDir)
      : await runPerformance({ send }, report);
    report.expectedNetworkFailures=expectedNetworkFailures;
    results.push({name:'통제한 네트워크 오류만 예상 처리',pass:[...expectedNetworkUrls.values()].every(n=>n===0),detail:expectedNetworkFailures});
    results.push({ name: '콘솔 오류 없음', pass: errors.length === 0, detail: errors });
    console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'} 콘솔 오류 없음${errors.length ? ` — ${JSON.stringify(errors)}` : ''}`);
    report.results = results;
    report.passed = results.every((r) => r.pass);
  } catch (e) {
    report.error = String(e?.stack || e);
    report.passed = false;
    report.consoleErrors = errors;
    console.error(e);
  } finally {
    report.finished = new Date().toISOString();
    await writeFile(path.join(outDir, `report-${scenario}.json`), JSON.stringify(report, null, 2));
    browser?.close();
    chrome.proc.kill();
    await new Promise(resolve=>server.close(resolve));
    await new Promise((r) => setTimeout(r, 300));
    await rm(profile, { recursive: true, force: true });
  }
  console.log(report.passed ? `QA PASS (${outDir})` : `QA FAIL (${outDir})`);
  process.exit(report.passed ? 0 : 1);
}

await main();
