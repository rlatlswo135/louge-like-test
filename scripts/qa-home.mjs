import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function runHome(page,out) {
  const {send}=page,results=[];
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const check=(name,pass,detail)=>{results.push({name,pass:Boolean(pass),detail});console.log(`${pass?'PASS':'FAIL'} ${name}${detail===undefined?'':` — ${JSON.stringify(detail)}`}`);};
  const until=async expression=>{for(let i=0;i<150;i++){if(await ev(expression))return true;await sleep(20);}throw new Error(`Timeout: ${expression}`);};
  const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,name),Buffer.from(data,'base64'));};
  const click=async selector=>{const p=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...p});};
  const key=async (key,code,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});};
  const screen=async name=>until(`__qa.app.screen===${JSON.stringify(name)}`);
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
  await screen('home');
  check('Home first paint and keyboard focus',await ev('document.activeElement.id==="home-start"&&innerWidth===1365&&innerHeight===768')); 
  const art=await ev(`(async()=>{const image=new Image();image.src='/assets/art/arena-gate-v3.png';await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,background:getComputedStyle(document.getElementById('screen-home')).backgroundImage}})()`);
  check('Home uses the decoded arena entrance key art at native high resolution',art.width>=1280&&art.height>=720&&art.background.includes('arena-gate-v3.png'),art);
  await shot('home.png');
  const bounds=()=>ev(`[...document.querySelectorAll('#screen-home button:not([hidden]),#screen-ranking button:not([hidden]),#screen-won button:not([hidden])')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`);
  await click('#home-start');await screen('start');
  check('Home → selection preserves 12 loadouts',await ev('document.querySelectorAll(".choice").length===12'));
  check('Reduced-motion state matches accessible motion control',await ev('__qa.app.view.reducedMotion===document.getElementById("start-motion").checked&&document.body.dataset.motion===(__qa.app.view.reducedMotion?"reduced":"full")'));
  await click('#selection-home');await screen('home');await click('#home-start');await screen('start');
  check('Selection → home return',await ev('__qa.app.screen==="start"&&document.querySelectorAll(".choice").length===12'));
  await click('#selection-home');await screen('home');
  await ev(`window.__homeFetch=window.fetch;window.fetch=async()=>({ok:true,json:async()=>({entries:[]})})`);
  await click('#home-ranking');await screen('ranking');
  check('Empty ranking + native bounds',await until('document.getElementById("ranking-status").textContent.includes("아직")')&&await bounds());
  await shot('ranking-empty.png');
  await ev(`window.fetch=async()=>{throw new Error('offline fixture')}`);await click('#ranking-refresh');
  check('Ranking network error and retry control',await until('document.getElementById("ranking-status").textContent.includes("네트워크")&& !document.getElementById("ranking-refresh").disabled'));
  await ev('window.fetch=window.__homeFetch');
  await click('#ranking-refresh');await until('document.getElementById("ranking-status").textContent.includes("아직")');
  await ev(`window.fetch=async()=>({ok:true,json:async()=>({entries:[{nickname:'<img src=x>',hits:0,durationMs:1000,classId:'warrior',weaponId:'sword'}]})})`);
  await click('#ranking-refresh');await until('document.querySelectorAll("#ranking-rows tr").length===1');
  check('Untrusted nickname renders as text, never executable markup',await ev('document.querySelector("#ranking-rows td:nth-child(2)").textContent.startsWith("<img")&&!document.querySelector("#ranking-rows img")&&window.__xss===undefined'));
  await ev('window.fetch=window.__homeFetch');
  await click('#ranking-back');await screen('home');
  // Old response resolves after leaving ranking; it must not paint over home.
  await ev(`window.fetch=()=>new Promise(r=>window.__oldRankingResolve=r)`);await click('#home-ranking');await screen('ranking');await click('#ranking-back');await screen('home');
  await ev(`window.__oldRankingResolve?.({ok:true,json:async()=>({entries:[{nickname:'stale',hits:0,durationMs:1,classId:'warrior',weaponId:'sword'}]})});window.fetch=window.__homeFetch`);await sleep(80);
  check('Stale ranking response ignored after navigation',await ev('__qa.app.screen==="home"&&document.getElementById("screen-ranking").hidden'));
  await click('#home-start');await screen('start');
  await click('.class-choice[data-class-id="warrior"]');await click('.choice[data-weapon-id="sword"]');await click('#start-button');await screen('briefing');
  await ev('__qa.fixture.loadRun({stage:19,classId:"warrior",weaponId:"sword",seed:99});__qa.app.run.bossesCleared=19;__qa.app.run.time=123.45;__qa.app.run.hitsTaken=7');
  await click('#briefing-start');await screen('battle');await ev('__qa.fixture.killBoss()');await screen('won');
  const wonTime=await ev('__qa.app.run.time'),average=(Math.round(wonTime*1000)/1000/20).toFixed(2),total=`${Math.floor(wonTime/60)}:${String(Math.floor(wonTime%60)).padStart(2,'0')}`;
  check('Fixture full-clear record eligibility + result metrics + 1365×768 bounds',await ev(`!document.getElementById("record-form").hidden&&document.getElementById("won-stats").textContent.includes("7회")&&document.getElementById("won-stats").textContent.includes(${JSON.stringify(average+'초')})`)&&await bounds());
  await shot('won-form.png');
  await click('#record-nickname');await send('Input.insertText',{text:'QA Hero'});
  await key('Enter','Enter',13);
  check('Native Enter submits record through isolated real API',await until('document.getElementById("record-status").textContent.includes("등록 완료")'));
  const posted=await ev('(async()=>((await (await fetch("/api/leaderboard/v2")).json()).entries))()');
  check('Stored record has normalized score, proper display fields',posted.length===1&&posted[0].nickname==='QA Hero'&&posted[0].hits===7&&posted[0].durationMs===Math.round(wonTime*1000),posted);
  await click('#record-submit');await sleep(50);
  check('Completed form suppresses duplicate submission',(await ev('(async()=>((await (await fetch("/api/leaderboard/v2")).json()).entries.length))()'))===1);
  await click('#won-restart');await screen('start');await click('#selection-home');await screen('home');await click('#home-ranking');await screen('ranking');
  check('Ranking sorts/displays actual submitted record and combat time',await until('document.querySelectorAll("#ranking-rows tr").length===1')&&await ev(`document.querySelector("#ranking-rows").textContent.includes("QA Hero")&&document.querySelector("#ranking-rows").textContent.includes("7회")&&document.querySelector("#ranking-rows").textContent.includes(${JSON.stringify(average)})&&document.querySelector("#ranking-rows").textContent.includes(${JSON.stringify(total)})`));
  await click('#ranking-back');await screen('home');
  // Eligibility gates tested by safe run-state swaps; no publication request is issued.
  await click('#home-start');await screen('start');
  const eligibility=await ev(`(async()=>{const {isFullClear}=await import('/src/leaderboard-client.mjs');const r=__qa.app.run;return {tutorial:isFullClear({...r,tutorial:{},status:'won',stage:19,bossesCleared:20}),partial:isFullClear({...r,tutorial:null,status:'won',stage:19,bossesCleared:19}),full:isFullClear({...r,tutorial:null,status:'won',stage:19,bossesCleared:20})}})()`);
  check('Tutorial and partial final-stage fixtures cannot register',!eligibility.tutorial&&!eligibility.partial&&eligibility.full,eligibility);
  await click('#start-button');await screen('briefing');await ev('__qa.fixture.loadRun({stage:19})');await click('#briefing-start');await screen('battle');await ev('__qa.fixture.killBoss()');await screen('won');
  check('Partial-stage terminal UI hides publication form',await ev('document.getElementById("record-form").hidden&&__qa.app.recordId===null'));
  await click('#won-restart');await screen('start');
  // Async POST completes after a different run wins: screen matches, run identity must not.
  await ev(`window.fetch=window.__homeFetch;window.fetch=()=>new Promise(r=>window.__postResolve=r)`);
  await click('#start-button');await screen('briefing');
  await ev('__qa.fixture.loadRun({stage:19});__qa.app.run.bossesCleared=19;__qa.app.run.hitsTaken=0;__qa.app.run.time=100');
  await click('#briefing-start');await screen('battle');await ev('__qa.fixture.killBoss()');await screen('won');await click('#record-nickname');await send('Input.insertText',{text:'Race Hero'});await click('#record-submit');await until('window.__postResolve!==undefined');
  const oldId=await ev('__qa.app.recordId');
  await click('#won-restart');await screen('start');await click('#start-button');await screen('briefing');
  await ev('__qa.fixture.loadRun({stage:19});__qa.app.run.bossesCleared=19;__qa.app.run.time=200');await click('#briefing-start');await screen('battle');await ev('__qa.fixture.killBoss()');await screen('won');
  const newId=await ev('__qa.app.recordId');await ev(`window.__postResolve({ok:true,json:async()=>({entry:{id:${JSON.stringify(oldId)}},rank:1,retained:true})})`);
  await sleep(80);check('Successful old submission cannot mutate a different won run',await ev(`__qa.app.screen==="won"&&__qa.app.recordId===${JSON.stringify(newId)}&&__qa.app.recordState==="ready"&&document.getElementById("record-status").textContent===""`));
  await ev('window.fetch=window.__homeFetch');await click('#won-restart');await screen('start');
  // Reduced motion and frozen-screen RAF/listener stability.
  await until('__qa.snapshot().pendingRaf===0');
  const stable=await ev('({raf:__qa.app.rafCount,pending:__qa.snapshot().pendingRaf,listeners:{...__qa.listenerCounts}})');await sleep(150);
  const stable2=await ev('({raf:__qa.app.rafCount,pending:__qa.snapshot().pendingRaf,listeners:{...__qa.listenerCounts}})');
  check('Frozen menu RAF/listeners stable; reduced-motion preference honored',JSON.stringify(stable)===JSON.stringify(stable2)&&await ev('__qa.app.view.reducedMotion===document.getElementById("start-motion").checked'),{stable,stable2});

  // Production cold-start holds code, CSS and the decoded player animation atlas.
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const base=page.baseUrl;await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__shifts=[];new PerformanceObserver(l=>window.__shifts.push(...l.getEntries().map(e=>e.value))).observe({type:'layout-shift',buffered:true})`});
  await send('Fetch.enable',{patterns:[{urlPattern:'*styles.css*',requestStage:'Request'},{urlPattern:'*/src/main.mjs*',requestStage:'Request'},{urlPattern:'*/assets/art/hero-atlas-v4.png',requestStage:'Request'}]});
  const held=[];const unsub=page.on(async m=>{if(m.method==='Fetch.requestPaused'){held.push(m.params);}});
  await send('Page.navigate',{url:`${base}/`});
  for(let i=0;i<250&&held.length<3;i++)await sleep(20);
  check('Production loader holds menus and stable reserved bounds while assets pending',held.length===3&&await ev('document.getElementById("screen-home").hidden&&document.getElementById("screen-loading").getBoundingClientRect().width===innerWidth'));
  const reserved=await ev('JSON.stringify(document.getElementById("loading-message").getBoundingClientRect().toJSON())');
  await send('Fetch.continueRequest',{requestId:held.find(x=>x.request.url.endsWith('/src/main.mjs')).requestId});await sleep(200);
  check('Code ready but CSS pending: loader bounds stable, selection/canvas still hidden',await ev(`document.body.dataset.screen==="loading"&&document.getElementById("game").hidden&&document.getElementById("screen-start").hidden&&JSON.stringify(document.getElementById("loading-message").getBoundingClientRect().toJSON())===${JSON.stringify(reserved)}`));
  await send('Fetch.continueRequest',{requestId:held.find(x=>x.request.url.endsWith('/styles.css')).requestId});await sleep(100);
  check('Code/CSS ready but player atlas pending: no incomplete first frame',await ev('document.body.dataset.screen==="loading"&&document.getElementById("game").hidden'));
  await send('Fetch.continueRequest',{requestId:held.find(x=>x.request.url.endsWith('/assets/art/hero-atlas-v4.png')).requestId});
  await until('!document.getElementById("screen-home").hidden');await send('Fetch.disable');unsub();await sleep(100);
  check('Actual reduced-motion media preference honored on production boot',await ev('document.body.dataset.motion==="reduced"&&document.getElementById("start-motion").checked&&getComputedStyle(document.getElementById("home-start")).transitionDuration==="0s"'));
  const cls=await ev('window.__shifts.reduce((a,x)=>a+x,0)');check('Production cold-start CLS ≤ .001 and no QA global',cls<=.001&&await ev('window.__qa===undefined'),cls);
  await shot('production-home.png');
  // Failure paths: exact failed URL explicitly expected; error remains visible until native reload link.
  const requiredArt=['arena-gate-v3.png','arena-atlas-v3.png','boss-atlas-v3.png','boss-windup-v4.png','hero-atlas-v4.png','weapon-atlas-v4.png'];
  for(const [label,pattern,url] of [['stylesheet','*styles.css*',`${base}/styles.css`],['main module','*/src/main.mjs*',`${base}/src/main.mjs`],...requiredArt.map(file=>[file,`*/assets/art/${file}`,`${base}/assets/art/${file}`])]){
    page.expectNetworkFailure(url);
    await send('Fetch.enable',{patterns:[{urlPattern:pattern,requestStage:'Request'}]});
    const failed=[];const off=page.on(async m=>{if(m.method==='Fetch.requestPaused'){failed.push(m.params);await send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'});}});
    await send('Page.navigate',{url:`${base}/`});
    for(let i=0;i<250&&!(await ev('document.getElementById("loading-message").dataset.failed==="true"').catch(()=>false));i++)await sleep(20);
    check(`Production ${label} failure shows retry without incomplete menu`,failed.some(x=>x.request.url===url)&&await ev('document.getElementById("loading-message").dataset.failed==="true"&&document.getElementById("screen-home").hidden&&document.getElementById("loading-retry").getClientRects().length>0'));
    off();await send('Fetch.disable');await click('#loading-retry');await until('document.body.dataset.screen==="home"&&!document.getElementById("screen-home").hidden');
    check(`Production ${label} retry succeeds`,await ev('window.__qa===undefined&&document.getElementById("screen-home").hidden===false'));
  }
  return results;
}
