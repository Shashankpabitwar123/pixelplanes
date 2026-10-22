import { ROCKET_DETECTION_RANGE } from './config.js';
const normalize = angle => ((angle + 540) % 360) - 180;
export const rocketTargetKey = target => `${target.type ?? 'plane'}:${target.id ?? target.index ?? 'player'}`;

// Prefer the plane nearest the nose, not simply the closest plane in any direction.
export function selectRocketTarget(source, targets, maxRange = ROCKET_DETECTION_RANGE) {
  return targets.map(target => {
    if (!target?.state || target.state.crashed || target.active === false) return null;
    const dx=target.state.x-source.x, dy=target.state.y-source.y;
    const distance=Math.hypot(dx,dy);
    const error=Math.abs(normalize(Math.atan2(dy,-dx)*180/Math.PI-source.angle));
    if(distance<1 || distance>maxRange || error>45) return null;
    return {...target, key:rocketTargetKey(target), score:error/45+distance/maxRange*0.25};
  }).filter(Boolean).sort((a,b)=>a.score-b.score)[0] ?? null;
}

export function rocketInterceptPoint(rocket, target, speed, horizon = 1.2) {
  const dx=target.x-rocket.x,dy=target.y-rocket.y;
  const vx=target.vx ?? 0,vy=target.vy ?? 0;
  const a=vx*vx+vy*vy-speed*speed,b=2*(dx*vx+dy*vy),c=dx*dx+dy*dy;
  const d=b*b-4*a*c;
  const roots=Math.abs(a)<1e-8 ? (Math.abs(b)>1e-8 ? [-c/b] : []) : d>=0 ? [(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)] : [];
  const intercept=Math.min(...roots.filter(t=>t>0));
  const time=Number.isFinite(intercept) ? Math.min(intercept,Math.max(0,horizon)) : 0;
  return {x:target.x+vx*time,y:target.y+vy*time};
}
