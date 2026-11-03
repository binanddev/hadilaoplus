import type {NarrationGame} from './narration.ts';

/** A short approval bell and synthetic handclaps. No music loop or voice track. */
export class GovernmentAudio {
  private baseline:NarrationGame|undefined;
  private unlocked=false;
  private enabled=true;
  private disposed=false;
  private seen=new Set<string>();
  private sources=new Set<AudioScheduledSourceNode>();
  private nodes=new Set<AudioNode>();
  private readonly context:()=>AudioContext;
  constructor(context:()=>AudioContext){this.context=context;}
  unlock(){if(!this.disposed)this.unlocked=true;}
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.cancel();}
  resetBaseline(){this.baseline=undefined;this.cancel();}
  observe(game:NarrationGame){
    const previous=this.baseline;
    if(previous?.code===game.code&&game.version<=previous.version)return;
    this.baseline=game;
    if(game.phase==='lobby'||game.phase==='finished')this.cancel();
    const key=`${game.code}:${game.version}:${game.round}:${game.president_id}:${game.chancellor_id}`;
    if(!previous||previous.code!==game.code||previous.phase!=='voting'||game.phase!=='president_discard'||this.seen.has(key))return;
    this.seen.add(key);if(this.seen.size>128)this.seen.delete(this.seen.values().next().value!);
    if(!this.enabled||!this.unlocked||this.disposed)return;
    this.cancel();
    try{
      const context=this.context();if(context.state==='closed')return;
      void context.resume().catch(()=>this.cancel());
      const now=context.currentTime+.03;
      [523.25,659.25,783.99,1046.5].forEach((frequency,index)=>{
        const source=context.createOscillator(),gain=context.createGain(),time=now+index*.18;
        source.type='sine';source.frequency.setValueAtTime(frequency,time);
        gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.045,time+.01);gain.gain.exponentialRampToValueAtTime(.0001,time+.5);
        source.connect(gain);gain.connect(context.destination);this.track(source,[gain]);source.start(time);source.stop(time+.52);
      });
      // Several slightly offset bursts resemble a small room applauding for 3 seconds.
      const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.075),context.sampleRate),samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(context.sampleRate*.013));
      for(let i=0;i<24;i++){
        const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),time=now+.3+i*.105+(i%3)*.018;
        source.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime(1000+(i%4)*300,time);
        gain.gain.setValueAtTime(.065*(i>18?.65:1),time);gain.gain.exponentialRampToValueAtTime(.0001,time+.075);
        source.connect(filter);filter.connect(gain);gain.connect(context.destination);this.track(source,[filter,gain]);source.start(time);source.stop(time+.08);
      }
    }catch{this.cancel();}
  }
  private track(source:AudioScheduledSourceNode,nodes:AudioNode[]){
    this.sources.add(source);nodes.forEach(node=>this.nodes.add(node));
    source.onended=()=>{this.sources.delete(source);source.disconnect();for(const node of nodes){node.disconnect();this.nodes.delete(node);}};
  }
  private cancel(){
    for(const source of this.sources){source.onended=null;try{source.stop();}catch{/* Already ended. */}source.disconnect();}
    this.sources.clear();for(const node of this.nodes)node.disconnect();this.nodes.clear();
  }
  dispose(){this.disposed=true;this.cancel();}
}

