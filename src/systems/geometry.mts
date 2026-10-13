import { ARENA } from '../content.mjs';
import type { InputState, Hazard, Point } from '../types.mjs';
export function circleHitsCircle(cx: number, cy: number, cr: number, x: number, y: number, r: number) {
  const dx = x - cx;
  const dy = y - cy;
  const rr = cr + r;
  return dx * dx + dy * dy <= rr * rr;
}
// 부채꼴(중심·반지름·방향·반각)과 원(x,y,r)의 교차. 경계는 포함한다.
export function sectorHitsCircle(s: Hazard, x: number, y: number, r: number) {
  const dx = x - s.x;
  const dy = y - s.y;
  const dist = Math.hypot(dx, dy);
  if (dist > s.radius + r) return false;
  if (dist <= r) return true;
  const angle = Math.atan2(dy, dx);
  let diff = Math.abs(angle - s.angle) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (diff <= s.halfAngle) return true;
  // 부채꼴 바깥 각도: 가장 가까운 가장자리 선분까지 거리로 판정
  const edge = diff - s.halfAngle;
  if (edge >= Math.PI / 2) return dist <= r;
  const perp = Math.sin(edge) * dist;
  const along = Math.cos(edge) * dist;
  if (along <= s.radius) return perp <= r;
  return Math.hypot(along - s.radius, perp) <= r;
}
// One clock for visible area fill, HUD and activation (including fixed-step roundoff).
export function getHazardProgress(h: Hazard) {
  return h.t >= h.windup - 1e-9 ? 1 : Math.max(0, h.t / h.windup);
}
export function hazardHitsCircle(h: Hazard, x: number, y: number, r: number) {
  if(h.charge&&h.phase==='active'&&h.body){
    const b=h.body;
    return segmentHitsCircle(b.prevX, b.prevY, b.x, b.y, x, y, r+b.radius);
  }
  if(h.charge)return segmentHitsCircle(h.x, h.y, h.x+Math.cos(h.angle)*h.length, h.y+Math.sin(h.angle)*h.length, x, y, r+h.width/2);
  if(h.shape==='field')return !(h.safe||[]).some(s=>Math.hypot(x-s.x, y-s.y)+r<s.radius);
  if (h.shape === 'circle') return circleHitsCircle(h.x, h.y, h.radius, x, y, r);
  if (h.shape === 'sector') return sectorHitsCircle(h, x, y, r);
  if (h.shape === 'lane') {
    const dx = x - h.x, dy = y - h.y, along = dx * Math.cos(h.angle) + dy * Math.sin(h.angle);
    const across = Math.abs(-dx * Math.sin(h.angle) + dy * Math.cos(h.angle));
    const dxEdge = Math.max(-along, 0, along - h.length);
    const dyEdge = Math.max(0, across - h.width / 2);
    return dxEdge * dxEdge + dyEdge * dyEdge <= r * r;
  }
  if (h.shape === 'ring') {
    const dx = x - h.x, dy = y - h.y, dist = Math.hypot(dx, dy);
    let diff = Math.abs(Math.atan2(dy, dx) - h.gapAngle) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (dist + r < h.innerRadius || dist - r > h.radius) return false;
    if (!h.gapHalfAngle || diff >= h.gapHalfAngle) return true;
    return [-1, 1].some((side) => {
      const edge = h.gapAngle + side * h.gapHalfAngle;
      return segmentHitsCircle(h.x + Math.cos(edge) * h.innerRadius, h.y + Math.sin(edge) * h.innerRadius,
      h.x + Math.cos(edge) * h.radius, h.y + Math.sin(edge) * h.radius, x, y, r);
    });
  }
  return false;
}
// ── 엔티티 생성 ───────────────────────────────────────────
export function moveVector(input: InputState) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  return { x: mx, y: my };
}
export function clampToArena(e: Partial<Point>, r: number) {
  e.x = Math.min(ARENA.width - r, Math.max(r, e.x));
  e.y = Math.min(ARENA.height - r, Math.max(r, e.y));
}
export function arenaRayLength(x: number, y: number, angle: number, length: number, margin: number = 0) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const roomX = Math.abs(dx) < 1e-9 ? Infinity : ((dx > 0 ? ARENA.width - margin : margin) - x) / dx;
  const roomY = Math.abs(dy) < 1e-9 ? Infinity : ((dy > 0 ? ARENA.height - margin : margin) - y) / dy;
  return Math.max(0, Math.min(length, roomX, roomY));
}
export function segmentHitsCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number) {
  const dx=x2-x1, dy=y2-y1, d=dx*dx+dy*dy;
  const t=d ? Math.max(0, Math.min(1, ((cx-x1)*dx+(cy-y1)*dy)/d)) : 0;
  return (x1+dx*t-cx)**2+(y1+dy*t-cy)**2 <= r*r;
}
