export type Point = { x: number; z: number };
export type SeatPose = Point & { yaw: number };
export type SeatedPlayer = { id: string; alive?: boolean; seat?: number; eliminated_office?:'president'|'chancellor'|null; eliminated_office_slot?:number|null };
export type ExecutionEvent = { id: string; actor_id: string; target_id: string };
export function officeSeat(office:'president'|'chancellor',slot=0):SeatPose {const x=[0,1.35,-1.35][slot]??2.7;const z=office==='president'?-6.25:6.25;return{x,z,yaw:Math.atan2(x,z)*180/Math.PI};}
const HALF_X = 5.2, HALF_Z = 7.0;
const WIDTH = HALF_X * 2, DEPTH = HALF_Z * 2, PERIMETER = 2 * (WIDTH + DEPTH);
export const SEATING_SECONDS = 2.4;
export function facingCenter(point: Point): number { return Math.atan2(point.x, point.z) * 180 / Math.PI; }
export function delegateSeat(index: number): SeatPose {
  const side = index % 2 === 0 ? -1 : 1;
  const z = -4.2 + Math.floor(index / 2) * 2.1;
  const point = { x: side * 4.3, z };
  return { ...point, yaw: facingCenter(point) };
}
/** Dead delegates retain their actual occupied chair, including leadership chairs. */
export function seatingPlan(players: SeatedPlayer[], presidentId?: string, chancellorId?: string, frozen: ReadonlyMap<string, SeatPose> = new Map()): Map<string, SeatPose> {
  const result = new Map<string, SeatPose>();
  players.forEach((p, i) => {
    const corpse=p.alive===false&&p.eliminated_office?officeSeat(p.eliminated_office,p.eliminated_office_slot??0):undefined;
    result.set(p.id,corpse??frozen.get(p.id)??delegateSeat(p.seat??i));
  });
  for (const [id, z] of [[presidentId, -6.25], [chancellorId, 6.25]] as const) {
    if (!id || frozen.has(id) || !players.some(p => p.id === id && p.alive !== false)) continue;
    const occupied = players.filter(p=>p.alive===false).map(p=>result.get(p.id)!).filter(p=>Math.abs(p.z-z)<.5).map(p=>p.x);
    const x = [0, 1.35, -1.35].find(candidate => occupied.every(other => Math.abs(candidate - other) > .9)) ?? 2.7;
    const point = { x, z };
    result.set(id, { ...point, yaw: facingCenter(point) });
  }
  return result;
}
function perimeterPosition(point: Point): number {
  if (Math.abs(point.x) > 3) return point.x < 0 ? WIDTH + DEPTH + WIDTH + (HALF_Z - point.z) : WIDTH + point.z + HALF_Z;
  return point.z < 0 ? point.x + HALF_X : WIDTH + DEPTH + (HALF_X - point.x);
}
function pointOnPerimeter(value: number): Point {
  let t = ((value % PERIMETER) + PERIMETER) % PERIMETER;
  if (t <= WIDTH) return { x: -HALF_X + t, z: -HALF_Z };
  t -= WIDTH;
  if (t <= DEPTH) return { x: HALF_X, z: -HALF_Z + t };
  t -= DEPTH;
  if (t <= WIDTH) return { x: HALF_X - t, z: HALF_Z };
  return { x: -HALF_X, z: HALF_Z - (t - WIDTH) };
}
/** Walk around the tabletop, rather than interpolating straight through it. */
export function seatingPath(from: Point, to: Point): Point[] {
  if (Math.hypot(to.x - from.x, to.z - from.z) < .01) return [from, to];
  const start = perimeterPosition(from), end = perimeterPosition(to);
  let delta = ((end - start) % PERIMETER + PERIMETER) % PERIMETER;
  if (delta > PERIMETER / 2) delta -= PERIMETER;
  const direction = Math.sign(delta), corners = [0, WIDTH, WIDTH + DEPTH, 2 * WIDTH + DEPTH];
  const travelled = corners.map(corner => {
    const distance = direction > 0 ? ((corner - start) % PERIMETER + PERIMETER) % PERIMETER : ((start - corner) % PERIMETER + PERIMETER) % PERIMETER;
    return { distance, point: pointOnPerimeter(corner) };
  }).filter(c => c.distance > .001 && c.distance < Math.abs(delta) - .001).sort((a,b) => a.distance - b.distance);
  return [from, pointOnPerimeter(start), ...travelled.map(c => c.point), pointOnPerimeter(start + delta), to];
}
export function positionOnPath(path: Point[], progress: number): Point {
  if (progress <= 0) return {x:path[0].x,z:path[0].z};
  if (progress >= 1) return {x:path[path.length-1].x,z:path[path.length-1].z};
  const lengths = path.slice(1).map((p,i) => Math.hypot(p.x - path[i].x,p.z - path[i].z));
  let remaining = lengths.reduce((sum,n) => sum+n,0) * progress;
  for (let i=0;i<lengths.length;i++) {
    if (remaining <= lengths[i]) {const t=lengths[i] ? remaining / lengths[i] : 0;return { x:path[i].x+(path[i+1].x-path[i].x)*t,z:path[i].z+(path[i+1].z-path[i].z)*t };}
    remaining -= lengths[i];
  }
  return {x:path[path.length-1].x,z:path[path.length-1].z};
}
export function canShootTarget(myId: string|undefined, targetId: string|undefined, armed: boolean, players: SeatedPlayer[], eligible: readonly string[]): boolean {
  return Boolean(armed && myId && targetId && targetId !== myId && players.some(p=>p.id===myId&&p.alive!==false) && players.some(p=>p.id===targetId&&p.alive!==false) && eligible.includes(targetId));
}
/** First snapshot establishes a baseline; only fresh server events can fire effects. */
export function freshExecution(previousId: string|null|undefined, event: ExecutionEvent|null|undefined): boolean { return previousId !== undefined && !!event && previousId !== event.id; }

