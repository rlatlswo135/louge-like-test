import { OLYMPUS_GODS, olympusRoute } from './olympus-catalog.mjs';
import { createOlympusRun } from './olympus.mjs';
import { encounterFor } from './olympus-encounters.mjs';
import { createClock, createInput } from './game.mjs';
import { STEP, CARDS } from './content.mjs';
import { createAudio } from './audio.mjs';
import { loadOlympusArt, createOlympusView, resizeOlympus, renderOlympus, screenToOlympus } from './olympus-render.mjs';

const $=id=>document.getElementById(id);
const number=olympusRoute(location.pathname),god=OLYMPUS_GODS.find(g=>g.number===number);
const isCatalog=/^\/gods\/?$/.test(location.pathname);
const two=n=>String(n).padStart(2,'0');
if(isCatalog){
  for(const g of OLYMPUS_GODS){
    const link=document.createElement('a');link.className=`god-link${g.ready?' ready':''}${g.number>=48?' final':''}`;link.href=`/${two(g.number)}`;
    for(const [tag,cls,text] of [['span','num',two(g.number)],['strong','',g.name],['span','domain',g.title],['span','availability',g.ready?'도전 가능 ↗':'준비 중']]){
      const el=document.createElement(tag);el.className=cls;el.textContent=text;link.append(el);
    }
    $('god-list').append(link);
  }
  $('catalog').hidden=false;$('loading').hidden=true;
}else if(!god?.ready){
  document.title=`${god?two(number)+' · '+god.name:'올림푸스'} | 신전 준비 중`;
  $('pending-number').textContent=god?two(number):'—';$('pending-name').textContent=god?.name||'올림푸스로 가는 길';
  $('pending-latin').textContent=god?.latin?.toUpperCase()||'OLYMPUS';$('pending-title').textContent=god?.title||'신을 선택해 도전하세요.';
  $('pending').hidden=false;$('loading').hidden=true;
}else void boot().catch(error=>{
  console.error('Olympus startup failed',error);$('loading').hidden=false;
  $('loading-note').textContent='신전 그림을 불러오지 못했습니다. 서버와 연결을 확인한 뒤 다시 시도해 주세요.';
  $('retry-load').hidden=false;
});

