import { PLAYER } from './content.mjs';
import { getStats } from './systems/stats.mjs';
import { hazardHitsCircle, segmentHitsCircle } from './systems/geometry.mjs';
import type { Point, Hazard, RunState } from './types.mjs';

export const MOMOS_SUIT_RADIUS=260;
function outline(curves:number[][],tail:number[][]=[]):readonly Point[] {
  const points:Point[]=[];
  for(const [x0,y0,x1,y1,x2,y2,x3,y3] of curves)for(let i=0;i<=16;i++){
    const t=i/16,u=1-t;points.push({x:u**3*x0+3*u*u*t*x1+3*u*t*t*x2+t**3*x3,y:u**3*y0+3*u*u*t*y1+3*u*t*t*y2+t**3*y3});
  }
  for(const [x,y] of tail)points.push({x,y});
  return Object.freeze(points.map(p=>Object.freeze({x:640+p.x*MOMOS_SUIT_RADIUS,y:365+p.y*MOMOS_SUIT_RADIUS})));
}
// Each suit is one closed outline; overlapping circles would create false safe holes.
export const MOMOS_CLOVER=outline([
  [-.17,.32,-.8,.76,-1.16,-.16,-.58,-.32],[-.58,-.32,-.83,-1.12,.83,-1.12,.58,-.32],[.58,-.32,1.16,-.16,.8,.76,.17,.32]
],[[.14,.65],[.3,.82],[-.3,.82],[-.14,.65]]);
export const MOMOS_HEART=outline([
  [0,.82,-.25,.55,-1.03,-.08,-.72,-.59],[-.72,-.59,-.45,-.98,-.12,-.8,0,-.43],
  [0,-.43,.12,-.8,.45,-.98,.72,-.59],[.72,-.59,1.03,-.08,.25,.55,0,.82]
]);
export function momosDiamonds(index:number,base:Hazard):Hazard[] {
  const hazards:Hazard[]=[],hitGroup={hit:false},shift=index===1;
  for(let row=0;row<4;row++)for(let col=0;col<(shift?8:7);col++){
    const x=(shift?10:100)+col*180,y=(shift?47.5:130)+row*165;
    hazards.push({...base,x,y,shape:'polygon',vertices:[{x,y:y-115},{x:x+125,y},{x,y:y+115},{x:x-125,y}],
      damage:32,hitGroup,counterable:false});
  }
  return hazards;
}
function clearKeyboardPath(state:RunState,to:Point):boolean {
  const p=state.player,b=state.boss,dx=to.x-p.x,dy=to.y-p.y,d=Math.min(Math.abs(dx),Math.abs(dy));
  const diagonal={x:Math.sign(dx)*d,y:Math.sign(dy)*d};
  return [{x:p.x+diagonal.x,y:p.y+diagonal.y},{x:to.x-diagonal.x,y:to.y-diagonal.y}].some(v=>
    !segmentHitsCircle(p.x,p.y,v.x,v.y,b.x,b.y,PLAYER.radius+b.def.radius+2)&&
    !segmentHitsCircle(v.x,v.y,to.x,to.y,b.x,b.y,PLAYER.radius+b.def.radius+2));
}
export function momosSuitWindup(state:RunState,h:Hazard):number {
  const p=state.player,points=h.vertices;
  if(!hazardHitsCircle(h,p.x,p.y,PLAYER.radius))return h.windup;
  let distance=Infinity;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<1e-6)continue;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(length*length)));
    for(const side of [-1,1]){
      const margin=(PLAYER.radius+6)*side,c={x:a.x+t*dx-dy/length*margin,y:a.y+t*dy+dx/length*margin};
      if(c.x<100||c.x>1180||c.y<130||c.y>625||hazardHitsCircle(h,c.x,c.y,PLAYER.radius)||!clearKeyboardPath(state,c))continue;
      const x=Math.abs(c.x-p.x),y=Math.abs(c.y-p.y);distance=Math.min(distance,Math.max(x,y)+(Math.SQRT2-1)*Math.min(x,y));
    }
  }
  const stats=getStats(state),dodge=p.dodgeCooldown<=0&&p.dodgeTime<=0?Math.max(0,stats.dodge.distance-stats.speed*stats.dodge.duration):0;
  // Body contact can block both shortest paths; allow a conservative detour instead of an infinite warning.
  if(!Number.isFinite(distance))distance=Math.hypot(p.x-640,p.y-365)+MOMOS_SUIT_RADIUS;
  return Math.max(h.windup,(distance-dodge)/stats.speed+.3);
}
