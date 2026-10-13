import { deriveBuild, FUSIONS, CLASS_UNIQUES, UNIQUE_NAMES } from './builds.mjs';
import { ENCOUNTER_INFO, encounterProgress } from './encounters.mjs';
// DOM owns screens/input; simulation owns combat. Render RAF sleeps outside battle.
import { BOSSES, CAMPAIGN, CARDS, CLASSES, STEP, RAID_DAMAGE_MULTIPLIER, CLEAR_HEAL } from './content.mjs';
import { clearInput, createClock, createInput, createRun, createTutorialRun, getTutorialStep, getHazardProgress, getStats, getStorm } from './game.mjs';
import { createView, drawPortrait, renderFrame, resizeView, screenToWorld, worldToScreen } from './render.mjs';
import { buildRecord, isFullClear, loadLeaderboard, submitRecord } from './leaderboard-client.mjs';
import { createAudio } from './audio.mjs';
import { stageTheme } from './stages.mjs';
import { TIMING_WINDOW } from './attack-rhythm.mjs';

const MOVE_KEYS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
const DODGE_KEYS = new Set(['ControlLeft', 'ControlRight', 'Space']);
const REWARD_KEYS = new Set(['Enter', 'Space', 'Digit1', 'Digit2', 'Digit3']);
const CLEAR_DURATION = 1500;
const CLASS_GLYPHS = { warrior: '⚔', archer: '⌁', mage: '✧', gunslinger: '⌖', fighter: '✥' };
const WEAPON_GLYPHS = { sword: '†', spear: '↑', axe: '⚒', bow: '⌁', crossbow: '⋈', fire: '♨', water: '◈', lightning: 'ϟ', revolver: '⌖', sniper: '⊕', punch: '◈', kick: '↯' };
const CARD_GLYPHS = ['†', 'ϟ', '↗', '♡', '✚', '»', '⚒', '✦', '◇', '◉', '⌁', '↯'];
const DODGE_TEXT = { step: '짧은 전진 이동', dash: '짧은 연속 돌진', blink: '즉시 순간이동', roll: '구르기 이동' };
const cardGlyph = (card) => CARD_GLYPHS[CARDS.indexOf(card)] || '✦';
const CATEGORY_NAMES = { damage: '공격 / POWER', haste: '속도 / TEMPO', reach: '사거리 / REACH', maxHP: '생존 / VITALITY', heal: '회복 / RESTORE', move: '기동 / MOBILITY', heavy: '강타 / HEAVY', rapid: '연타 / COMBO', dodge: '회피 / DODGE', shield: '보호 / WARD', focus: '집중 / FOCUS', fortune: '흡수 / SUSTAIN', unique: '고유 각인 / UNIQUE', berserk: '광폭의 맹세 / BERSERK' };
const RARITY_NAMES = { normal: '일반 · NORMAL', unique: '유니크 · UNIQUE', berserk: '버서크 · BERSERK' };
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function boot(doc, { seed = Date.now() >>> 0, now = () => performance.now() } = {}) {
  const win = doc.defaultView;
  const audio = createAudio(win);
  const $ = (id) => doc.getElementById(id);
  const canvas = $('game');
  canvas.hidden=false;
  const view = createView(canvas);
  const screens = Object.fromEntries(['loading', 'home', 'ranking', 'start', 'briefing', 'pause', 'clear', 'reward', 'dead', 'won', 'practice-done'].map((name) => [name, $(`screen-${name}`)]));
  const hud = $('hud');
  const choices = $('choices');
  const classChoices = $('class-choices');
  const startButton = $('start-button');
  const dodgeHeld = new Set();
  const app = {
    screen: 'loading', run: null, input: createInput(), clock: createClock(), rafId: 0, rafCount: 0,
    recordId: null, recordState: 'disabled',
    selection: null, nextSeed: seed, hudCache: {}, view, stageAt: 0, pointer: null,
    pendingCard: null, rewardPreview: null, rewardAt: 0, heldKeys: new Set(), blockedKeys: new Set(), pointerHeld: false, blockedPointer: false, blockedKeyboardClick: false,
  };
  const hudEls = Object.fromEntries(['player-hp', 'player-bar', 'boss-name', 'boss-title', 'boss-hp', 'boss-bar', 'stage', 'attack', 'weapon-state', 'storm', 'dodge', 'dodge-bar', 'warning', 'cast-progress', 'raid', 'raid-round', 'raid-hint', 'loadout', 'shield'].map((key) => [key, $(`hud-${key}`)]));

  let clearTimer=null,clearStartedAt=0,clearRemaining=0,rankingRequest=0;
  let audioMuted = false, audioVolume = 45;
  function unlockAudio() {
    if (audioMuted || audioVolume === 0) return;
    void audio.unlock().then(ok => {
      if (audioMuted || audioVolume === 0 || !doc.hasFocus() || doc.visibilityState !== 'visible') return;
      const text = ok ? 'BGM · 효과음 / Esc에서 조절' : '소리가 없으면 소리 켜기로 재시도하세요.';
      for (const el of doc.querySelectorAll('[data-audio-status]')) if (el.textContent !== text) el.textContent = text;
    });
  }
  for (const type of ['pointerdown', 'keydown']) win.addEventListener(type, e => {
    if (e.isTrusted && !e.repeat) unlockAudio();
  }, true);
  for (const slider of doc.querySelectorAll('[data-audio-volume]')) slider.addEventListener('input', e => {
    const value = Number(e.target.value);
    audioVolume = value;
    for (const el of doc.querySelectorAll('[data-audio-volume]')) el.value = String(value);
    audio.setVolume(value / 100);
    if (value > 0) unlockAudio();
  });
  for (const button of doc.querySelectorAll('[data-audio-mute]')) button.addEventListener('click', () => {
    audioMuted = !audioMuted;
    audio.setMuted(audioMuted);
    for (const el of doc.querySelectorAll('[data-audio-mute]')) {
      el.setAttribute('aria-pressed', String(audioMuted));
      el.textContent = audioMuted ? '소리 켜기' : '소리 끄기';
    }
    if (!audioMuted) unlockAudio();
  });
  audio.setActive(doc.visibilityState === 'visible' && doc.hasFocus());

  function resetInput() {
    clearInput(app.input);
    dodgeHeld.clear();
    if (app.run) {
      app.run.cancelActions();
      app.run.player.charge = 0;
      app.run.player.dodgeChainTime = 0;
      app.run.player.dodgeQueued = false;
    }
  }

  function showScreen(name) {
    pauseClear();
    app.screen = name;
    audio.setScene(name, app.run);
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    hud.hidden = name !== 'battle';
    $('tutorial-guide').hidden = name !== 'battle' || !app.run?.tutorial;
    $('stage-intro').hidden = true;
    canvas.inert = name !== 'battle';
    doc.body.dataset.screen = name;
    ensureLoop();
  }

  function setMotion(reduced) {
    view.reducedMotion = reduced;
    $('start-motion').checked = $('pause-motion').checked = reduced;
    doc.body.dataset.motion = reduced ? 'reduced' : 'full';
    ensureLoop();
  }
  setMotion(win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  for (const id of ['start-motion', 'pause-motion']) $(id).addEventListener('change', (e) => setMotion(e.target.checked));

  // Selection keeps all 12 buttons in DOM; inactive classes are hidden, not tab stops.
  for (const cls of CLASSES) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'class-choice';
    button.dataset.classId = cls.id;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="class-icon" aria-hidden="true">${CLASS_GLYPHS[cls.id] || '✧'}</span><strong>${cls.name}</strong>`;
    button.addEventListener('click', () => select(cls.id, cls.weapons[0].id));
    classChoices.append(button);
    for (const weapon of cls.weapons) {
      const choice = doc.createElement('button');
      choice.type = 'button';
      choice.className = 'choice';
      choice.dataset.classId = cls.id;
      choice.dataset.weaponId = weapon.id;
      choice.setAttribute('aria-pressed', 'false');
      choice.innerHTML = `<span class="weapon-glyph" aria-hidden="true">${WEAPON_GLYPHS[weapon.id] || '✧'}</span><strong>${weapon.name}</strong><span class="weapon-description">${weapon.description}</span><span class="choice-check" aria-hidden="true">✓</span>`;
      choice.addEventListener('click', () => select(cls.id, weapon.id));
      choices.append(choice);
    }
  }

  function select(classId, weaponId) {
    const cls = CLASSES.find((c) => c.id === classId);
    const weapon = cls.weapons.find((w) => w.id === weaponId);
    app.selection = { classId, weaponId };
    for (const b of choices.children) {
      b.hidden = b.dataset.classId !== classId;
      b.setAttribute('aria-pressed', String(b.dataset.weaponId === weaponId));
    }
    for (const b of classChoices.children) b.setAttribute('aria-pressed', String(b.dataset.classId === classId));
    $('selected-class-name').textContent = cls.name;
    $('selected-class-description').textContent = cls.description;
    $('preview-class').textContent = cls.name;
    $('preview-weapon').textContent = weapon.name;
    $('choice-count').textContent = `${cls.weapons.length} STYLES`;
    $('stat-hp').textContent = cls.maxHp;
    $('stat-reduction').textContent = `${Math.round((cls.damageReduction || 0) * 100)}%`;
    $('stat-damage').textContent = weapon.damage;
    $('stat-interval').textContent = `${weapon.interval.toFixed(2)}s`;
    $('stat-reach').textContent = weapon.reach;
    $('weapon-mechanics').textContent = weapon.chargeTime
      ? `누르고 ${weapon.chargeTime.toFixed(2)}초 충전 · 일찍 놓으면 약한 공격 · 공격 재사용 ${weapon.interval.toFixed(2)}초 · 회피 시 충전 취소`
      : weapon.magazine
        ? `탄창 ${weapon.magazine}발 · 비면 자동 재장전 ${weapon.reloadTime.toFixed(1)}초 · 발사 간격 ${weapon.interval.toFixed(2)}초`
        : cls.id === 'mage'
          ? '좌클릭으로 시전 · 조준 방향으로 속성 공격'
          : '좌클릭으로 공격 · 조준 방향으로 타격';
    $('stat-dodge').textContent = `${cls.dodge.cooldown.toFixed(2)}s`;
    $('dodge-description').textContent = `${cls.dodge.label}: ${DODGE_TEXT[cls.dodge.kind]}${cls.dodge.canAttack ? ' · 이동 중 공격 가능' : ''}${cls.dodge.chainWindow ? ' · 첫 회피 중 입력 저장, 이후 0.45초 안에 한 번 더 회피' : ''} · 폭풍 피해는 감소하지 않습니다.`;
    $('selection-combo-tip').textContent = cls.id === 'warrior' ? '콤보 각인 보유 시: 변형 후속타는 공격 버튼을 새로 눌러 발동합니다.' : '고유 각인 최대 2개 · 두 번째 획득 시 획득 순서와 무관한 합성 공격. 보상에서 효과와 대가를 확인하세요.';
    $('selection-uniques-list').replaceChildren(...CARDS.filter(card=>card.classId===cls.id&&card.rarity==='unique').map(card=>{
      const row=doc.createElement('li'),name=doc.createElement('strong');name.textContent=card.name+' · ';row.append(name,card.description);return row;
    }));
    $('selection-fusions-list').replaceChildren(...FUSIONS.filter(f=>CLASS_UNIQUES[cls.id].includes(f.ids[0])).map(f=>{
      const row=doc.createElement('li'),name=doc.createElement('strong');name.textContent=f.ids.map(id=>UNIQUE_NAMES[id]).join(' + ')+' → '+f.name+' · ';row.append(name,f.description);return row;
    }));
    $('hero-portrait').setAttribute('aria-label', `${cls.name} · ${weapon.name} 모습`);
    drawPortrait($('hero-portrait'), app.selection);
    startButton.disabled = false;
    $('practice-button').setAttribute('aria-label',`이 직업으로 연습: ${cls.name} · ${weapon.name}`);
  }
  select(CLASSES[0].id, CLASSES[0].weapons[0].id);

  // Arrow keys are optional menu shortcuts; Tab and Enter retain native behavior.
  for (const group of [classChoices, choices]) {
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
      const buttons = [...group.children].filter((b) => !b.hidden);
      const index = buttons.indexOf(doc.activeElement);
      if (index < 0) return;
      e.preventDefault();
      const next = buttons[(index + (['ArrowRight', 'ArrowDown'].includes(e.code) ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  }

  function refreshBuild() {
    const run = app.run;
    const held = CARDS.filter((c) => run.cards[c.id]);
    $('hud-build').replaceChildren();
    $('pause-build').replaceChildren();
    if (!held.length) {
      const text = doc.createElement('span');
      text.className = 'empty-build';
      text.textContent = run.tutorial ? '연습에는 각인이 없습니다' : '첫 승리 후 각인을 얻습니다';
      $('hud-build').append(text);
    }
    for (const card of held) {
      const count = run.cards[card.id];
      const chip = doc.createElement('span');
      chip.className = 'build-chip';
      if (card.rarity === 'unique') {
        chip.dataset.rarity = 'unique';
        chip.title = `UNIQUE · ${card.name} ×${count} — ${card.description}`;
      } else chip.title = `${card.name} ×${count} — ${card.description}`;
      chip.setAttribute('aria-label', chip.title);
      chip.innerHTML = `<span aria-hidden="true">${cardGlyph(card)}</span>${card.rarity === 'unique' ? '<b>UNIQUE</b>' : ''}<small>${count}</small>`;
      $('hud-build').append(chip);
      const description = doc.createElement('p');
      const title = doc.createElement('strong');
      title.textContent = `${card.name} ×${count} · `;
      description.append(title, card.description);
      $('pause-build').append(description);
    }
  }

  function showBriefing() {
    resetInput();
    const run = app.rewardPreview || app.run;
    const boss = run.boss;
    const theme=stageTheme(run);
    $('screen-briefing').dataset.biome=String(theme.biome);
    $('briefing-arena').textContent=theme.name;
    drawPortrait($('briefing-portrait'), { bossId: boss.def.id });
    $('briefing-portrait').setAttribute('aria-label', `${boss.def.name} 초상화`);
    const phases = (boss.def.phaseThresholds?.length || 0) + 1;
    $('briefing-stage').textContent = `결투 ${String(run.stage + 1).padStart(2, '0')} / ${CAMPAIGN.stages.length}${boss.def.special ? ` · 특수 보스 · ${phases}페이즈` : ''} · ${boss.def.title}`;
    $('briefing-boss-name').textContent = boss.def.name;
    $('briefing-overview').textContent = boss.def.overview;
    $('briefing-hint').textContent = boss.def.hint;
    const signature=boss.def.signature||boss.def.raid;
    $('briefing-raid-name').textContent = [signature.name,ENCOUNTER_INFO[run.stage]?.name].filter(Boolean).join(' · ');
    $('briefing-raid-hint').textContent = signature.hint+(ENCOUNTER_INFO[run.stage]?' '+ENCOUNTER_INFO[run.stage].hint:'');
    $('briefing-raid-note').hidden=Boolean(ENCOUNTER_INFO[run.stage]);
    $('briefing-raid-mitigation').textContent = `${Math.round((1 - RAID_DAMAGE_MULTIPLIER) * 100)}%`;
    $('briefing-patterns').replaceChildren(...boss.def.patterns.slice(0, 3).map((pattern) => {
      const item = doc.createElement('li');
      item.textContent = pattern.name;
      return item;
    }));
    $('briefing-health').textContent = `생명력 ${Math.ceil(run.player.hp)} / ${run.player.maxHp}`;
    const build = CARDS.filter((card) => run.cards[card.id]).map((card) => `${card.name} ×${run.cards[card.id]}`);
    $('briefing-back').hidden = !app.pendingCard;
    const stats = getStats(run);
    $('briefing-build').textContent = `${stats.weapon.name || run.weapon.name} · 회피 ${stats.dodge.label || run.cls.dodge.label} · 고유 각인 ${stats.uniqueIds.length}/2${stats.uniqueIds.length ? ` · ${stats.buildName}: ${stats.buildDescription}` : ''}${build.length ? ` · ${build.join(' · ')}` : ' · 보유 각인 없음'}`;
    showScreen('briefing');
    $('briefing-start').focus({ preventScroll: true });
  }

  function startStage() {
    app.hudCache = {};
    app.stageAt = app.run.time;
    app.pointer = null;
    app.input.aimX = app.run.boss.x;
    app.input.aimY = app.run.boss.y;
    $('intro-stage').textContent = `CHALLENGER ${String(app.run.stage + 1).padStart(2, '0')} / ${CAMPAIGN.stages.length}`;
    $('intro-name').textContent = app.run.boss.def.name;
    $('stage-track').replaceChildren();
    $('stage-track').hidden=Boolean(app.run.tutorial);
    for (let i = 0; !app.run.tutorial && i < CAMPAIGN.stages.length; i++) {
      const mark = doc.createElement('i');
      mark.className = `${i < app.run.stage ? 'cleared' : i === app.run.stage ? 'current' : ''}${(i + 1) % 5 === 0 ? ' special' : ''}`;
      mark.title = `결투 ${i + 1}${(i + 1) % 5 === 0 ? ' · 특수 보스' : ''}`;
      $('stage-track').append(mark);
    }
    refreshBuild();
    app.clock.reset();
    showScreen('battle');
    canvas.focus({ preventScroll: true });
  }

  function startPractice() {
    if(!app.selection||app.screen!=='start')return;
    resetInput();
    app.run=createTutorialRun(app.selection);
    drawPortrait($('hud-portrait'),app.selection);
    startStage();
  }

  function startBattle() {
    if (!app.selection || app.screen !== 'start') return;
    resetInput();
    app.run = createRun({ ...app.selection, seed: app.nextSeed });
    app.nextSeed = (app.nextSeed * 1664525 + 1013904223) >>> 0;
    drawPortrait($('hud-portrait'), app.selection);
    showBriefing();
  }
  function pause() {
    if (app.screen !== 'battle') return;
    resetInput();
    showScreen('pause');
    $('pause-menu').textContent=app.run.tutorial?'연습 끝내기 · 직업 선택으로':'런 포기 · 직업 선택으로';
    $('pause-combat-help').hidden=Boolean(app.run.tutorial);
    $('pause-tutorial-help').hidden=!app.run.tutorial;
    $('pause-note').textContent=app.run.tutorial?'연습은 실전의 체력·각인·진행도에 영향을 주지 않습니다.':'런을 포기하면 진행도와 카드가 초기화됩니다.';
    if(app.run.tutorial){
      updateTutorialGuide(app.run);
      $('pause-tutorial-help').textContent=`WASD 이동 · 마우스 조준 · 좌클릭 공격 · Space / Ctrl 회피. ${$('tutorial-description').textContent} ${$('tutorial-class-tip').textContent}`;
    }
    $('resume-button').focus({ preventScroll: true });
  }
  function resume() {
    if (app.screen !== 'pause') return;
    resetInput();
    app.clock.reset();
    showScreen('battle');
    canvas.focus({ preventScroll: true });
  }
  function toMenu() {
    resetInput();
    app.run = null;
    app.recordId=null;app.recordState='disabled';$('record-form').reset();
    app.pendingCard = app.rewardPreview = null;
    app.pointer = null;
    app.hudCache = {};
    app.clock.reset();
    showScreen('start');
    choices.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  function showHome() {
    toMenu();
    showScreen('home');
    $('home-start').focus({preventScroll:true});
  }
  async function showRanking() {
    if(!['home','ranking'].includes(app.screen))return;
    const request=++rankingRequest;
    showScreen('ranking');
    $('ranking-title').focus({preventScroll:true});
    $('ranking-status').textContent='완주 기록을 불러오는 중…';
    $('ranking-rows').replaceChildren();
    $('ranking-refresh').disabled=true;
    try {
      const entries=await loadLeaderboard();
      if(app.screen!=='ranking'||request!==rankingRequest)return;
      for(const [i,entry] of entries.entries()) {
        const cls=CLASSES.find(c=>c.id===entry.classId),weapon=cls.weapons.find(w=>w.id===entry.weaponId);
        const row=doc.createElement('tr');
        for(const text of [i+1,entry.nickname,`${cls.name} / ${weapon.name}`,`${entry.hits}회`,`${(entry.durationMs/1000/CAMPAIGN.stages.length).toFixed(2)}초`,timeLabel(entry.durationMs/1000)]) {
          const cell=doc.createElement('td');cell.textContent=text;row.append(cell);
        }
        $('ranking-rows').append(row);
      }
      $('ranking-status').textContent=entries.length?`${entries.length}개의 완주 기록 · 상위 100기록 보관`:'아직 등록된 기록이 없습니다. 첫 완주자가 되어 보세요.';
    } catch(error) {
      if(app.screen==='ranking'&&request===rankingRequest)$('ranking-status').textContent=error.message;
    } finally {
      if(app.screen==='ranking'&&request===rankingRequest)$('ranking-refresh').disabled=false;
    }
  }
  async function registerRecord(event) {
    event.preventDefault();
    const run=app.run;
    if(app.screen!=='won'||app.recordState!=='ready'||!isFullClear(run))return;
    try {
      const record=buildRecord(run,$('record-nickname').value,app.recordId);
      app.recordState='posting';$('record-submit').disabled=true;$('record-nickname').disabled=true;
      $('record-status').textContent='기록을 등록하는 중…';
      const result=await submitRecord(record);
      if(app.run!==run||app.screen!=='won')return;
      app.recordState='done';
      $('record-status').textContent=result.retained?`등록 완료 · 현재 ${result.rank}위. 메인 화면의 랭킹에서 확인하세요.`:'현재 상위 100위 밖이므로 보관되지 않았습니다.';
    } catch(error) {
      if(app.run!==run||app.screen!=='won')return;
      app.recordState='ready';$('record-submit').disabled=false;$('record-nickname').disabled=false;
      $('record-status').textContent=error.message;
    }
  }

  function pauseClear() {
    if(clearTimer===null)return;
    win.clearTimeout(clearTimer);clearTimer=null;
    clearRemaining=Math.max(0,clearRemaining-(now()-clearStartedAt));
  }
  function resumeClear() {
    if(app.screen!=='clear'||clearTimer!==null||doc.visibilityState!=='visible'||!doc.hasFocus())return;
    const run=app.run;
    clearStartedAt=now();
    clearTimer=win.setTimeout(()=>{
      clearTimer=null;
      if(app.screen!=='clear'||app.run!==run)return;
      // If focus changed before its event arrived, show the interlude on return rather than skip it.
      if(doc.visibilityState!=='visible'||!doc.hasFocus()){clearRemaining=CLEAR_DURATION;return;}
      showReward();
    },clearRemaining);
  }
  function showClear() {
    const run=app.run;
    $('clear-stage').textContent=`결투 ${String(run.stage+1).padStart(2,'0')} / ${CAMPAIGN.stages.length} · CLEAR`;
    $('clear-boss').textContent=run.boss.def.name;
    $('clear-health').textContent=`처치 회복 적용 · 생명력 ${Math.ceil(run.player.hp)} / ${run.player.maxHp}`;
    showScreen('clear');
    clearRemaining=CLEAR_DURATION;
    $('clear-title').focus({preventScroll:true});
    resumeClear();
  }

  function takeReward(id) {
    if (app.screen !== 'reward' || now() - app.rewardAt < 600 || app.blockedKeys.size) return;
    const preview = app.run.previewReward(id);
    if (!preview) return;
    app.pendingCard = id;
    app.rewardPreview = preview;
    resetInput();
    showBriefing();
  }
  function showReward() {
    const run = app.run;
    app.rewardAt = now();
    app.blockedKeys = new Set([...app.heldKeys].filter(code=>REWARD_KEYS.has(code)));
    app.blockedPointer = app.pointerHeld;
    app.pendingCard = app.rewardPreview = null;
    $('reward-stage').textContent = `CHALLENGER ${String(run.stage + 1).padStart(2, '0')} — DEFEATED`;
    $('reward-description').textContent = `${run.boss.def.name} 처치. 다음 결투를 위한 각인 하나를 선택하세요. ${((run.stage + 1) % 5 === 0 ? `특수 보스 보상은 ${getStats(run).uniqueIds.length>=2?'버서크':'미보유 고유 각인'} 한 장 보장. ` : '')}처치 시 최대 생명력의 ${Math.round(CLEAR_HEAL * 100 * getStats(run).healingMultiplier)}% 회복이 적용됩니다.`;
    $('reward-health').textContent = `남은 생명력 ${Math.ceil(run.player.hp)} / ${run.player.maxHp} · 다음 결투로 유지`;
    $('reward-next').textContent = `${String(run.stage + 2).padStart(2, '0')} / ${BOSSES[CAMPAIGN.stages[run.stage + 1]].name}`;
    const container = $('reward-choices');
    container.replaceChildren();
    run.offers.forEach((card, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'reward-card';
      button.dataset.cardId = card.id;
      button.dataset.rarity = card.rarity || 'normal';
      const owned = run.cards[card.id] || 0;
      let description=card.description;
      if(card.category==='heal'||card.category==='maxHP'){
        const before=getStats(run),after=getStats({...run,cards:{...run.cards,[card.id]:owned+1}});
        const gain=card.category==='maxHP'?after.maxHp-before.maxHp:20;
        description=`${card.category==='maxHP'?`현재 최대 생명력 +${gain} · `:''}체력 ${Number((gain*after.healingMultiplier).toFixed(1))} 회복`;
      }
      button.dataset.category = card.category;
      button.innerHTML = `<span class="card-rarity">${RARITY_NAMES[card.rarity || 'normal']}</span><span class="card-category">${CATEGORY_NAMES[card.category] || card.category}</span><span class="card-glyph" aria-hidden="true">${cardGlyph(card)}</span><h3>${card.name}</h3><p>${description}</p><span class="card-level"><span>${owned ? `각인 ${owned} → ${owned + 1}` : '새로운 각인'} / ${card.maxStacks}</span><kbd>${i + 1}</kbd></span>`;
      if(card.rarity==='unique'){
        const next=deriveBuild({...run,cards:{...run.cards,[card.id]:1}});
        if(next.fusion){const text=doc.createElement('p');text.className='fusion-preview';text.textContent=`합성 → ${next.name}: ${next.description}`;button.querySelector('.card-level').before(text);}
      }
      button.addEventListener('click', () => takeReward(card.id));
      container.append(button);
    });
    showScreen('reward');
    container.firstElementChild?.focus({ preventScroll: true });
  }
  function showResult(name) {
    const run = app.run;
    if (name === 'dead') $('dead-description').textContent = `${run.stage + 1}번째 결투, ${run.boss.def.name}에게 쓰러졌습니다.`;
    const items = [[`${run.bossesCleared} / ${CAMPAIGN.stages.length}`, '보스 처치'], [timeLabel(run.time), '전투 시간'], [Object.values(run.cards).reduce((a, b) => a + b, 0), '획득 각인'],[`${run.hitsTaken}회`,'피격']];
    if(name==='won')items.push([`${(Math.round(run.time*1000)/1000/CAMPAIGN.stages.length).toFixed(2)}초`,'보스당 평균']);
    $('record-form').hidden=!isFullClear(run);
    app.recordId=isFullClear(run)?win.crypto.randomUUID():null;app.recordState=app.recordId?'ready':'disabled';
    $('record-form').reset();$('record-status').textContent='';$('record-submit').disabled=false;$('record-nickname').disabled=false;
    const stats = $(`${name}-stats`);
    stats.replaceChildren();
    for (const [value, label] of items) {
      const item = doc.createElement('div');
      item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      stats.append(item);
    }
    showScreen(name);
    $(`${name}-restart`).focus({ preventScroll: true });
  }
  $('home-start').addEventListener('click',()=>{if(app.screen==='home')toMenu();});
  $('home-ranking').addEventListener('click',showRanking);
  $('ranking-refresh').addEventListener('click',showRanking);
  $('ranking-back').addEventListener('click',showHome);
  $('selection-home').addEventListener('click',showHome);
  $('record-form').addEventListener('submit',registerRecord);
  startButton.addEventListener('click', startBattle);
  $('practice-button').addEventListener('click',startPractice);
  $('tutorial-exit').addEventListener('click',toMenu);
  $('practice-return').addEventListener('click',toMenu);
  $('briefing-start').addEventListener('click', () => {
    if (app.screen !== 'briefing' || !app.run) return;
    if (app.pendingCard && !app.run.chooseCard(app.pendingCard)) return;
    app.pendingCard = app.rewardPreview = null;
    resetInput();
    startStage();
  });
  $('briefing-back').addEventListener('click', () => {
    if (app.screen !== 'briefing' || !app.pendingCard) return;
    app.pendingCard = app.rewardPreview = null;
    showReward();
  });
  $('briefing-menu').addEventListener('click', toMenu);
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  $('pause-menu').addEventListener('click', toMenu);
  $('dead-restart').addEventListener('click', toMenu);
  $('won-restart').addEventListener('click', toMenu);

  win.addEventListener('keydown', (e) => {
    app.heldKeys.add(e.code);
    if (app.screen === 'reward' && REWARD_KEYS.has(e.code)) {
      if (e.repeat || now() - app.rewardAt < 600 || app.blockedKeys.has(e.code)) {
        if (now() - app.rewardAt < 600) app.blockedKeys.add(e.code);
        e.preventDefault();
        return;
      }
      app.blockedKeyboardClick = false;
    }
    if (app.screen === 'briefing' && e.repeat && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      return;
    }
    if (e.repeat && (DODGE_KEYS.has(e.code) || e.code === 'KeyQ' || e.code === 'Escape')) return;
    if (app.screen === 'reward' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code) && !e.repeat) {
      e.preventDefault();
      const offer = app.run.offers[Number(e.code.at(-1)) - 1];
      if (offer) takeReward(offer.id);
      return;
    }
    if (app.screen === 'ranking' && e.code === 'Escape') { e.preventDefault(); showHome(); return; }
    if (app.screen === 'pause' && e.code === 'Escape') { e.preventDefault(); resume(); return; }
    if (app.screen !== 'battle') return;
    if (e.code === 'Escape' || e.code === 'Tab') {
      e.preventDefault();
      pause();
    } else if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      app.input[MOVE_KEYS[e.code]] = true;
    } else if (DODGE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!dodgeHeld.size) app.input.dodge = true;
      dodgeHeld.add(e.code);
    } else if(e.code==='KeyQ'){
      e.preventDefault();app.input.counter=true;
    } else if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  win.addEventListener('keyup', (e) => {
    app.heldKeys.delete(e.code);
    if (app.blockedKeys.delete(e.code) && (e.code === 'Enter' || e.code === 'Space')) app.blockedKeyboardClick = true;
    if (MOVE_KEYS[e.code]) app.input[MOVE_KEYS[e.code]] = false;
    dodgeHeld.delete(e.code);
  });
  win.addEventListener('mousedown', () => {
    app.pointerHeld = true;
    if (app.screen === 'reward') app.blockedPointer = now() - app.rewardAt < 600;
  });
  win.addEventListener('mouseup', () => { app.pointerHeld = false; });
  win.addEventListener('click', (e) => {
    if (app.screen !== 'reward') return;
    const keyboard = e.detail === 0;
    const blocked = now() - app.rewardAt < 600 || (!keyboard && app.blockedPointer) || (keyboard && app.blockedKeyboardClick);
    if (blocked) {
      if (keyboard) app.blockedKeyboardClick = false;
      else app.blockedPointer = false;
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);

  function aimAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const point = screenToWorld(view, clientX - rect.left, clientY - rect.top);
    app.input.aimX = point.x;
    app.input.aimY = point.y;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (app.screen !== 'battle') return;
    app.pointer = { x: e.clientX, y: e.clientY };
    aimAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (app.screen !== 'battle' || (e.button !== 0 && !(e.button === 2 && e.ctrlKey))) return;
    app.input.attackPressed = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (app.screen !== 'battle') return;
    // macOS reports Ctrl+left-click as either button 0 or button 2.
    if (e.button === 0 || (e.button === 2 && e.ctrlKey)) {
      e.preventDefault();
      app.pointer = { x: e.clientX, y: e.clientY };
      aimAt(e.clientX, e.clientY);
      app.input.attack = true;
      canvas.focus({ preventScroll: true });
    }
  });
  win.addEventListener('mouseup', (e) => { if (e.button === 0 || e.button === 2) app.input.attack = false; });
  canvas.addEventListener('contextmenu', (e) => { if (app.screen === 'battle' || app.screen === 'pause') e.preventDefault(); });
  canvas.addEventListener('wheel', (e) => { if (app.screen === 'battle') e.preventDefault(); }, { passive: false });
  function loseFocus() {
    audio.setActive(false);
    resetInput();
    app.heldKeys.clear(); app.blockedKeys.clear(); app.pointerHeld = false;
    app.blockedPointer = app.blockedKeyboardClick = true;
    pauseClear();
    pause();
  }
  win.addEventListener('blur', loseFocus);
  function regainFocus() {
    audio.setActive(doc.visibilityState === 'visible' && doc.hasFocus());
    resumeClear();
  }
  win.addEventListener('focus', regainFocus);
  win.addEventListener('pagehide', loseFocus);
  win.addEventListener('pageshow', regainFocus);
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') loseFocus();
    else regainFocus();
  });

  function resize() {
    // Cap the backing surface on Retina displays; simulation and CSS coordinates stay exact.
    const pixelRatio=Math.min(win.devicePixelRatio||1,1920/Math.max(1,canvas.clientWidth));
    resizeView(view, canvas.clientWidth, canvas.clientHeight, pixelRatio);
    if (app.pointer) aimAt(app.pointer.x, app.pointer.y);
    ensureLoop();
  }
  win.addEventListener('resize', resize);
  resize();

  function setText(key, el, value) {
    const text = String(value);
    if (app.hudCache[key] === text) return;
    app.hudCache[key] = text;
    el.textContent = text;
  }
  function setWidth(key, el, ratio) {
    const value = `${Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10}%`;
    if (app.hudCache[key] === value) return;
    app.hudCache[key] = value;
    el.style.width = value;
  }
  function updateHud(run) {
    const p = run.player;
    const b = run.boss;
    const stats = getStats(run);
    setText('php', hudEls['player-hp'], `${Math.ceil(p.hp)} / ${p.maxHp}`);
    setWidth('pbar', hudEls['player-bar'], p.hp / p.maxHp);
    setText('bname', hudEls['boss-name'], b.def.name);
    setText('btitle', hudEls['boss-title'], `${stageTheme(run).name}${b.phase > 1 ? ` · PHASE ${['','I','II','III'][b.phase]}` : ''}`);
    setText('bhp', hudEls['boss-hp'], `${Math.ceil(b.hp)} / ${b.maxHp}`);
    setWidth('bbar', hudEls['boss-bar'], b.hp / b.maxHp);
    hudEls.raid.hidden = !b.raid;
    const encounter=run.encounter?.active?run.encounter:null;
    hudEls.raid.hidden=!b.raid&&!encounter;
    hud.dataset.raid=String(Boolean(b.raid||encounter));
    $('hud-raid-note').hidden=Boolean(encounter);
    if(encounter){setText('raid-round',hudEls['raid-round'],ENCOUNTER_INFO[run.stage].name+' · '+encounterProgress(encounter));setText('raid-hint',hudEls['raid-hint'],ENCOUNTER_INFO[run.stage].hint);} 
    if (b.raid) {
      $('hud-raid-mitigation').textContent = `${Math.round((1 - RAID_DAMAGE_MULTIPLIER) * 100)}%`;
      setText('raid-round', hudEls['raid-round'], `${b.raid.name} · ${b.raid.round + 1} / ${b.raid.total}`);
      setText('raid-hint', hudEls['raid-hint'], b.raid.hint);
    }
    hud.dataset.tutorial=String(Boolean(run.tutorial));
    setText('stage', hudEls.stage, run.tutorial ? '조작 연습 · 실전과 별개' : `결투 ${String(run.stage + 1).padStart(2, '0')} / ${CAMPAIGN.stages.length}`);
    setText('loadout', hudEls.loadout, `${run.cls.name} · ${stats.weapon.name || run.weapon.name} · 회피 ${stats.dodge.label || run.cls.dodge.label}`);
    setText('build-summary', $('hud-build-summary'), `고유 각인 ${stats.uniqueIds.length}/2${stats.uniqueIds.length ? ` · ${stats.buildName}: ${stats.buildDescription}` : ''}`);
    setText('timing-cue', $('hud-timing-cue'), stats.timingMeter ? `공격 타이밍 ${Math.round((run.player.timingPhase || 0) * 10) * 10}% · ${TIMING_WINDOW.start*100}~${TIMING_WINDOW.end*100}% 초록 구간에서 새로 눌러 공격` : `${run.player.comboStep ? `콤보 ${run.player.comboStep} · ` : ''}${run.player.counterTime > 0 ? '반격 성공 · ' : ''}${run.player.overheatTime>0?'과열 냉각 중 · ':''}${run.player.heat > 0 ? `열기 ${Math.round(run.player.heat * 100)}% · ` : ''}${run.boss.wetStacks ? `젖음 ${run.boss.wetStacks}/3 · ` : ''}${run.player.attackHeld ? '공격 유지 중' : ''}`);
    $('hud-timing-cue').hidden=!$('hud-timing-cue').textContent;
    setText('atk', hudEls.attack, p.attackCooldown > 0 ? '공격 중' : '공격 준비');
    setText('weapon-state', hudEls['weapon-state'], stats.chargeTime
      ? `충전 ${Math.min(100, Math.round((p.charge || 0) / stats.chargeTime * 100))}%`
      : stats.magazine
        ? `${stats.weapon.burst>1?'연사 묶음':'탄약'} ${p.ammo} / ${stats.magazine}${p.reloadTime > 0 ? ` · 재장전 ${p.reloadTime.toFixed(1)}초` : ''}`
        : '');
    const storm = getStorm(run);
    setText('storm', hudEls.storm, run.tutorial ? '연습장 · 사망·자기장·보상 없음' : storm.outside
      ? `⚠ 폭풍 밖 · 피해 ${storm.dps}/초 · 반경 ${Math.round(storm.radius)}`
      : !storm.active && !storm.warning
        ? `전장 개방 · ${Math.ceil(storm.warnsIn)}초 후 폭풍 예고`
        : storm.warning
          ? `폭풍 접근 · ${Math.ceil(storm.shrinksIn)}초 후 축소`
          : `장기전 압박 · ${storm.progress < 1 ? `축소 중 · 반경 ${Math.round(storm.radius)}` : '최종 안전 구역'}`);
    hudEls.storm.dataset.outside = String(storm.outside);
    const dodgeName = stats.dodge.label || run.cls.dodge.label;
    setText('dodge', hudEls.dodge, p.dodgeTime > 0 ? `${dodgeName} · 회피 중` : p.dodgeCooldown > 0 ? `${dodgeName} · ${p.dodgeCooldown.toFixed(1)}초` : `${dodgeName} · 준비`);
    setWidth('dbar', hudEls['dodge-bar'], 1 - p.dodgeCooldown / (stats.dodge.cooldown || stats.dodgeCooldown));
    const chain=p.dodgeChainTime>0&&!p.dodgeChainUsed,ready=p.dodgeCooldown<=.001||chain;
    const evade=$('evade-hud');
    evade.dataset.ready=String(ready);evade.style.setProperty('--cooldown',`${Math.max(0,Math.min(1,p.dodgeCooldown/stats.dodgeCooldown))*360}deg`);
    setText('evade-seconds',$('evade-seconds'),ready?'':p.dodgeCooldown.toFixed(1));
    setText('evade-label',$('evade-label'),chain?'한 번 더':ready?'회피 준비':'재사용 대기');
    const evadeDescription=`${dodgeName} · ${chain?'추가 회피 가능':ready?'준비':p.dodgeCooldown.toFixed(1)+'초'}`;
    if(evade.getAttribute('aria-label')!==evadeDescription)evade.setAttribute('aria-label',evadeDescription);
    const counter=$('counter-hud');counter.hidden=!stats.counter;
    evade.dataset.counter=String(!!stats.counter);
    if(stats.counter){
      const ready=p.counterCooldown<=.001;
      counter.dataset.ready=String(ready);counter.dataset.active=String(p.guardTime>0||p.counterTime>0);
      counter.style.setProperty('--cooldown',`${Math.max(0,Math.min(1,p.counterCooldown/stats.counter.cooldown))*360}deg`);
      setText('counter-seconds',$('counter-seconds'),ready?'':p.counterCooldown.toFixed(1));
      setText('counter-label',$('counter-label'),p.guardTime>0?'받아내기':p.counterTime>0?'반격 성공':stats.counter.label);
      counter.setAttribute('aria-label',`Q ${stats.counter.label} · ${ready?'준비':p.counterCooldown.toFixed(1)+'초'} · 정면 타격을 받아내면 즉시 반격`);
    }
    setText('shield', hudEls.shield, p.shield > 0 ? `◇ 보호막 ${Math.ceil(p.shield)}` : `WASD 이동 · ${run.cls.dodge.label} 시작 시 짧은 무적`);
    const low = p.hp / p.maxHp <= 0.3;
    hud.dataset.lowHealth = String(low);
    $('danger-label').hidden = !low;
    let next = null;
    for (const h of run.hazards) if (h.phase === 'warn' && (!next || h.windup-h.t < next.windup-next.t)) next = h;
    const active = run.hazards.find(h => h.phase === 'active');
    let warning = '';
    if (active) warning = `! ${active.raidPressure ? '기믹 견제' : b.pattern?.name || '공격'} · 발동`;
    else if (next) warning = `△ ${next.raidPressure ? '기믹 견제' : b.pattern?.name || '공격'} · ${next.projectile ? '탄 발사 준비' : '범위 충전 중'}`;
    else if (b.state === 'recover') warning = '틈이 생겼습니다 · 반격';
    setText('warn', hudEls.warning, warning);
    // Numeric progress is not live-announced every frame by screen readers.
    setText('cast', hudEls['cast-progress'], next
      ? `${active ? '다음 공격 · ' : ''}${Math.floor(getHazardProgress(next)*100)}% · 100%에 발동`
      : active ? '100% · 공격 중' : '');
    hud.dataset.bossState = active ? 'active' : next ? 'windup' : b.state;
    $('stage-intro').hidden = Boolean(run.tutorial) || app.screen !== 'battle' || run.time - app.stageAt > 1.5 || b.state !== 'idle';
    if(run.tutorial)updateTutorialGuide(run);
  }

  function updateTutorialGuide(run) {
    const t=run.tutorial,goal=getTutorialStep(run),progress=`${goal}/${t.attacked}/${t.dodged}`;
    if(app.hudCache.tutorialProgress===progress)return;
    app.hudCache.tutorialProgress=progress;
    const attack=run.weapon.chargeTime?'마우스로 보스를 조준하고 좌클릭을 누르세요. 놓거나 완충하면 화살이 나갑니다.'
      :run.weapon.magazine?'마우스로 보스를 조준하고 좌클릭하세요. 탄창이 비면 자동으로 재장전합니다.'
      :run.weapon.kind==='melee'?'보스 가까이 가서 마우스로 조준하고 좌클릭하세요.'
      :'마우스로 보스를 조준하고 좌클릭으로 마법을 맞히세요.';
    setText('tutorial-heading',$('tutorial-heading'),['1 / 3 · 움직여 보세요','2 / 3 · 보스를 맞혀 보세요','3 / 3 · 회피해 보세요','이제 보스를 쓰러뜨리세요'][goal]);
    setText('tutorial-description',$('tutorial-description'),['WASD로 조금 움직여 보세요. 원할 때 Esc로 잠시 멈출 수 있습니다.',attack,'이동할 방향과 Space 또는 Ctrl을 누르세요. 예고가 100% 차기 전에 옆으로 피하세요.','세 가지 조작을 익혔습니다. 공격을 이어가면 연습을 마칠 수 있습니다.'][goal]);
    for(const [key,done,label] of [['move',t.walked>=60,'이동 · WASD'],['hit',t.attacked,'명중 · 조준 + 좌클릭'],['dodge',t.dodged,'회피 · Space / Ctrl']])setText(`tutorial-${key}`,$(`tutorial-${key}`),`${done?'✓':'○'} ${label}`);
    const tips={warrior:'전사: 방향을 잡고 짧게 회피합니다.',archer:'궁수: 더 멀리 구릅니다. 회피하면 충전은 취소됩니다.',mage:'마법사: 누르는 순간 원하는 방향으로 순간이동합니다.',gunslinger:'총술사: 구르는 동안에도 사격할 수 있습니다.',fighter:'격투가: 짧은 돌진 뒤 키를 놓고 .45초 안에 다시 누르면 한 번 더!'};
    setText('tutorial-class-tip',$('tutorial-class-tip'),tips[run.cls.id]);
  }

  function ensureLoop() {
    if (!app.rafId) app.rafId = win.requestAnimationFrame(frame);
  }
  function frame() {
    app.rafId = 0;
    app.rafCount++;
    const run = app.run;
    if (run && app.screen === 'battle') {
      if (app.pointer) aimAt(app.pointer.x, app.pointer.y);
      const steps = app.clock.advance(now());
      for (let i = 0; i < steps && run.status === 'playing'; i++) {
        run.step(app.input, STEP);
        app.input.attackPressed = false;
        audio.play(run.events, run);
        run.events.length = 0;
      }
      audio.setScene(app.screen, run);
      if (run.status !== 'playing') {
        resetInput();
        if(run.tutorial&&run.status==='won'){
          showScreen('practice-done');$('practice-return').focus({preventScroll:true});
        }
        else if (run.status === 'reward') showClear();
        else showResult(run.status);
      }
    }
    if (run && (!app.lastHudTime || run.time-app.lastHudTime>=.05 || !Object.keys(app.hudCache).length || app.screen!=='battle')) {updateHud(run);app.lastHudTime=run.time;}
    renderFrame(view, run, run?.time || 0);
    // Frozen screens need no recurring render; resume/selection/resize schedules one.
    if (app.screen === 'battle') ensureLoop();
  }

  drawPortrait($('home-portrait'),{bossId:'rift-lord'});
  renderFrame(view,null,0);
  showScreen('home');
  $('home-start').focus({preventScroll:true});
  app.worldToScreen = (x, y) => worldToScreen(view, x, y);
  return app;
}
