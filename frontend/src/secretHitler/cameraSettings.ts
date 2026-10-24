export const BASE_EYE_HEIGHT=2.45;
export const DEFAULT_SEAT_HEIGHT=1.25;
export function sanitizeSeatHeight(value:unknown):number {
  if(value===null||value===undefined||value==='')return DEFAULT_SEAT_HEIGHT;
  const height=typeof value==='number'?value:Number(value);
  return Number.isFinite(height)?Math.max(1,Math.min(2,height)):DEFAULT_SEAT_HEIGHT;
}
export function seatEyeHeight(value:unknown):number {
  return BASE_EYE_HEIGHT*sanitizeSeatHeight(value);
}
