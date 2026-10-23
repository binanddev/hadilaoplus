export type SoundCue='card'|'shuffle'|'coins'|'royal'|'dice'|'bomb'|'shield';
type SoundState={code:string;phase:string;king_id?:string;last_event?:{id:string;type:string}};
/** Tracks live transitions only. A first snapshot or reconnect establishes a silent baseline. */
export class SoundTracker {
 private baseline=false; private room=''; private king=''; private phase=''; private seen=new Set<string>();
 reset(){this.baseline=false}
 observe(state:SoundState):SoundCue[]{
  const event=state.last_event,key=state.code+':'+event?.id;
  const cues:SoundCue[]=[];
  if(this.baseline&&this.room===state.code){
   if(['lobby','finished'].includes(this.phase)&&state.phase==='playing')cues.push('shuffle');
   if(event?.id&&!this.seen.has(key)){
    const kind=event.type;
    if(kind==='transfer')cues.push('coins');
    else if(['theft','tax','gift','loyal_dog','parrot','mad_king','bomb','shield'].includes(kind)){
     cues.push('card');
     if(['theft','tax','gift','loyal_dog'].includes(kind))cues.push('coins');
     else if(kind==='mad_king')cues.push('dice');
     else if(kind==='bomb')cues.push('bomb');
     else if(kind==='shield')cues.push('shield');
    }
   }
   if(state.king_id&&state.king_id!==this.king)cues.push('royal');
  }
  if(event?.id)this.seen.add(key);if(this.seen.size>160)this.seen.delete(this.seen.values().next().value!);
  this.room=state.code;this.king=state.king_id||'';this.phase=state.phase;this.baseline=true;return cues;
 }
}
/** Short synthesized action sounds. No music, loops or downloaded audio. */
export class GameAudio {
 private context:AudioContext|null=null; private master:GainNode|null=null; private muted:boolean;private disposed=false;private sources=new Set<AudioScheduledSourceNode>();
 constructor(muted=false){this.muted=muted;document.addEventListener('pointerdown',this.onGesture,true);document.addEventListener('keydown',this.onGesture,true)}
 private onGesture=()=>this.unlock();
 unlock(){
  if(this.disposed||this.muted)return;
  try{if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.22;this.master.connect(this.context.destination)}if(this.context.state==='suspended')void this.context.resume().catch(()=>{})}catch{/* Audio is optional on browsers without WebAudio. */}
 }
 setMuted(value:boolean){this.muted=value;if(this.master&&this.context)this.master.gain.setValueAtTime(value?0:.22,this.context.currentTime);if(value)this.stopSources()}
 private track(source:AudioScheduledSourceNode){this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect()}}
 private stopSources(){this.sources.forEach(source=>{try{source.stop()}catch{/* Already ended. */}source.disconnect()});this.sources.clear()}
 private tone(freq:number,duration:number,delay=0,volume=.25,type:OscillatorType='sine',endFreq?:number){
  const ctx=this.context!,at=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,at);if(endFreq)osc.frequency.exponentialRampToValueAtTime(endFreq,at+duration);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.007);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(this.master!);this.track(osc);osc.start(at);osc.stop(at+duration+.02);osc.addEventListener('ended',()=>gain.disconnect(),{once:true});
 }
 private noise(duration:number,delay=0,volume=.2,freq=1400,type:BiquadFilterType='bandpass'){
  const ctx=this.context!,at=ctx.currentTime+delay,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type=type;filter.frequency.value=freq;filter.Q.value=.7;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);source.connect(filter);filter.connect(gain);gain.connect(this.master!);this.track(source);source.start(at);source.stop(at+duration+.02);source.addEventListener('ended',()=>{filter.disconnect();gain.disconnect()},{once:true});
 }
 play(cue:SoundCue){
  if(this.disposed||this.muted||!this.context||this.context.state!=='running')return;
  if(cue==='card')this.noise(.16,0,.32,1700);
  if(cue==='shuffle')for(let i=0;i<5;i++)this.noise(.07,i*.045,.22,1300+i*120);
  if(cue==='coins')for(let i=0;i<5;i++){this.tone(1700+i*153,.16,.1+i*.065,.16);this.tone(2540+i*98,.12,.11+i*.065,.07)}
  if(cue==='royal')[523.25,659.25,783.99,1046.5].forEach((f,i)=>{this.tone(f,.32,i*.105,.18,'triangle');this.tone(f*2,.18,i*.105,.04)});
  if(cue==='dice')for(let i=0;i<8;i++){const d=.14+i*.075+i*i*.008;this.noise(.055,d,.28-i*.02,650,'lowpass');this.tone(190+i%3*36,.055,d,.13,'triangle',90)}
  if(cue==='bomb'){this.noise(.65,.16,.5,850,'lowpass');this.tone(105,.58,.16,.34,'sine',28)}
  if(cue==='shield'){this.tone(620,.35,.12,.18,'triangle');this.tone(1255,.24,.13,.11);this.noise(.08,.12,.12,2800)}
 }
 dispose(){this.disposed=true;document.removeEventListener('pointerdown',this.onGesture,true);document.removeEventListener('keydown',this.onGesture,true);this.stopSources();if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});this.master?.disconnect();this.context=null;this.master=null}
}
