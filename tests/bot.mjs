import { ARENA, PLAYER, STEP } from '../public/src/content.mjs';
import { createInput, getStats, getStorm, hazardHitsCircle } from '../public/src/game.mjs';

const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[.707,-.707],[-.707,.707],[-.707,-.707]];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// QA-only controller. Reads simulated state; emits only ordinary player controls.
export function botInput(run) {
  const { player: p, boss: b } = run;
  const stats = getStats(run);
  const storm = getStorm(run);
  const dx = b.x - p.x, dy = b.y - p.y, distance = Math.hypot(dx, dy) || 1;
  const melee = run.weapon.kind === 'melee';
  const desired = melee
    ? Math.max(PLAYER.radius + b.def.radius + 8, stats.reach + b.def.radius - 18)
    : Math.min(stats.reach * .72, ARENA.width * .42);
  const ux = dx / distance, uy = dy / distance;
  const velocity = b.state === 'idle' && distance > b.def.radius + PLAYER.radius + 40 ? b.def.speed : 0;
  const bvx = -ux * velocity, bvy = -uy * velocity;
  let best = dirs[0], bestScore = Infinity;
  for (const [mx0, my0] of dirs) {
    const norm = Math.hypot(mx0, my0) || 1, mx = mx0 / norm, my = my0 / norm;
    let score = 0;
    for (const t of [.22, .48, .8, 1.15]) {
      const x = clamp(p.x + mx * stats.speed * t, PLAYER.radius, ARENA.width - PLAYER.radius);
      const y = clamp(p.y + my * stats.speed * t, PLAYER.radius, ARENA.height - PLAYER.radius);
      const bx = b.x + bvx * t, by = b.y + bvy * t;
      const d = Math.hypot(bx - x, by - y);
      const error = d - desired;
      const outside = Math.hypot(x - storm.x, y - storm.y) + PLAYER.radius + 10 - (storm.radius - t * 3);
      if (outside > 0) score += 4000 + outside * 50;
      score += (melee ? Math.abs(error) : Math.max(0, -error) * 1.4 + Math.max(0, error - desired * .7)) * (t < .5 ? 1.2 : .65);
      for (const h of run.hazards) {
        if (h.phase !== 'warn' && h.phase !== 'active') continue;
        const until = h.phase === 'warn' ? Math.max(0, h.windup - h.t) : 0;
        if (t + .12 < until || t > until + h.active + .25) continue;
        if (hazardHitsCircle(h, x, y, PLAYER.radius + 4)) score += (t <= until + .25 ? 1500 : 700) / (1 + t);
      }
      for (const q of run.projectiles) if (q.owner === 'boss') {
        const qx = q.x + q.vx * t, qy = q.y + q.vy * t;
        const separation = Math.hypot(qx - x, qy - y);
        if (separation < q.radius + PLAYER.radius + 22) score += 1100 / (1 + t);
      }
    }
    if (mx || my) score -= .05;
    if (score < bestScore) { bestScore = score; best = [mx, my]; }
  }
  const input = createInput();
  input.left = best[0] < -.1; input.right = best[0] > .1;
  input.up = best[1] < -.1; input.down = best[1] > .1;
  // Lead visible boss motion for real projectile travel; melee keeps direct aim.
  const lead = !melee && velocity ? Math.min(.45, distance / Math.max(stats.projectileSpeed, 1)) : 0;
  input.aimX = clamp(b.x + bvx * lead, 0, ARENA.width);
  input.aimY = clamp(b.y + bvy * lead, 0, ARENA.height);
  input.attack = bestScore < 1000 && !storm.outside;
  const imminent = run.hazards.some(h => (h.phase === 'active' || (h.phase === 'warn' && h.windup - h.t <= .25)) && hazardHitsCircle(h, p.x, p.y, PLAYER.radius + 6)) || run.projectiles.some(q => q.owner === 'boss' && Math.hypot(q.x - p.x, q.y - p.y) < q.radius + PLAYER.radius + 34);
  input.dodge = (imminent || storm.outside) && p.dodgeCooldown <= STEP && p.dodgeTime <= 0;
  return input;
}

const cardPriority = ['healing','vitality','edge','tempo','reach','swift','dodge','ward','rapid','heavy','fortune','focus'];
export function chooseReward(run) {
  return [...run.offers].sort((a, b) => {
    const score = card => (card.rarity === 'unique' ? -4 : card.id === 'healing' && run.player.hp < run.player.maxHp * .8 ? -3 : card.id === 'vitality' ? -2 : card.id === 'edge' || card.id === 'tempo' ? -1 : 0);
    return score(a) - score(b) || cardPriority.indexOf(a.id) - cardPriority.indexOf(b.id);
  })[0]?.id;
}
