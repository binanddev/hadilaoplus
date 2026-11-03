import type {State} from './types';

/** One active broadcaster. Deploy TURN via VITE_CONFESSION_ICE_SERVERS for restrictive NATs. */
export class ConfessionVoice {
 private peers=new Map<string,RTCPeerConnection>();
 private audio=new Map<string,HTMLAudioElement>();
 private stream:MediaStream|null=null;
 private state:State|null=null;
 private generation=0;
 private muted=false;
 private pending=new Map<string,RTCIceCandidateInit[]>();
 constructor(private me:string,private send:(data:unknown)=>void,private status:(text:string)=>void){}
 private signal(target:string,payload:unknown){this.send({action:'signal',target,payload,round:this.state?.round})}
 private peer(id:string){
  const previous=this.peers.get(id);if(previous)return previous;
  let iceServers:RTCIceServer[]=[];
  try{iceServers=JSON.parse(import.meta.env.VITE_CONFESSION_ICE_SERVERS||'[]')}catch{/* Local peers still work without configured relay. */}
  const pc=new RTCPeerConnection({iceServers});this.peers.set(id,pc);
  pc.onicecandidate=e=>{if(e.candidate)this.signal(id,{ice:e.candidate.toJSON()})};
  pc.ontrack=e=>{let audio=this.audio.get(id);if(!audio){audio=new Audio();this.audio.set(id,audio)}audio.srcObject=e.streams[0];audio.muted=this.muted;void audio.play().catch(()=>this.status('Bấm “Nghe mic” để cho phép phát giọng nói.'))};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')this.status('Không nối được mic với một người nghe. Máy chủ có thể cần TURN.')};
  return pc;
 }
 update(s:State){
  if(this.state && (s.round!==this.state.round||s.phase!=='confession'))this.stop();
  this.state=s;
  for(const [id,p] of this.peers)if(!s.players.some(q=>q.id===id)){p.close();this.peers.delete(id);this.audio.get(id)?.pause();this.audio.delete(id)}
  if(this.stream)for(const p of s.players)if(p.id!==this.me&&!this.peers.has(p.id))void this.offer(p.id).catch(()=>this.status('Không kết nối được một người nghe.'));
 }
 private async offer(id:string){const p=this.peer(id);for(const track of this.stream!.getTracks())p.addTrack(track,this.stream!);await p.setLocalDescription(await p.createOffer());this.signal(id,{description:p.localDescription})}
 async start(){
  if(this.state?.phase!=='confession'||this.state.speaker!==this.me||this.stream)return;
  const generation=this.generation;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(generation!==this.generation||this.state?.phase!=='confession'){stream.getTracks().forEach(t=>t.stop());return}
   this.stream=stream;this.status('Mic đang bật · tự tắt khi hết 20 giây');
   await Promise.allSettled(this.state.players.filter(p=>p.id!==this.me).map(p=>this.offer(p.id)));
  }catch{this.status('Chưa mở được mic. Cần HTTPS/localhost và quyền micro; bạn vẫn có thể dùng chữ.')}
 }
 async receive(sender:string,payload:{description?:RTCSessionDescriptionInit;ice?:RTCIceCandidateInit},round:number){
  if(!payload||this.state?.phase!=='confession'||round!==this.state.round)return;
  if(sender!==this.state.speaker&&this.me!==this.state.speaker)return;
  try{
   const p=this.peer(sender);
   if(payload.description){await p.setRemoteDescription(payload.description);for(const ice of this.pending.get(sender)||[])await p.addIceCandidate(ice);this.pending.delete(sender);if(payload.description.type==='offer'){await p.setLocalDescription(await p.createAnswer());this.signal(sender,{description:p.localDescription})}}
   if(payload.ice){if(p.remoteDescription)await p.addIceCandidate(payload.ice);else this.pending.set(sender,[...(this.pending.get(sender)||[]),payload.ice].slice(-40))}
  }catch{this.status('Kết nối giọng nói bị gián đoạn.')}
 }
 listen(muted:boolean){this.muted=muted;for(const a of this.audio.values()){a.muted=muted;if(!muted)void a.play().catch(()=>this.status('Trình duyệt chưa cho phát âm thanh.'))}}
 stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;for(const p of this.peers.values())p.close();this.peers.clear();for(const a of this.audio.values()){a.pause();a.srcObject=null}this.audio.clear();this.pending.clear()}
}
