// Served only by QA server. Production boot has no fixtures or global debug API.
import { startGame } from '/src/startup.mjs';
import { BOSSES, CARDS, LIMITS, STEP } from '/src/content.mjs';
import { createInput, createRun, getHazardProgress, playerInvulnerable, resetClock, step } from '/src/game.mjs';

const raf = window.requestAnimationFrame.bind(window);
const caf = window.cancelAnimationFrame.bind(window);
const pending = new Set();
const listenerCounts = { window: 0, document: 0 };
for (const [name, target] of [['window', window], ['document', document]]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = (...args) => { listenerCounts[name]++; return add(...args); };
}
let measure = null;
let load = null;
let botInput;
let app;
let frozenTime = false;
window.requestAnimationFrame = (cb) => {
  const id = raf((timestamp) => {
    pending.delete(id);
    const start = performance.now();
    if (load && app?.screen === 'battle') sustainLoad();
    cb(timestamp);
    if (measure && app?.screen === 'battle') {
      if (measure.last !== null) measure.intervals.push(timestamp - measure.last);
      measure.last = timestamp;
      measure.cpu.push(performance.now() - start);
      const r = app.run;
      for (const name of ['hazards', 'projectiles', 'particles']) measure.max[name] = Math.max(measure.max[name], r[name].length);
      if (document.visibilityState !== 'visible' || !document.hasFocus()) measure.unfocusedFrames++;
    }
  });
  pending.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => { pending.delete(id); caf(id); };
const contextmenus = [];
window.addEventListener('contextmenu', (e) => contextmenus.push(e.defaultPrevented));
app = await startGame(document, { seed: 12345, now: () => frozenTime ? 0 : performance.now() });
if(!app)throw new Error('QA startup failed');
const canvas = document.getElementById('game');
const $ = (id) => document.getElementById(id);
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise(raf); };

function sustainLoad() {
  const r = app.run;
  // These fixtures sustain load, not evidence of a legal player victory.
  r.player.hp = r.player.maxHp;
  r.boss.hp = r.boss.maxHp;
  if (load === 'final-build') {
    Object.assign(app.input, botInput(r));
    app.input.attack = true;
  } else {
    const time = r.time;
    app.input.attack = false;
    app.input.aimX = r.boss.x; app.input.aimY = r.boss.y;
    while (r.hazards.length < LIMITS.hazards) {
      const i = r.hazards.length;
      r.hazards.push({ shape: i % 4 === 0 ? 'ring' : 'circle', x: 180 + (i * 179) % 920, y: 135 + (i * 127) % 470, radius: i % 4 === 0 ? 160 : 48, innerRadius: 125, gapAngle: i, gapHalfAngle: .7, phase: 'warn', t: -(i % 5) * .12, windup: 1.2, active: .18, damage: 0, hitDone: false });
    }
    while (r.projectiles.length < LIMITS.projectiles) {
      const i = r.projectiles.length, angle = i * 2.399 + time * .2;
      const x = 90 + (i * 113) % 1100, y = 80 + (i * 71) % 560;
      r.projectiles.push({ owner: 'boss', x, y, prevX: x, prevY: y, vx: Math.cos(angle) * 160, vy: Math.sin(angle) * 160, radius: 6, life: 3, maxLife: 3, damage: 0, color: i % 2 ? '#ee785b' : '#8cbef0' });
    }
    while (r.particles.length < LIMITS.particles) {
      const i = r.particles.length;
      r.particles.push({ x: 80 + (i * 167) % 1120, y: 70 + (i * 139) % 580, vx: Math.sin(i) * 80, vy: -40, life: .6, maxLife: .6, color: i % 2 ? '#e4c279' : '#7fced1' });
    }
  }
}

