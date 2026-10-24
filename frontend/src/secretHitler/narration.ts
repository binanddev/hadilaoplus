export type PresentationEvent = {
  id: string; kind: string; actor_id: string; target_id?: string;
  policy?: 'liberal'|'fascist'; ready?: boolean; accept?: boolean; power?: string;
};
type NamedPlayer = {id:string;name:string};

/** Deliberately reads public event fields only, never a role, hand or private result. */
export function narrationText(event:PresentationEvent, players:NamedPlayer[]):string {
  const name=(id?:string)=>players.find(player=>player.id===id)?.name||'Đại biểu';
  const actor=name(event.actor_id), target=name(event.target_id);
  if(event.policy)return `Chính sách ${event.policy==='liberal'?'Tự do':'Phát xít'} đã được ban hành.`;
  switch(event.kind){
    case 'join':return `${actor} đã vào hội đồng.`;
    case 'ready':return `${actor} ${event.ready?'đã sẵn sàng':'chưa sẵn sàng'}.`;
    case 'start':return 'Hội đồng bắt đầu. Hãy xem vai trò riêng của bạn.';
    case 'nominate':return `${actor} đề cử ${target} làm thủ tướng.`;
    case 'vote':return `${actor} đã bỏ phiếu.`;
    case 'discard':return `${actor} đã xử lý chính sách. Hồ sơ được chuyển tiếp.`;
    case 'request_veto':return `${actor} đề nghị phủ quyết.`;
    case 'respond_veto':return event.accept?'Tổng thống đồng ý phủ quyết.':'Tổng thống từ chối phủ quyết.';
    case 'power':return event.power==='execution'?`${target} đã bị loại khỏi hội đồng.`:event.power==='special_election'?`${target} được chỉ định tổng thống đặc biệt.`:event.power==='investigate'?`${actor} đã điều tra đảng tịch của ${target}.`:`${actor} đã xem hồ sơ chính sách.`;
    case 'acknowledge':return 'Hồ sơ đã được cất. Hội đồng chuyển lượt.';
    case 'rematch':return 'Phòng đã sẵn sàng cho ván mới.';
    case 'leave':return 'Một đại biểu đã rời phòng.';
    default:return '';
  }
}

type SpeechEngine=Pick<SpeechSynthesis,'speak'|'cancel'|'getVoices'|'addEventListener'|'removeEventListener'>;

/** Gesture-gated, bounded, reconnect-safe speech; there is no ambient audio. */
export class ActionNarrator {
  private baseline:string|null|undefined=undefined;
  private unlocked=false;
  private disposed=false;
  private queue:string[]=[];
  private current:SpeechSynthesisUtterance|null=null;
  private voices:SpeechSynthesisVoice[]=[];
  private enabled=true;
  private readonly engine:SpeechEngine|undefined;
  private readonly makeUtterance:()=>SpeechSynthesisUtterance;
  private readonly voicesChanged=()=>{this.voices=this.engine?.getVoices()||[];};
  constructor(engine:SpeechEngine|undefined,makeUtterance=()=>new SpeechSynthesisUtterance()){
    this.engine=engine;this.makeUtterance=makeUtterance;
    this.voicesChanged();
    engine?.addEventListener('voiceschanged',this.voicesChanged);
  }
  get supported(){return !!this.engine;}
  unlock(){if(!this.disposed)this.unlocked=true;}
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.cancel();}
  resetBaseline(){this.baseline=undefined;this.cancel();}
  observe(event:PresentationEvent|null|undefined,players:NamedPlayer[]){
    const id=event?.id||null,previous=this.baseline;this.baseline=id;
    if(this.disposed||previous===undefined||!event||previous===id||!this.enabled||!this.unlocked||!this.engine)return;
    const text=narrationText(event,players);if(!text)return;
    this.queue=[...this.queue,text].slice(-2);
    this.next();
  }
  private next(){
    if(this.disposed||this.current||!this.engine||!this.queue.length||!this.enabled)return;
    const utterance=this.makeUtterance();utterance.text=this.queue.shift()!;utterance.lang='vi-VN';utterance.rate=1.06;utterance.volume=.85;
    const voice=this.voices.find(voice=>/^vi(?:[-_]|$)/i.test(voice.lang));if(voice)utterance.voice=voice;
    const complete=()=>{if(this.current!==utterance)return;this.current=null;if(!this.disposed)this.next();};
    utterance.onend=complete;utterance.onerror=complete;this.current=utterance;
    try{this.engine.speak(utterance);}catch{this.current=null;this.queue=[];}
  }
  private cancel(){this.queue=[];if(this.current){this.current.onend=null;this.current.onerror=null;this.current=null;this.engine?.cancel();}}
  dispose(){this.disposed=true;this.cancel();this.engine?.removeEventListener('voiceschanged',this.voicesChanged);}
}
