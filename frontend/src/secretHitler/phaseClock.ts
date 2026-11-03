type TimedPhase={phase:string;phase_started_at?:number;legislative_available_at?:number|null;discussion_ends_at?:number|null};

/** All timestamps are seconds in the server clock; no secret card data is read. */
export function phaseClock(game:TimedPhase, now:number){
  const choosing=game.phase==='president_discard'||game.phase==='chancellor_discard';
  const start=Math.max(game.phase_started_at??now,game.phase==='president_discard'?(game.legislative_available_at??0):0);
  const elapsed=Math.max(0,now-start);
  return {
    choosing,
    preparation:choosing?Math.max(0,Math.ceil(start-now)):0,
    reminder:choosing?Math.floor(elapsed/20):0,
    remaining:game.phase==='discussion'?Math.max(0,Math.ceil((game.discussion_ends_at??now)-now)):choosing?20-Math.floor(elapsed%20):0,
  };
}
