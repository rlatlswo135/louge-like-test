import test from 'node:test';
import assert from 'node:assert/strict';
import {createOlympusRun} from '../public/src/olympus.mjs';
import {encounterFor} from '../public/src/olympus-encounters.mjs';
import {createInput} from '../public/src/game.mjs';
import {hazardHitsCircle,segmentHitsCircle} from '../public/src/systems/geometry.mjs';

function incoming(r){return r.hazards.filter(h=>h.phase==='warn'||h.charge).map(h=>h.charge?{...h,phase:'warn'}:h);}
function safe(hazards,x,y,radius=16){return hazards.every(h=>!hazardHitsCircle(h,x,y,radius));}
function goal(r,hazards){
  const p=r.player,b=r.boss;let target,score=Infinity;
  for(let y=130;y<=625;y+=10)for(let x=100;x<=1180;x+=10){
    const dx=Math.abs(x-p.x),dy=Math.abs(y-p.y),distance=Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);
    if(distance>=score||Math.hypot(x-b.x,y-b.y)<54||!safe(hazards,x,y,22))continue;
    if(encounterFor(r).blocksMovement(r)&&segmentHitsCircle(p.x,p.y,x,y,b.x,b.y,52))continue;
    score=distance;target={x,y};
  }
  assert.ok(target,'at least one reachable-looking full-foot gap');return target;
}
function evade(n,x,y,dodgeUnavailable=false){
  const r=createOlympusRun(2,73);encounterFor(r).entrance.finish(r);r.player.x=x;r.player.y=y;
  if(dodgeUnavailable)r.player.dodgeCooldown=999;
  r.olympus.nextAttack=0;r.combatRng=()=>(n+.5)/8;r.step(createInput());
  const hp=r.player.hp;let action=r.olympus.action,wheels=false,reaction=12,target;
  for(let frame=0;frame<650&&(r.olympus.action||r.olympus.queue.length||r.hazards.length);frame++){
    if(r.olympus.action&&action!==r.olympus.action){action=r.olympus.action;reaction=12;target=null;}
    if(!wheels&&r.hazards.some(h=>h.visual==='wheel-bomb')){wheels=true;reaction=12;target=null;}
    let input=createInput();
    if(reaction>0)reaction--;
    else{
      const hazards=incoming(r),p=r.player;
      if(!safe(hazards,p.x,p.y)){
        target??=goal(r,hazards);const dx=target.x-p.x,dy=target.y-p.y;
        const distance=Math.max(Math.abs(dx),Math.abs(dy))+(Math.SQRT2-1)*Math.min(Math.abs(dx),Math.abs(dy));
        const deadline=Math.min(...hazards.filter(h=>h.phase==='warn').map(h=>h.windup-h.t));
        const dodge=(n===3||n===5||n===1&&wheels)&&p.dodgeCooldown<=0&&p.dodgeTime<=0&&distance/r.getStats().speed>deadline-.06;
        input={...input,left:dx< -3,right:dx>3,up:dy< -3,down:dy>3,dodge};
      }
    }
    r.step(input);assert.equal(r.player.hp,hp,`family ${n}, start ${x},${y}, frame ${frame}, action ${r.olympus.action?.index}, at ${r.player.x},${r.player.y}`);
  }
  assert.equal(r.olympus.action,null);assert.equal(r.hazards.length,0);
}
for(const [n,label] of [[1,'bicycle and bouncing wheels'],[4,'double charge'],[3,'clover'],[5,'heart'],[6,'diamonds'],[7,'spade lances']]){
  test(`200ms reaction + real movement evades ${label} from center and corners`,()=>{
    for(const [x,y] of [[640,580],[100,130],[1180,130],[100,625],[1180,625],[640,365]]){
      evade(n,x,y);if(n===3||n===5)evade(n,x,y,true);
    }
  });
}
