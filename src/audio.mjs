import { getStats, getStorm } from './game.mjs';
import { stageTheme } from './stages.mjs';

export const WEAPON_SOUNDS = Object.freeze({
  sword:{swing:['sword-a','sword-b'],hit:['punch-b','punch-a'],gain:.65,hitRate:.88},
  spear:{swing:['thrust'],hit:['punch-a'],rate:1.08,gain:.58,hitRate:1.08},
  axe:{swing:['sword-b'],hit:['wood','kick'],rate:.75,gain:.8},
  bow:{swing:['bow'],hit:['wood'],gain:.6},
  crossbow:{swing:['bow'],hit:['wood'],rate:1.24,gain:.72},
  fire:{swing:['fire'],hit:['flame'],gain:.66},water:{swing:['water-a','water-b'],hit:['water-b'],gain:.67},
  lightning:{swing:['spark'],hit:['glass'],gain:.5,rate:1.15},
  revolver:{swing:['revolver'],hit:['punch-a'],gain:.62},sniper:{swing:['rifle'],hit:['kick'],gain:.82},
  punch:{swing:['cloth2'],hit:['punch-a','punch-b'],gain:.85},kick:{swing:['cloth4'],hit:['kick'],gain:.9},
  boomerang:{swing:['sword-a'],hit:['wood'],rate:1.32,gain:.48},dagger:{swing:['thrust'],hit:['punch-a'],rate:1.24,gain:.5},
  'battle-staff':{swing:['cloth4'],hit:['wood'],gain:.68},beam:{swing:['arcane'],hit:['spark'],rate:1.2,gain:.26},
  meteor:{swing:['arcane'],hit:['stone'],rate:.8,gain:.42},shotgun:{swing:['shotgun'],hit:['kick'],gain:.78},
  cannon:{swing:['shotgun'],hit:['stone'],rate:.65,gain:.88},'fragment-shell':{swing:['shotgun'],hit:['glass'],rate:.8,gain:.74},
  machinegun:{swing:['machinegun'],hit:['punch-a'],gain:.36},'dual-pistols':{swing:['pistol'],hit:['punch-b'],gain:.52},
  flamethrower:{swing:['flame'],hit:['fire'],gain:.29},
});
export const COMBAT_SAMPLES=Object.freeze(['sword-a','sword-b','thrust','fire','flame','spark','arcane','water-a','water-b','water-burst','stone','wood','metal','punch-a','punch-b','kick','guard','glass','bell','revolver','rifle','shotgun','machinegun','pistol','bow','cloth2','cloth4','chain']);
export const MUSIC = Object.freeze(Object.fromEntries([
  ...['menu','iron','drums','ember','frost','storm','abyss','final'].map(name=>[name,[`score-v5/${name}.m4a`,true]]),
  ...['victory','finale'].map(name=>[name,[`score-v5/${name}.wav`,false]]),
  ...COMBAT_SAMPLES.map(name=>[`sfx-${name}`,[`combat-v5/${name}.wav`,false,'sfx']]),
  ...['roll','dash','cast'].map(name=>[`sfx-${name}`,[`foley/${name}.ogg`,false,'sfx']]),
]));

export function audioMood(screen, run) {
  if (screen === 'pause' || screen === 'loading') return 'silent';
  if (screen !== 'battle' || !run) return 'menu';
  return run.player.hp / run.player.maxHp <= .3 || run.boss.phase > 1 || run.boss.raid
    || run.encounter?.active || getStorm(run).outside ? 'danger' : 'battle';
}