async function boot(){
  document.title='01 · 아에르기아 | 올림푸스';
  const art=await loadOlympusArt(window),canvas=$('arena'),view=createOlympusView(canvas,art);
  const input=createInput(),clock=createClock(),audio=createAudio(window);
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  view.reduced=preference.matches;$('reduced-motion').checked=view.reduced;
  let run,paused=false,unlocked=false,muted=false,ending=false;
  let mouse={x:innerWidth/2,y:innerHeight/2};
  const resize=()=>resizeOlympus(view,innerWidth,innerHeight,devicePixelRatio);
  resize();window.addEventListener('resize',resize);
  const reset=(half=false)=>{
    run=createOlympusRun(number,Math.floor(Math.random()*0x100000000));paused=false;ending=false;input.clear();clock.reset();
    if(half){encounterFor(run).entrance.finish(run);run.boss.hp=run.boss.maxHp/2;run.step(input);}
    $('pause-screen').hidden=true;$('result').hidden=true;
    audio.setActive(!document.hidden);audio.setScene(half?'battle':'briefing',run);
    canvas.focus({preventScroll:true});
  };
  function updateAudioLabel(){const label=!unlocked?'소리 켜기':muted?'소리 꺼짐':'소리 켜짐';$('mute').textContent=label;$('mute').setAttribute('aria-pressed',String(muted));}
  async function unlock(){if(!unlocked){unlocked=await audio.unlock();updateAudioLabel();}}
  function pause(value){
    if(run.status!=='playing')return;
    paused=value;input.clear();run.cancelActions();clock.reset();
    $('pause-screen').hidden=!value;audio.setScene(value?'pause':run.olympus.phase==='intro'?'briefing':'battle',run);
    if(value)$('resume').focus({preventScroll:true});else canvas.focus({preventScroll:true});
  }
  function skip(){if(run.olympus.phase==='intro'){encounterFor(run).entrance.finish(run);input.clear();clock.reset();canvas.focus({preventScroll:true});}}
  const movement={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
  window.addEventListener('keydown',event=>{
    if(event.target instanceof HTMLInputElement)return;
    void unlock();
    if(event.code==='Escape'){event.preventDefault();if(!event.repeat)pause(!paused);return;}
    if(paused||run.status!=='playing')return;
    if(event.code==='Enter'&&run.olympus.phase==='intro'){event.preventDefault();skip();return;}
    if(movement[event.code]){event.preventDefault();input[movement[event.code]]=true;}
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)input.dodge=true;}
  });
  window.addEventListener('keyup',event=>{if(movement[event.code])input[movement[event.code]]=false;});
  window.addEventListener('pointermove',event=>{mouse={x:event.clientX,y:event.clientY};});
  canvas.addEventListener('pointerdown',event=>{
    void unlock();if(event.button!==0||paused||run.status!=='playing')return;
    mouse={x:event.clientX,y:event.clientY};canvas.focus({preventScroll:true});input.attack=true;input.attackPressed=true;
  });
  window.addEventListener('pointerup',()=>{input.attack=false;});
  window.addEventListener('pointercancel',()=>input.clear());
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('blur',()=>{input.clear();audio.setActive(false);if(!paused)pause(true);});
  window.addEventListener('focus',()=>{clock.reset();audio.setActive(!document.hidden);});
  document.addEventListener('visibilitychange',()=>{clock.reset();audio.setActive(!document.hidden&&document.hasFocus());if(document.hidden&&!paused)pause(true);});
  $('mute').addEventListener('click',async()=>{if(!unlocked)await unlock();else{muted=!muted;audio.setMuted(muted);}updateAudioLabel();});
  $('volume').addEventListener('input',event=>{void unlock();audio.setVolume(Number(event.target.value)/100);});
  $('reduced-motion').addEventListener('change',event=>view.reduced=event.target.checked);
  $('pause').addEventListener('click',()=>pause(true));$('practice-open').addEventListener('click',()=>pause(true));
  $('resume').addEventListener('click',()=>pause(false));$('skip-intro').addEventListener('click',()=>{void unlock();skip();});
  $('restart').addEventListener('click',()=>reset());$('half-health').addEventListener('click',()=>reset(true));$('again').addEventListener('click',()=>reset());
  // Keep keyboard focus inside the active pause/result dialog.
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;const dialog=!$('pause-screen').hidden?$('pause-screen'):!$('result').hidden?$('result'):null;if(!dialog)return;
    const choices=[...dialog.querySelectorAll('button,a,input')].filter(el=>!el.hidden),first=choices[0],last=choices.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  function hud(){
    const o=run.olympus,p=run.player,b=run.boss,intro=o.phase==='intro';
    const inward=o.action?.kind==='slam',inOut=o.phase==='combat'&&(inward||o.action?.kind==='debris');
    document.body.classList.toggle('in-intro',intro);document.body.classList.toggle('cinema-finished',!intro);
    $('intro-title').style.opacity=intro&&o.phaseTime>2.8&&o.phaseTime<5.6?'1':'0';
    const hp=Math.max(0,b.hp/b.maxHp),php=Math.max(0,p.hp/p.maxHp);
    $('boss-fill').style.transform=`scaleX(${hp})`;$('hero-fill').style.transform=`scaleX(${php})`;
    $('boss-fill').parentElement.setAttribute('aria-valuenow',String(Math.ceil(hp*100)));$('hero-fill').parentElement.setAttribute('aria-valuenow',String(Math.ceil(php*100)));
    $('boss-percent').textContent=`${Math.ceil(hp*100)}%`;$('hero-hp').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('dodge-status').textContent=p.dodgeCooldown>0?`${p.dodgeCooldown.toFixed(1)}s`:'준비';
    $('boss-condition').textContent=o.phase==='sleep'?'잠든 신 · 파편으로 깨우기':o.phase==='wipe'?'기도의 종말 · 전멸 공격':o.phase==='stunned'?`무방비 · ${Math.max(0,o.stunDuration-o.phaseTime).toFixed(1)}s`:o.phase==='rebuke'?'귀찮아! · 보스 곁으로 피하세요':inOut?(inward?'내려찍기 · 보스 곁으로':'파편 난사 · 보스에게서 떨어지세요'):o.enraged?'분노 · 행동 속도 증가':'AERGIA';
    const mechanic=inOut||['centering','sleep','smash','stunned','rebuke','wipe'].includes(o.phase);
    $('mechanic').hidden=!mechanic||run.status!=='playing';
    if(inOut){
      $('mechanic-title').textContent=inward?'내려찍기 · 안으로!':'파편 난사 · 밖으로!';
      $('mechanic-note').textContent=inward?'보스 곁의 원 안만 안전합니다. 바로 복귀하세요.':'보스에게서 떨어져 3연속 투척을 피하세요. 다음 강타에는 안으로!';
      $('fragment-count').textContent='';
    }else if(mechanic){
      $('mechanic-title').textContent=o.phase==='rebuke'?'귀찮아!':o.phase==='wipe'?'기도의 종말':o.phase==='stunned'?'신이 무방비해졌다':o.carrying||o.phase==='smash'?'잠든 신을 깨워라':'무너진 기도를 모아라';
      $('mechanic-note').textContent=o.phase==='rebuke'?'밀쳐진 뒤 보스 곁으로 돌아가세요. 원 안만 안전합니다.':o.phase==='wipe'?'수집 시간 초과 · 신이 전장을 무너뜨립니다.':o.phase==='stunned'?'회복하기 전에 공격하세요.':o.carrying||o.phase==='smash'?'수집 완료! 가까이 다가가 좌클릭으로 내려찍기':`낙하를 피하고 ${o.collectDuration}초 안에 파편 6개를 모두 모으세요.`;
      $('fragment-count').textContent=['stunned','rebuke'].includes(o.phase)?'':Array.from({length:6},(_,i)=>i<o.collected?'◆':'◇').join('');
    }
  }
  function frame(now){
    if(!paused&&!document.hidden&&run.status==='playing'){
      const aim=screenToOlympus(view,mouse.x,mouse.y);input.aimX=aim.x;input.aimY=aim.y;
      const count=clock.advance(now);
      for(let i=0;i<count;i++){
        run.step(input,STEP);
        audio.setScene(run.olympus.phase==='intro'?'briefing':'battle',run);audio.play(run.events,run);run.events.length=0;
        if(run.status!=='playing')break;
      }
    }else clock.reset();
    renderOlympus(view,run);hud();
    if(run.status!=='playing'&&!ending){
      ending=true;input.clear();const won=run.status==='won';
      $('result-label').textContent=won?'THE FIRST GOD HAS FALLEN':'THE ASCENT CONTINUES';
      $('result-title').textContent=won?'첫 번째 신이 무너졌다.':'다시, 신에게.';
      $('result-note').textContent=`${won?'아에르기아 격파':run.olympus.phase==='wipe'?'파편 수집 시간 초과 — 전멸':'아에르기아에게 패배'} · 전투 ${Math.floor(run.stageTime)}초 · 피격 ${run.hitsTaken}회`;
      $('next-god').hidden=!won;$('result').hidden=false;$('again').focus({preventScroll:true});audio.setScene(won?'clear':'dead',run);
    }
    requestAnimationFrame(frame);
  }
  reset();
  const cardLine=Object.entries(run.cards).map(([id,n])=>`${CARDS.find(c=>c.id===id)?.name||id} ${n}`).join(' · ');
  $('pause-title').nextElementSibling.lastElementChild.textContent=cardLine;
  $('loading').hidden=true;canvas.hidden=false;$('battle-ui').hidden=false;document.body.classList.add('in-battle');
  requestAnimationFrame(frame);
}
