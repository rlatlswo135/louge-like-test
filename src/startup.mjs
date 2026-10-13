// Prepare code, CSS and decoded floor material before exposing the first menu.
export async function startGame(doc,options={}) {
  const status=doc.getElementById('loading-message');
  const screen=doc.getElementById('screen-loading');
  let timer;
  try {
    status.textContent='전투 코드와 화면 리소스를 불러오는 중…';
    const styles=new Promise((resolve,reject)=>{
      const link=doc.createElement('link');
      link.rel='stylesheet';link.href=new URL('../styles.css',import.meta.url).href;
      link.onload=resolve;link.onerror=()=>reject(new Error('Stylesheet unavailable'));
      doc.head.append(link);
    });
    const [{boot}]=await Promise.race([
      Promise.all([import('./main.mjs'),styles,import('./arena-art.mjs').then(({prepareArena})=>prepareArena(doc.defaultView)),import('./art.mjs').then(({prepareBossArt,prepareHeroArt,prepareWeaponArt})=>Promise.all([prepareBossArt(doc.defaultView),prepareHeroArt(doc.defaultView),prepareWeaponArt(doc.defaultView)]))]),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Startup timed out')),15000);}),
    ]);
    clearTimeout(timer);
    status.textContent='도전자와 전장을 준비하는 중…';
    await doc.fonts.ready;
    const app=boot(doc,options);
    screen.setAttribute('aria-busy','false');
    return app;
  } catch {
    status.textContent='게임을 준비하지 못했습니다. 연결을 확인하고 다시 불러오세요.';
    status.dataset.failed='true';
    screen.setAttribute('aria-busy','false');
    doc.getElementById('loading-retry').focus();
    return null;
  } finally {clearTimeout(timer);}
}