window.__qa = {
  app, contextmenus, listenerCounts,
  snapshot() {
    const r = app.run, el = document.activeElement;
    return {
      screen: app.screen, rafCount: app.rafCount, pendingRaf: pending.size, pendingCard: app.pendingCard, previewStage: app.rewardPreview?.stage ?? null, previewCards: app.rewardPreview && { ...app.rewardPreview.cards }, previewPlayer: app.rewardPreview && { hp: app.rewardPreview.player.hp, maxHp: app.rewardPreview.player.maxHp }, rewardAt: app.rewardAt,
      active: el?.id || el?.tagName, activeClass: el?.className || '',
      pressed: [...document.querySelectorAll('.choice')].map((b) => b.getAttribute('aria-pressed')),
      visibleChoices: [...document.querySelectorAll('.choice')].filter((b) => !b.hidden).map((b) => b.dataset.weaponId),
      startDisabled: $('start-button').disabled,
      scroll: [window.scrollX, window.scrollY], canvas: [canvas.width, canvas.height],
      warning: $('hud-warning').textContent, lowHealth: $('hud').dataset.lowHealth,
      reducedMotion: app.view.reducedMotion, shake: [app.view.shakeX || 0, app.view.shakeY || 0],
      contextmenus: contextmenus.slice(),
      run: r && {
        stage: r.stage, time: r.time, stageTime: r.stageTime, status: r.status, cards: { ...r.cards }, offers: r.offers.map((c) => c.id),
        classId: r.cls.id, weaponId: r.weapon.id,
        player: { x: r.player.x, y: r.player.y, hp: r.player.hp, maxHp: r.player.maxHp, dodgeTime: r.player.dodgeTime, dodgeCooldown: r.player.dodgeCooldown, attackCooldown: r.player.attackCooldown, invulnerable: playerInvulnerable(r) },
        boss: { x: r.boss.x, y: r.boss.y, hp: r.boss.hp, maxHp: r.boss.maxHp, state: r.boss.state, phase: r.boss.phase, radius: r.boss.def.radius,
          raid: r.boss.raid && { kind: r.boss.raid.kind, round: r.boss.raid.round, total: r.boss.raid.total, hint: r.boss.raid.hint } },
        hazards: r.hazards.map((h) => ({ shape: h.shape, x: h.x, y: h.y, radius: h.radius, angle: h.angle, phase: h.phase, t: h.t, windup: h.windup })),
        particles: r.particles.length, projectiles: r.projectiles.length,
      },
    };
  },
  fixture: {
    freezeTime(value) { frozenTime = value; resetClock(app.clock); },
    quietBoss() {
      const r = app.run;
      r.boss.state = 'idle'; r.boss.timer = 1e6; r.boss.pattern = null; r.boss.chargePaths = [];
      r.boss.def = { ...r.boss.def, speed: 0, raid: null };
      r.boss.raid = null; r.boss.combo = null;r.encounter={stage:r.stage,phase:r.boss.phase,active:false,complete:true};
      r.hazards.length = 0; r.projectiles.length = 0;
    },
    singlePattern(id) {
      this.quietBoss();
      const def = BOSSES[app.run.boss.def.id];
      const pattern = def.patterns.find(p => p.id === id);
      if (!pattern) throw new Error(`Unknown fixture pattern: ${id}`);
      app.run.boss.def = { ...def, speed: 0, pursuit: null, raid: null, patterns: [{ ...pattern, sequence: 1, finisher: null }] };
      app.run.boss.timer = .2;
    },
    setPlayerHp(v) { app.run.player.hp = v; },
    setBossHp(v) { app.run.boss.hp = v; },
    killBoss() { app.run.boss.hp = 0; },
    async patternPose(stage, id, seconds, phase = 1, controls = {}) {
      this.loadRun({ stage, seed: 12 });
      const r = app.run;
      if (phase === 2) { r.boss.hp = r.boss.maxHp * .49; step(r, createInput()); }
      const pattern = r.boss.def.patterns.find(p => p.id === id);
      if (!pattern) throw new Error(`Unknown pose pattern: ${id}`);
      r.boss.x=640; r.boss.y=240; r.player.x=640; r.player.y=400;
      r.boss.def={...r.boss.def,speed:0,pursuit:null,raid:null,patterns:[pattern]}; r.boss.timer=0;
      step(r,createInput());
      for(let i=0;i<Math.round(seconds/STEP);i++) {
        if(r.boss.state==='recover')r.boss.timer=1e6;
        step(r,{...createInput(),...controls});
      }
      app.stageAt=-2; frozenTime=true; resetClock(app.clock);
      [...$('stage-track').children].forEach((mark,i)=>mark.className=i<stage?'cleared':i===stage?'current':'');
      await frames();
      return r.hazards.map(h=>({shape:h.shape,phase:h.phase,progress:getHazardProgress(h),remaining:h.windup-h.t}));
    },
    async raidPose(stage, round = 0, progress = .7, phase = 1) {
      this.loadRun({stage,seed:12});
      const r=app.run;
      if(phase===2){r.boss.hp=r.boss.maxHp*.49;step(r,createInput());}
      r.encounter={stage:r.stage,phase:r.boss.phase,active:false,complete:true};
      r.stageTime=phase===2?30:10;r.boss.state='idle';r.boss.timer=0;
      // Health sustain is a screenshot fixture, not a legitimate mechanic clear.
      for(let i=0;i<1500;i++){
        r.player.hp=r.player.maxHp;step(r,createInput());
        const current=r.hazards.filter(h=>h.raidRound===undefined||h.raidRound===round);
        const reached=current.length?Math.max(...current.map(getHazardProgress)):1-r.boss.timer/r.boss.pattern?.windup;
        if(r.boss.raid?.round===round&&reached>=progress)break;
      }
      if(r.boss.raid?.round!==round)throw new Error(`Raid pose not reached: ${stage}/${round}`);
      app.stageAt=-2;frozenTime=true;resetClock(app.clock);
      [...$('stage-track').children].forEach((mark,i)=>mark.className=i<stage?'cleared':i===stage?'current':'');
      await frames();
      return {kind:r.boss.raid.kind,name:r.boss.raid.name,round:r.boss.raid.round,total:r.boss.raid.total,hint:r.boss.raid.hint,
        hazards:r.hazards.filter(h=>!h.raidPressure&&(h.raidRound===undefined||h.raidRound===round)).map(h=>({...h,progress:getHazardProgress(h)})),
        pressure:r.hazards.filter(h=>h.raidPressure).map(h=>({...h,progress:getHazardProgress(h)}))};
    },
    loadRun(options) {
      frozenTime = false;
      app.run = createRun(options);
      app.input = createInput(); app.pointer = null; app.hudCache = {}; app.stageAt = 0;
      app.input.aimX = app.run.boss.x; app.input.aimY = app.run.boss.y;
      resetClock(app.clock);
    },
    async cycle() {
      if(app.screen==='home')$('home-start').click();
      $('start-button').click(); await frames();
      $('briefing-start').click(); await frames();
      app.run.boss.hp = 0; await frames();
      for(let i=0;i<120&&app.screen!=='reward';i++)await frames();
      if(app.screen!=='reward')throw new Error('Restart cycle did not reach reward after clear');
      await new Promise(resolve => setTimeout(resolve, 650));
      $('reward-choices').firstElementChild.click(); await frames();
      $('briefing-start').click(); await frames();
      app.run.player.hp = 0; await frames();
      $('dead-restart').click(); await frames();
    },
  },
  async startLoad(name) {
    if (!['final-build', 'caps'].includes(name)) throw new Error(`Unknown workload ${name}`);
    if (!botInput) ({ botInput } = await import('/__qa-bot.mjs'));
    if(app.screen==='home')$('home-start').click();
    document.querySelector('.class-choice[data-class-id="mage"]').click();
    document.querySelector('.choice[data-weapon-id="lightning"]').click();
    $('start-button').click();
    this.fixture.loadRun({ classId: 'mage', weaponId: 'lightning', stage: 19, seed: 731 });
    const r = app.run;
    // Nineteen compatible upgrades, within individual caps; survival remains synthetic.
    for (const [id,stacks] of [['tempo',3],['edge',3],['rapid',3],['swift',3],['focus',3],['reach',2],['beam-mage',1],['illusionist',1]]) r.cards[id] = Math.min(stacks, CARDS.find((c) => c.id === id).maxStacks);
    r.player.hp = r.player.maxHp = 100000;
    r.boss.hp = r.boss.maxHp * .32;
    step(r, createInput());
    r.boss.hp = r.boss.maxHp;r.encounter={stage:r.stage,phase:r.boss.phase,active:false,complete:true};
    if (name === 'caps') { r.boss.timer = 1e12; r.boss.def = { ...r.boss.def, speed: 0 }; }
    $('briefing-start').click();
    load = name;
    await frames();
  },
  startMeasure() { measure = { last: null, intervals: [], cpu: [], max: { hazards: 0, projectiles: 0, particles: 0 }, unfocusedFrames: 0 }; },
  finishMeasure() { const result = measure; measure = null; return result; },
  async stopLoad() {
    load = null; measure = null;
    if (app.screen === 'battle') $('pause-button').click();
    if (app.screen === 'pause') $('pause-menu').click();
    await frames();
  },
};
