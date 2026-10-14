import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, audioMood, WEAPON_SOUNDS } from '../public/src/audio.mjs';
import { cancelPlayerActions, createInput, createRun, getStats, step } from '../public/src/game.mjs';
import { CLASSES } from '../public/src/content.mjs';
import { CLASS_UNIQUES, FUSIONS } from '../public/src/builds.mjs';
import { STAGES } from '../public/src/stages.mjs';
import { createOlympusRun } from '../public/src/olympus.mjs';
import { encounterFor } from '../public/src/olympus-encounters.mjs';

// Web Audio and timer boundaries only; game and audio controller stay real.
const settle = () => new Promise(resolve => setImmediate(resolve));
function host({ rejectResume = false, failFetch = false, fetchGate = null } = {}) {
  const nodes = [], timers = new Map(), fetched = [];
  const param = (value = 0) => ({ value, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  class AudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'suspended'; this.destination = {}; win.contexts.push(this); }
    async resume() { if (rejectResume) throw new Error('blocked'); this.state = 'running'; }
    async decodeAudioData(data) { return { data, duration: data.url.endsWith('/victory.wav')?1.2:data.url.endsWith('/finale.wav')?2.6:100 }; }
    node(kind) { const node = { kind, frequency: param(), gain: param(), Q: param(), playbackRate: param(1), connect() {}, disconnect() { this.disconnected = true; }, start(at, offset) { this.started = at; this.offset = offset; }, stop(at) { this.stopped = at; }, onended: null }; nodes.push(node); return node; }
    createGain() { return this.node('gain'); }
    createOscillator() { return this.node('oscillator'); }
    createBufferSource() { return this.node('noise'); }
    createBiquadFilter() { return this.node('filter'); }
    createDynamicsCompressor() { return { ...this.node('compressor'), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createBuffer(channels, size) { const data = new Float32Array(size); return { getChannelData: () => data }; }
  }
  let serial = 0;
  const win = { AudioContext, contexts: [], fetch: async url => { fetched.push(String(url)); if (fetchGate) await (typeof fetchGate === 'function' ? fetchGate(String(url)) : fetchGate); return { ok: !failFetch, status: failFetch ? 404 : 200, arrayBuffer: async () => ({url:String(url)}) }; }, setInterval(fn) { timers.set(++serial, fn); return serial; }, clearInterval(id) { timers.delete(id); } };
  return { win, nodes, timers, fetched, sources: () => nodes.filter(n => n.kind === 'oscillator' || n.kind === 'noise') };
}

test('audio unlock loads music after gesture; mute/focus/pause stop every source', async () => {
  const h = host(), audio = createAudio(h.win), run = createRun();
  audio.setScene('home');
  assert.equal(h.win.contexts.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(h.win.contexts.length, 1);
  await settle();
  assert.equal(h.timers.size, 0);
  assert.ok(h.sources().length > 0);
  await audio.unlock();
  assert.equal(h.win.contexts.length, 1);
  assert.equal(h.timers.size, 0);
  for (const stop of [() => audio.setMuted(true), () => audio.setActive(false), () => audio.setScene('pause', run), () => audio.setVolume(0)]) {
    audio.setMuted(false); audio.setActive(true); audio.setVolume(.5); audio.setScene('battle', run);
    stop();
    assert.equal(h.timers.size, 0);
    assert.ok(h.sources().every(n => n.disconnected), 'even future scheduled notes must not replay');
    assert.ok(h.nodes.filter(n => n.kind === 'filter').every(n => n.disconnected), 'effect filters disconnect too');
  }
});

test('weapon-specific swings remain distinct and flesh impacts avoid the metallic pan hit',async()=>{
  const h=host(),audio=createAudio(h.win),run=createRun();audio.setScene('battle',run);await audio.unlock();await settle();
  for(const [weaponId,expected] of [['sword','sword-'],['bow','bow.wav'],['revolver','revolver.wav']]){
    h.win.contexts[0].currentTime+=1;const before=h.sources().length;
    audio.play([{type:'swing',weaponId}],run);
    assert.ok(h.sources().slice(before).some(s=>s.buffer?.data?.url.includes(expected)),weaponId);
  }
  h.win.contexts[0].currentTime+=1;let before=h.sources().length;
  audio.play([{type:'bossHit',weaponId:'sword',damage:30}],run);
  const hit=h.sources().slice(before);assert.ok(hit.some(s=>s.buffer?.data?.url.includes('punch-')));
  assert.ok(hit.every(s=>!s.buffer?.data?.url.includes('/metal.wav')));
  h.win.contexts[0].currentTime+=1;before=h.sources().length;
  audio.play([{type:'bossAttack',bossId:'aergia',kind:'debris'}],run);
  assert.ok(h.sources().slice(before).some(s=>s.buffer?.data?.url.includes('cloth2.wav')));
});

test('Aergia chains sound on release even when dodged, and use chain foley again on pull',async()=>{
  const h=host(),audio=createAudio(h.win),r=createOlympusRun();encounterFor(r).entrance.finish(r);
  audio.setScene('battle',r);await audio.unlock();await settle();
  r.events=[];r.combatRng=()=>.625;r.olympus.nextAttack=0;
  let releases=0;
  for(let i=0;i<180;i++){
    r.player.dodgeTime=1;r.step(createInput());h.win.contexts[0].currentTime+=1/60;
    const before=h.sources().length;audio.play(r.events,r);
    if(r.events.some(e=>e.type==='bossAttack'&&e.kind==='chains')){
      releases++;assert.ok(h.sources().slice(before).some(s=>s.buffer?.data?.url.endsWith('/chain.wav')));
      assert.equal(r.olympus.grab,null);
    }
    r.events=[];
  }
  assert.equal(releases,1);
  const before=h.sources().length;audio.play([{type:'olympusChain'}],r);
  assert.ok(h.sources().slice(before).some(s=>s.buffer?.data?.url.endsWith('/chain.wav')));
  audio.setScene('pause',r);assert.ok(h.sources().every(s=>s.disconnected));
});

test('the real three-volley chain plays each throw once and ends with a heavy stone slam',async()=>{
  const h=host(),audio=createAudio(h.win),r=createOlympusRun();encounterFor(r).entrance.finish(r);
  audio.setScene('battle',r);await audio.unlock();await settle();
  r.player.x=1000;r.player.y=280;r.combatRng=()=>.375;r.olympus.nextAttack=0;r.events=[];
  let throws=0,slams=0;
  for(let i=0;i<320&&!slams;i++){
    r.step(createInput());h.win.contexts[0].currentTime+=1/60;const before=h.sources().length;audio.play(r.events,r);
    const sources=h.sources().slice(before),has=file=>sources.some(s=>s.buffer?.data?.url.endsWith('/'+file));
    for(const e of r.events)if(e.type==='bossAttack'){
      if(e.kind==='debris'){throws++;assert.ok(has('cloth2.wav'));}
      if(e.kind==='slam'){slams++;assert.ok(has('stone.wav')&&has('glass.wav'));}
    }
    r.events=[];
  }
  assert.equal(throws,3);assert.equal(slams,1);
});

test('browser-interrupted context can unlock while paused without sounding until resume', async () => {
  const h=host(),audio=createAudio(h.win),r=createRun();
  await audio.unlock(); audio.setScene('pause',r);
  h.win.contexts[0].state='suspended';
  assert.equal(await audio.unlock(),true); assert.equal(h.timers.size,0);
  audio.setScene('battle',r); await settle();
  const count=h.sources().length;
  for(let i=0;i<60;i++)audio.setScene('battle',r);
  assert.equal(h.sources().length,count,'unchanged frames do not restart track');
  audio.setVolume(3); assert.equal(h.nodes.find(n=>n.kind==='gain').gain.value,1);
  audio.setVolume(NaN); assert.equal(h.timers.size,0);
  audio.setVolume(-1); assert.equal(h.timers.size,0);
});

test('boss rush mood follows real battle danger, never frozen preview or pause', () => {
  const r = createRun();
  assert.equal(audioMood('home'), 'menu');
  assert.equal(audioMood('battle', r), 'battle');
  r.player.hp = r.player.maxHp * .3;
  assert.equal(audioMood('battle', r), 'danger');
  assert.equal(audioMood('briefing', r), 'menu');
  assert.equal(audioMood('pause', r), 'silent');
  r.player.hp = r.player.maxHp;
  for (const change of [() => r.boss.phase = 2, () => r.boss.raid = {}, () => r.encounter = { active: true }]) {
    r.boss.phase = 1; r.boss.raid = null; r.encounter = null; change();
    assert.equal(audioMood('battle', r), 'danger');
  }
});

test('entering low-HP battle replaces menu music', async () => {
  const h = host(), audio = createAudio(h.win), run = createRun();
  audio.setScene('home'); await audio.unlock(); await settle();
  const menu = h.sources().find(source => source.loop === true);
  run.player.hp = run.player.maxHp * .2;
  audio.setScene('battle', run); await settle();
  assert.ok(menu.disconnected);
  assert.ok(h.sources().some(source => source.loop === true && source !== menu));
});

test('all base/unique/fusion emissions carry effective weapon; accepted dodges carry effective kind', () => {
  for (const cls of CLASSES) for (const weapon of cls.weapons) {
    const builds = [[], ...CLASS_UNIQUES[cls.id].map(id => [id]), ...FUSIONS.filter(f => CLASS_UNIQUES[cls.id].includes(f.ids[0])).map(f => f.ids)];
    for (const ids of builds) {
      const r = createRun({ classId: cls.id, weaponId: weapon.id });
      r.boss.timer = 1000; r.boss.def = { ...r.boss.def, speed: 0, raid: null };
      for (const id of ids) r.cards[id] = 1;
      const input = { ...createInput(), attack: true, attackPressed: true, aimX: r.boss.x, aimY: r.boss.y };
      for (let i = 0; i < 100; i++) step(r, input);
      const sounds = r.events.filter(e => e.type === 'swing');
      assert.ok(sounds.length, `${weapon.id}/${ids}`);
      assert.ok(sounds.every(e => e.weaponId === getStats(r).weapon.id), `${weapon.id}/${ids}: sound must follow transformed weapon`);
      assert.ok(sounds.every(e => WEAPON_SOUNDS[e.weaponId]), `${weapon.id}/${ids}: transformed weapon needs a recorded sound profile`);
      input.attack = false; input.dodge = true;
      step(r, input);
      assert.equal(r.events.find(e => e.type === 'dodge').kind, getStats(r).dodge.kind);
    }
  }
});

test('new click immediately after resume can fire; held old input stays blocked and silent', () => {
  for (const [classId, weaponId] of [['gunslinger','revolver'],['archer','bow']]) {
    const r = createRun({classId,weaponId}); r.boss.timer=1000;
    cancelPlayerActions(r);
    const input = {...createInput(),attack:true};
    step(r,input);
    assert.equal(r.player.charge,0); assert.ok(!r.events.some(e=>e.type==='swing'));
    input.attackPressed=true; step(r,input);
    assert.ok(weaponId==='bow' ? r.player.charge>0 : r.events.some(e=>e.type==='swing'));
  }
});

test('twelve weapons sound different; impact is distinct; spam is bounded and does not mutate combat', async () => {
  const signatures = [];
  for (const cls of CLASSES) for (const w of cls.weapons) {
    const h = host(), audio = createAudio(h.win), r = createRun({ classId: cls.id, weaponId: w.id });
    audio.setScene('battle', r); await audio.unlock();await settle();
    let start = h.nodes.length;
    const before = JSON.stringify(r);
    audio.play([{ type: 'swing', weaponId: w.id }], r);
    const signature = h.nodes.slice(start).map(n => [n.kind, n.buffer?.data?.url, n.gain.value, n.playbackRate.value]);
    signatures.push(JSON.stringify(signature));
    start = h.nodes.length;
    audio.play([{ type: 'bossHit', damage: 10, weaponId: w.id }], r);
    assert.notDeepEqual(h.nodes.slice(start).map(n => [n.kind, n.buffer?.data?.url, n.gain.value, n.playbackRate.value]), signature);
    start = h.sources().length;
    audio.play(Array.from({ length: 256 }, () => ({ type: 'bossHit', damage: 10 })), r);
    assert.equal(h.sources().length, start);
    assert.equal(JSON.stringify(r), before);
    audio.setMuted(true);
  }
  assert.equal(new Set(signatures).size, 12);
});

test('recorded music has no render-loop scheduler; effects remain bounded and clean up', async () => {
  const h = host(), audio = createAudio(h.win), r = createRun();
  audio.setScene('battle', r); await audio.unlock();
  await settle();
  assert.equal(h.timers.size, 0);
  const first = h.sources()[0]; first.onended(); assert.ok(first.disconnected);
  for (let i = 0; i < 500; i++) {
    h.win.contexts[0].currentTime += .2;
    audio.play([{ type: 'swing' }, { type: 'bossHit', damage: 10 }, { type: 'playerHit', damage: 10 }], r);
  }
  assert.ok(h.sources().filter(n => !n.disconnected).length <= 64);
  audio.setActive(false);
  assert.ok(h.sources().every(n => n.disconnected));
  assert.equal(h.timers.size, 0);
});

test('recorded tracks switch by scene; clear fanfare survives reward and preview back-out never replays it', async () => {
  const h = host(), audio = createAudio(h.win), r = createRun();
  audio.setScene('home'); await audio.unlock(); await settle();
  assert.equal(h.fetched.length, 1, 'only menu cue loads before battle or victory');
  assert.ok(h.fetched.some(url => url.endsWith('/score-v5/menu.m4a')));
  const menu = h.sources().find(source => source.loop === true);
  assert.ok(menu);
  audio.setScene('battle', r); await settle();
  const battle = h.sources().find(source => source.loop === true && source !== menu);
  assert.ok(menu.disconnected); assert.ok(battle);
  r.player.hp = r.player.maxHp * .2;
  audio.setScene('battle', r); await settle();
  assert.equal(battle.disconnected, undefined, 'danger mode remains on battle loop');
  audio.setScene('clear', r); await settle();
  const fanfare = h.sources().find(source => source.loop === false);
  assert.ok(fanfare);
  assert.ok(h.fetched.some(url => url.endsWith('/score-v5/victory.wav')));
  audio.setScene('reward', r);
  assert.equal(fanfare.disconnected, undefined, 'clear->reward keeps fanfare alive');
  audio.setScene('briefing', r);
  assert.equal(fanfare.disconnected,undefined,'card preview must not cut celebration short');
  audio.setScene('reward',r);
  assert.equal(fanfare.disconnected,undefined,'back-out continues same cue without replay');
  const fanfareCount = h.sources().filter(source => source.loop === false).length;
  audio.setScene('briefing', r);
  assert.equal(h.sources().filter(source => source.loop === false).length, fanfareCount);
  audio.setScene('battle', r); audio.setScene('won', r); await settle();
  assert.ok(h.sources().filter(source => source.loop === false).length > fanfareCount, 'final win starts final-length cue');
  assert.ok(h.fetched.some(url => url.endsWith('/score-v5/finale.wav')));
  const finalCue = h.sources().filter(source => source.loop === false).at(-1);
  finalCue.onended();
  assert.ok(h.sources().some(source => source.loop === true && !source.disconnected), 'final cue returns to menu loop');
  const oldClear = fanfare;
  audio.setScene('battle', r); audio.setScene('clear', r); await settle();
  assert.ok(oldClear.disconnected, 'each new clear restarts its short fanfare');
  audio.setScene('dead', r); audio.play([{ type: 'dead' }], r);
  assert.ok(h.sources().filter(n => n.kind === 'noise').length > 0, 'death event remains audible after scene switch');
});

test('pause stops fanfare and resume continues at saved offset', async () => {
  const h = host(), audio = createAudio(h.win), run = createRun();
  audio.setScene('clear', run); await audio.unlock(); await settle();
  const fanfare = h.sources().find(source => source.loop === false);
  h.win.contexts[0].currentTime = .4;
  audio.setScene('pause', run);
  assert.ok(fanfare.disconnected);
  audio.setScene('clear', run); await settle();
  const resumed = h.sources().filter(source => source.loop === false).at(-1);
  assert.equal(resumed.offset, .4);
});

test('leaving pause for menu selects menu music, never resumed battle',async()=>{
  const h=host(),audio=createAudio(h.win),r=createRun();
  await audio.unlock();await settle();const menu=h.sources().find(n=>n.loop);
  audio.setScene('battle',r);await settle();audio.setScene('pause',r);audio.setScene('start');await settle();
  assert.equal(h.sources().filter(n=>n.loop&&!n.disconnected).at(-1).buffer,menu.buffer);
});
test('blur or mute resumes the fanfare offset, not its first note',async()=>{
  const h=host(),audio=createAudio(h.win),r=createRun();audio.setScene('clear',r);await audio.unlock();await settle();
  h.win.contexts[0].currentTime=.4;audio.setActive(false);h.win.contexts[0].currentTime=10;audio.setActive(true);
  assert.equal(h.sources().filter(n=>n.loop===false).at(-1).offset,.4);
  h.win.contexts[0].currentTime=10.2;audio.setMuted(true);h.win.contexts[0].currentTime=20;audio.setMuted(false);
  assert.ok(Math.abs(h.sources().filter(n=>n.loop===false).at(-1).offset-.6)<1e-9);
});
test('death effect survives real play(events) then setScene ordering',async()=>{
  const h=host(),audio=createAudio(h.win),r=createRun();audio.setScene('battle',r);await audio.unlock();await settle();
  audio.play([{type:'dead'}],r);audio.setScene('dead',r);
  assert.ok(h.sources().some(n=>n.buffer?.data?.url.endsWith('/stone.wav')&&!n.disconnected));
});
test('slow optional victory fetch cannot block menu cue', async () => {
  const gate = {};
  gate.promise = new Promise(resolve => { gate.resolve = resolve; });
  const h = host({ fetchGate: url => url.includes('victory') ? gate.promise : Promise.resolve() });
  const audio = createAudio(h.win);
  audio.setScene('home'); await audio.unlock(); await settle();
  assert.ok(h.sources().some(source => source.loop === true), 'menu plays before optional victory is requested');
  audio.setScene('clear');
  assert.ok(!h.sources().some(source => source.loop === false), 'delayed victory does not start early');
  gate.resolve(); await settle();
});

test('failed fetch and late decode after scene change cannot start stale music', async () => {
  const failed = host({ failFetch: true }), noMusic = createAudio(failed.win);
  noMusic.setScene('battle', createRun()); await noMusic.unlock(); await settle();
  assert.equal(failed.sources().length, 0);
  const gate = {};
  gate.promise = new Promise(resolve => { gate.resolve = resolve; });
  const delayed = host({ fetchGate: gate.promise }), audio = createAudio(delayed.win);
  audio.setScene('clear', createRun()); await audio.unlock();
  audio.setScene('home', createRun()); gate.resolve(); await settle(); await settle();
  assert.ok(delayed.sources().every(source => source.loop === true), 'stale victory request must not play after backing out');
});

test('transient music failure retries on unmute without hammering requests on combat input',async()=>{
  const h=host({failFetch:true}),audio=createAudio(h.win);await audio.unlock();await settle();
  let retries=0;h.win.fetch=async url=>{retries++;return {ok:true,arrayBuffer:async()=>({url:String(url)})};};
  await audio.unlock();await settle();assert.equal(retries,0,'failed requests have a five-second backoff');
  audio.setMuted(true);audio.setMuted(false);await settle();
  assert.equal(retries,1);assert.ok(h.sources().some(n=>n.loop&&!n.disconnected));
});
test('finale is prefetched near last boss, not on initial loadout selection',async()=>{
  const h=host(),audio=createAudio(h.win),r=createRun();await audio.unlock();audio.setScene('start');await settle();
  assert.ok(h.fetched.some(u=>u.endsWith('victory.wav')));assert.ok(!h.fetched.some(u=>u.endsWith('finale.wav')));
  r.stage=18;audio.setScene('briefing',r);await settle();assert.ok(h.fetched.some(u=>u.endsWith('finale.wav')));
});
test('unsupported or denied audio does not fail game; late unlock respects mute and hidden state', async () => {
  const missing = createAudio({});
  assert.equal(await missing.unlock(), false);
  missing.setScene('battle', createRun()); missing.play([{ type: 'playerHit', damage: 20 }], createRun());
  const denied = host({ rejectResume: true });
  assert.equal(await createAudio(denied.win).unlock(), false);
  assert.equal(denied.timers.size, 0);
  const h = host(), audio = createAudio(h.win);
  const promise = audio.unlock(); audio.setActive(false); audio.setMuted(true);
  await promise;
  assert.equal(h.timers.size, 0);
  assert.equal(h.sources().length, 0);
});

test('all stage scores switch without per-frame restart and old decoded scores are evicted',async()=>{
  const h=host(),audio=createAudio(h.win),r=createRun();
  await audio.unlock();await settle();
  for(let stage=0;stage<20;stage++){
    r.stage=stage;audio.setScene('briefing',r);await settle();audio.setScene('battle',r);await settle();
    const active=h.sources().filter(n=>n.loop&&!n.disconnected);
    assert.equal(active.length,1);assert.ok(active[0].buffer.data.url.endsWith(`/score-v5/${STAGES[stage].music}.m4a`));
    const count=h.sources().length;for(let i=0;i<60;i++)audio.setScene('battle',r);
    assert.equal(h.sources().length,count);
  }
  assert.ok(h.fetched.filter(u=>u.endsWith('/score-v5/drums.m4a')).length>=2,'a distant old score is loaded again after eviction');
  assert.equal(h.timers.size,0);
  h.win.contexts[0].currentTime+=1;audio.play([{type:'dodge',kind:'roll'},{type:'bossAttack',heavy:true}],r);
  assert.ok(h.sources().some(n=>n.buffer?.data?.url.includes('/foley/roll.ogg')&&!n.disconnected));
  audio.setScene('pause',r);assert.ok(h.sources().every(n=>n.disconnected));
});