export function createAudio(win) {
  let context, master, music, effects;
  let soundSerial=0;
  let mode = 'menu', screen = 'home', active = true, muted = false, volume = .45;
  let desiredMusic = 'menu', musicSource = null, musicOffset = 0, nearFinal = false;
  let battleTrack='iron';
  const buffers = new Map(), requested = new Set(), failedAt = new Map(), voices = new Set(), lastSound = new Map();
  const enabled = () => active && !muted && volume > 0 && mode !== 'silent';
  const ready = () => enabled() && context?.state === 'running';

  function stopSource(source) {
    source.onended = null;
    try { source.stop(); } catch {}
    source.disconnect();
  }
  function stopVoices() { for (const voice of [...voices]) voice.clean(); }
  function stopMusic(preservePosition = true) {
    if (musicSource) {
      const elapsed=musicSource.offset+context.currentTime-musicSource.startedAt;
      musicOffset=preservePosition?elapsed%musicSource.source.buffer.duration:0;
      stopSource(musicSource.source);musicSource.envelope.disconnect();
    }
    musicSource = null;
  }
  function syncMusic() {
    if (!ready()) { stopVoices(); stopMusic(); return; }
    master.gain.setTargetAtTime(volume, context.currentTime, .025);
    if (musicSource && musicSource.name !== desiredMusic) stopMusic(false);
    if (musicSource || !buffers.has(desiredMusic)) return;
    if(voices.size>=64)voices.values().next().value.clean();
    const [, loop] = MUSIC[desiredMusic];
    const source = context.createBufferSource(),envelope=context.createGain(),at=context.currentTime;
    source.buffer = buffers.get(desiredMusic);source.loop = loop;source.connect(envelope);envelope.connect(music);
    const offset=musicOffset,remaining=source.buffer.duration-offset;
    envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(1,at+.035);
    if(!loop){envelope.gain.setValueAtTime(1,at+Math.max(.035,remaining-.08));envelope.gain.linearRampToValueAtTime(0,at+remaining);}
    musicSource = { source,envelope,name:desiredMusic,offset,startedAt:at };
    source.onended = () => {
      source.disconnect();envelope.disconnect();
      if (musicSource?.source === source) {
        musicSource = null;musicOffset=0;
        if (!loop) { desiredMusic = 'menu';syncMusic();void requestMusic('menu'); }
      }
    };
    source.start(0, offset);
  }
  async function requestMusic(name) {
    if (requested.has(name) || !win.fetch || !context || context.currentTime-(failedAt.get(name)??-Infinity)<5) return;
    requested.add(name);
    const [file] = MUSIC[name];
    try {
      const url = new URL(`../assets/audio/${file.split('/').map(encodeURIComponent).join('/')}`, import.meta.url);
      const response = await bounded(win.fetch(url), 8000);
      if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
      const bytes = await bounded(response.arrayBuffer(), 8000);
      const buffer = await bounded(context.decodeAudioData(bytes), 8000);
      buffers.set(name, buffer);
      // Retain menu + two stage tracks; short stingers/foley have a fixed small footprint.
      const long=[...buffers.keys()].filter(key=>MUSIC[key][1]);
      while(long.length>3){const old=long.find(key=>key!==desiredMusic&&key!==battleTrack&&key!=='menu');if(!old)break;
        buffers.delete(old);requested.delete(old);long.splice(long.indexOf(old),1);}
      if (desiredMusic === name) syncMusic();
    } catch {
      requested.delete(name);failedAt.set(name,context.currentTime);
    }
  }
  function bounded(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Audio operation timed out')), ms);
      timer.unref?.();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  function reconcile() {
    if (!ready()) { stopVoices(); stopMusic(); return; }
    syncMusic();void requestMusic(desiredMusic);
    if(['start','briefing','battle'].includes(screen))for(const name of [battleTrack,'victory',...COMBAT_SAMPLES.map(s=>'sfx-'+s),...['roll','dash','cast'].map(s=>'sfx-'+s)])void requestMusic(name);
    if(nearFinal)void requestMusic('finale');
  }
  function permitted(key, interval) {
    const now = context.currentTime;
    if (now - (lastSound.get(key) ?? -Infinity) < interval) return false;
    lastSound.set(key, now); return true;
  }
  function sample(name,level=.5,rate=1){
    const buffer=buffers.get('sfx-'+name);if(!buffer||voices.size+(musicSource?1:0)>=64)return false;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=rate;
    gain.gain.value=level;source.connect(gain);gain.connect(effects);
    const entry={clean(){source.onended=null;try{source.stop();}catch{}source.disconnect();gain.disconnect();voices.delete(entry);}};
    source.onended=entry.clean;voices.add(entry);source.start();return true;
  }
  function impact(id, hit, event={}) {
    const profile=WEAPON_SOUNDS[id]||WEAPON_SOUNDS.sword;
    const names=hit?profile.hit:profile.swing,name=names[soundSerial++%names.length];
    const level=(hit?.45:profile.gain)*(event.secondary?.45:1),rate=(profile.rate||1)*(1+(soundSerial%3-1)*.018);
    sample(name,level,hit?(profile.hitRate||1):rate);
    if(!hit&&['sword','spear','axe','dagger','boomerang'].includes(id))sample(id==='axe'?'cloth4':'cloth2',.16,profile.rate||1);
    if(!hit&&event.charged&&event.power>=.95)sample('arcane',.2,.72);
    if(!hit&&event.elastic)sample('cloth4',.22,.8);
    if(!hit&&id==='crossbow')sample('metal',.12,1.4);
    if(hit&&id==='axe')sample('kick',.25,.88);
  }
  function warning() { sample('bell',.32,.7);sample('stone',.22,.85); }

  return {
    async unlock() {
      if (!active || muted || volume <= 0) return false;
      try {
        if (!context) {
          const AudioContext = win.AudioContext || win.webkitAudioContext;
          if (!AudioContext) return false;
          context = new AudioContext();
          master = context.createGain(); music = context.createGain(); effects = context.createGain();
          master.gain.value = 0; music.gain.value = .48; effects.gain.value = .85;
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 8;
          limiter.attack.value = .003; limiter.release.value = .12;
          music.connect(master); effects.connect(master); master.connect(limiter); limiter.connect(context.destination);

        }
        if (context.state !== 'running') await context.resume();
        reconcile();
        return context.state === 'running';
      } catch { return false; }
    },
    setVolume(value) { if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(1, value)); reconcile(); },
    setMuted(value) { muted = Boolean(value);if(!muted)failedAt.clear();reconcile(); },
    setActive(value) { active = Boolean(value); reconcile(); },
    setScene(nextScreen, run) {
      const previous = screen, changed = previous !== nextScreen, nextMode = audioMood(nextScreen, run);
      const nextBattle=stageTheme(run).music;
      if (!changed && mode === nextMode && nearFinal===(run?.stage>=18)&&battleTrack===nextBattle) return;
      battleTrack=nextBattle;
      nearFinal=run?.stage>=18;
      if (changed) { stopVoices(); lastSound.clear(); }
      screen = nextScreen; mode = nextMode;
      let nextMusic = desiredMusic;
      if (nextScreen === 'pause') stopMusic();
      else if (nextScreen === 'clear'||nextScreen==='practice-done') nextMusic = 'victory';
      else if (nextScreen === 'won') nextMusic = 'finale';
      else if (['reward','briefing'].includes(nextScreen) && desiredMusic === 'victory') { /* Card preview keeps the same celebration, never replaying it. */ }
      else if (mode === 'battle' || mode === 'danger') nextMusic = battleTrack;
      else if (mode === 'menu') nextMusic = 'menu';
      if (nextMusic !== desiredMusic || ['clear','won','practice-done'].includes(nextScreen) && changed && previous !== 'pause') {
        stopMusic(false);musicOffset=0;desiredMusic=nextMusic;
      }
      if(ready()){
        music.gain.cancelScheduledValues(context.currentTime);
        music.gain.setTargetAtTime(mode==='danger'?.55:.48,context.currentTime,.12);
      }
      reconcile();
      if(changed&&nextScreen==='dead'&&ready()){
        sample('stone',.65,.7);
      }
    },
    play(events, run) {
      if (!ready() || !events.length) return;
      if (screen !== 'battle' || !run) return;
      const weaponId = getStats(run).weapon.id;
      for (const event of events) {
        if (event.type==='swing'&&permitted('swing',.035))impact(event.weaponId||weaponId,false,event);
        else if(event.type==='bossHit'&&event.damage>0&&permitted('impact',.06))impact(event.weaponId||weaponId,true,event);
        else if(event.type==='dodge'&&permitted('dodge',.07))sample(event.kind==='blink'?'arcane':event.kind==='roll'?'roll':'dash',.6,event.kind==='blink'?1.2:1);
        else if(event.type==='bossMove'&&permitted('boss-move',.15))sample('arcane',.4,.8);
        else if(event.type==='olympusIntroEnd'){sample('bell',.38,.64);sample('stone',.48,.7);}
        else if(event.type==='olympusSleep'){sample('cloth4',.42,.7);sample('bell',.15,.6);}
        else if(event.type==='olympusChain')sample('chain',.8,.72);
        else if(event.type==='olympusPickup')sample('stone',.3,1.45);
        else if(event.type==='olympusSmash'){sample('stone',.95,.65);sample('glass',.5,.8);}
        else if(event.type==='olympusWipe'){sample('stone',.75,.55);sample('bell',.3,.55);}
        else if(event.type==='olympusEnrage')sample('kick',.65,.7);
        else if(event.type==='bossAttack'&&permitted('boss-attack',.12)){
          if(event.bossId==='aergia'){
            const sounds={debris:['cloth2',.6,1.35],sweep:['cloth4',.75,.8],punish:['cloth4',.75,.85],charge:['cloth4',.65,.65],chains:['chain',.9,.8],cross:['stone',.85,.72],rubble:['stone',.5,1.1],slam:['stone',1,.65],rebuke:['stone',1,.6]};
            if(event.kind==='rebuke'||event.kind==='slam')sample('glass',.4,.65);
            const cue=sounds[event.kind]||['cloth4',.55,.8];sample(...cue);continue;
          }
          const family=stageTheme(run).sound;
          const material={steel:'sword-b',glass:'glass',ice:'glass',void:'arcane',lightning:'spark',water:'water-burst',fire:'fire',stone:'stone',cannon:'shotgun',flesh:'kick'}[family]||'guard';
          sample(material,event.heavy?.78:.57,event.heavy?.8:1);
        }else if(['telegraph','counterWarning'].includes(event.type)&&permitted('boss-windup',.5))sample('guard',.15,1.2);
        else if((event.type==='playerHit'||event.type==='stormHit')&&event.damage>0&&permitted('hurt',.15)){
          sample('kick',.8,.85);music.gain.setTargetAtTime(.3,context.currentTime,.01);
          music.gain.setTargetAtTime(mode==='danger'?.55:.48,context.currentTime+.12,.15);
        }else if(['phase','encounter','raid'].includes(event.type)&&permitted('warning',1.2))warning();
        else if(event.type==='counterReady'&&permitted('counter-ready',.1))sample(event.kind==='slip'?'cloth2':'metal',.3,1.15);
        else if(event.type==='counter'&&permitted('counter',.1)){
          sample(event.kind==='slip'?'punch-b':'guard',.85,1.1);sample('bell',.17,1.65);
        }else if(event.type==='waterBurst'&&permitted('water-burst',.15))sample('water-burst',.8,.95);
        else if(['spellImpact','fragmentBurst'].includes(event.type)&&permitted('explosion',.1))sample(event.element==='water'?'water-burst':event.element==='fire'?'fire':'stone',event.secondary?.45:.7,.85);
        else if(event.type==='finisher'&&permitted('finisher',.1))sample('cloth4',.55,.8);
        else if(['reflect','sigilBroken'].includes(event.type)&&permitted('accent',.12))sample('glass',.55,1.15);
      }

    },
  };
}
