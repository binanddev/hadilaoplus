import type {Game} from './types';

export type FinalePlan = {
  id: string;
  winner: 'liberal'|'fascist';
  winnerIds: string[];
  loserIds: string[];
  targets: string[];
  celebrants: string[];
};
type Result = Pick<Game,'code'|'version'|'phase'|'winner'|'players'|'known_roles'>;

/** Classification is allowed only after the authoritative result reveals every role. */
export function buildFinalePlan(game:Result|null|undefined):FinalePlan|null {
  if(!game||game.phase!=='finished'||!game.winner)return null;
  const roles=new Map(game.known_roles.map(person=>[person.id,person.role]));
  if(game.players.some(person=>!['liberal','fascist','hitler'].includes(roles.get(person.id)||'')))return null;
  const ordered=[...game.players].sort((a,b)=>a.seat-b.seat);
  const winners=ordered.filter(person=>(roles.get(person.id)==='liberal'?'liberal':'fascist')===game.winner);
  const losers=ordered.filter(person=>!winners.some(winner=>winner.id===person.id));
  return {
    id:`${game.code}:${game.version}:${game.winner}`,
    winner:game.winner,
    winnerIds:winners.map(person=>person.id),
    loserIds:losers.map(person=>person.id),
    targets:losers.filter(person=>person.alive).map(person=>person.id),
    celebrants:winners.filter(person=>person.alive).map(person=>person.id),
  };
}

export const FINALE_TIMING={announce:1.1,interval:.85,aim:.55,celebration:6} as const;
export function finaleShotTimes(plan:FinalePlan):number[] {
  return plan.targets.map((_,index)=>FINALE_TIMING.announce+index*FINALE_TIMING.interval+FINALE_TIMING.aim);
}
export function celebrationStarts(plan:FinalePlan):number {
  return FINALE_TIMING.announce+plan.targets.length*FINALE_TIMING.interval+.45;
}
export function finaleDuration(plan:FinalePlan):number {
  return celebrationStarts(plan)+FINALE_TIMING.celebration;
}
export type FinaleBeat={
  stage:'announce'|'salute'|'celebrate'|'complete';
  targetId?:string;
  clerkIndex:number;
  muzzleFlash:boolean;
  defeatedIds:string[];
  celebrationElapsed:number;
};

/** Deterministic local presentation; never changes a player's authoritative alive state. */
export function finaleBeat(plan:FinalePlan,seconds:number):FinaleBeat {
  const time=Math.max(0,Number.isFinite(seconds)?seconds:0);
  const celebration=celebrationStarts(plan);
  const index=Math.floor((time-FINALE_TIMING.announce)/FINALE_TIMING.interval);
  const inShot=index>=0&&index<plan.targets.length;
  const shotTime=inShot?FINALE_TIMING.announce+index*FINALE_TIMING.interval+FINALE_TIMING.aim:Infinity;
  return {
    stage:time<FINALE_TIMING.announce?'announce':time<celebration?'salute':time<finaleDuration(plan)?'celebrate':'complete',
    targetId:inShot?plan.targets[index]:undefined,
    clerkIndex:Math.max(0,index)%2,
    muzzleFlash:inShot&&time>=shotTime&&time<shotTime+.1,
    defeatedIds:plan.targets.filter((_,i)=>time>=FINALE_TIMING.announce+i*FINALE_TIMING.interval+FINALE_TIMING.aim),
    celebrationElapsed:Math.max(0,time-celebration),
  };
}
