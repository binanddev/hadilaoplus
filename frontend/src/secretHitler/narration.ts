export type PresentationEvent = {
  id: string; kind: string; actor_id: string; target_id?: string;
  policy?: 'liberal'|'fascist'; ready?: boolean; accept?: boolean; power?: string;
};
type NamedPlayer = {id:string;name:string};
export type NarrationGame = {
  code:string; version:number; round:number; phase:string; players:NamedPlayer[];
  president_id:string|null; chancellor_id:string|null; nominee_id:string|null;
  presentation_event?:PresentationEvent|null;
};

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

export function transitionNarration(before:NarrationGame,game:NarrationGame):string {
  const name=(id:string|null)=>game.players.find(player=>player.id===id)?.name||'đại biểu';
  const changed=before.phase!==game.phase||before.round!==game.round||before.president_id!==game.president_id;
  const policy=game.presentation_event?.id!==before.presentation_event?.id&&game.presentation_event?.policy;
  const policyText=policy?`Chính sách ${policy==='liberal'?'Tự do':'Phát xít'} đã được ban hành. `:'';
  if(changed){
    switch(game.phase){
      case 'nomination':return `${policyText}${before.phase==='voting'?'Chính quyền không được tín nhiệm. ':''}Xin kính mời ${name(game.president_id)} lên làm tổng thống và mời ngài chọn thủ tướng.`;
      case 'voting':return `Vậy là ngài ${name(game.president_id)} đã chọn ${name(game.nominee_id)} lên làm thủ tướng. Xin mời mọi người bỏ phiếu cho chính quyền mới.`;
      case 'president_discard':return before.phase==='voting'?`Xin chúc mừng chính quyền của tổng thống ${name(game.president_id)} và thủ tướng ${name(game.chancellor_id)} đã được tín nhiệm. Xin mời hai ngài vào ghế. Tổng thống chọn bỏ một chính sách để chuyển hai lá còn lại cho thủ tướng.`:'Xin mời tổng thống tiếp tục lựa chọn chính sách.';
      case 'chancellor_discard':return `Tổng thống đã chuyển hồ sơ. Xin mời thủ tướng ${name(game.chancellor_id)} chọn chính sách để ban hành.`;
      case 'discussion':return `${policyText}Xin mời tổng thống ${name(game.president_id)} và thủ tướng ${name(game.chancellor_id)} giải trình. Hội đồng có ba mươi giây trao đổi trước khi tiếp tục.`;
      case 'executive':return `${policyText}Xin mời tổng thống ${name(game.president_id)} thực hiện quyền lực hành pháp.`;
      case 'veto':return 'Thủ tướng đề nghị phủ quyết. Xin mời tổng thống đưa ra quyết định.';
      case 'finished':return policyText;
      case 'lobby':return 'Phòng đã sẵn sàng cho ván mới.';
    }
  }
  // Individual votes and secret card transfers no longer create a speech backlog.
  if(policyText)return policyText;
  const event=game.presentation_event;
  return event&&event.id!==before.presentation_event?.id&&['power','respond_veto'].includes(event.kind)?narrationText(event,game.players):'';
}

type SpeechEngine=Pick<SpeechSynthesis,'speak'|'cancel'|'getVoices'|'addEventListener'|'removeEventListener'>;
const owners=new WeakMap<SpeechEngine,ActionNarrator>();

/** One owner per browser speech engine; transitions replace obsolete queued prompts. */
export class ActionNarrator {
  private baseline:string|null|undefined=undefined;
  private gameBaseline:NarrationGame|undefined;
  private seen=new Set<string>();
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
    if(engine){owners.get(engine)?.dispose();owners.set(engine,this);}
    this.voicesChanged();engine?.addEventListener('voiceschanged',this.voicesChanged);
  }
  get supported(){return !!this.engine;}
  unlock(){if(!this.disposed)this.unlocked=true;}
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.cancel();}
  resetBaseline(){this.baseline=undefined;this.gameBaseline=undefined;this.cancel();}
  private remember(key:string){if(this.seen.has(key))return false;this.seen.add(key);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value!);return true;}
  observe(event:PresentationEvent|null|undefined,players:NamedPlayer[]){
    const id=event?.id||null,previous=this.baseline;this.baseline=id;
    const fresh=event?this.remember(`event:${event.id}`):false;
    if(previous===undefined||!fresh||!event)return;
    this.enqueue(narrationText(event,players),false);
  }
  observeGame(game:NarrationGame){
    const before=this.gameBaseline;
    if(before&&before.code===game.code&&game.version<=before.version)return;
    this.gameBaseline=game;
    const fresh=this.remember(`game:${game.code}:${game.version}`);
    if(!before||before.code!==game.code||!fresh)return;
    this.enqueue(transitionNarration(before,game),true);
  }
  remind(key:string,text:string){if(this.remember(`reminder:${key}`))this.enqueue(text,true);}
  private enqueue(text:string,replace:boolean){
    if(!text||this.disposed||!this.enabled||!this.unlocked||!this.engine)return;
    this.queue=replace?[text]:[...this.queue,text].slice(-2);this.next();
  }
  private next(){
    if(this.disposed||this.current||!this.engine||!this.queue.length||!this.enabled)return;
    const utterance=this.makeUtterance();utterance.text=this.queue.shift()!;utterance.lang='vi-VN';utterance.rate=.96;utterance.volume=.85;
    const voice=this.voices.find(voice=>/^vi(?:[-_]|$)/i.test(voice.lang));if(voice)utterance.voice=voice;
    const complete=()=>{if(this.current!==utterance)return;this.current=null;if(!this.disposed)this.next();};
    utterance.onend=complete;utterance.onerror=complete;this.current=utterance;
    try{this.engine.speak(utterance);}catch{this.current=null;this.queue=[];}
  }
  private cancel(){this.queue=[];if(this.current){this.current.onend=null;this.current.onerror=null;this.current=null;this.engine?.cancel();}}
  dispose(){this.disposed=true;this.cancel();this.engine?.removeEventListener('voiceschanged',this.voicesChanged);if(this.engine&&owners.get(this.engine)===this)owners.delete(this.engine);}
}
