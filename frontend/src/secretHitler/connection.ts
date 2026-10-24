import type { Game, Session } from './types';

type ConnectionRuntime = {
  origin?: string;
  createSocket?: (url:string)=>WebSocket;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
};

export function connectSecretRoom(session: Session, base: string, receive: (game: Game)=>void, status: (message:string)=>void, error:(message:string)=>void, setSocket:(ws:WebSocket|null)=>void, runtime:ConnectionRuntime={}) {
  const schedule=runtime.schedule??setTimeout, cancel=runtime.cancel??clearTimeout;
  const createSocket=runtime.createSocket??(url=>new WebSocket(url));
  let active = true, socket: WebSocket|null = null, retries = 0;
  let timer: ReturnType<typeof setTimeout>;
  const connect = () => {
    if (!active) return;
    status('Đang kết nối');
    let ws:WebSocket;
    try {
      const origin=runtime.origin??location.origin;
      const host = new URL(base || origin, origin);
      if(!['http:','https:'].includes(host.protocol))throw new Error('Invalid API scheme');
      host.protocol = host.protocol === 'https:' ? 'wss:' : 'ws:';
      host.pathname = `/ws/secret-hitler/rooms/${encodeURIComponent(session.code)}/`;
      host.search = new URLSearchParams({token:session.token}).toString();
      host.hash='';
      ws = createSocket(host.toString());
    } catch {
      setSocket(null);
      status('Không thể kết nối');
      error('Địa chỉ máy chủ không hợp lệ hoặc trình duyệt không mở được kết nối.');
      return;
    }
    socket = ws;
    const owns=()=>active&&socket===ws;
    setSocket(ws);
    ws.onopen=()=>{if(owns()){retries=0;status('Đã kết nối');}};
    ws.onmessage=event=>{if(!owns())return;try{const data=JSON.parse(event.data);if(data.type==='state')receive(data.state);else if(data.type==='error')error(data.message);}catch{error('Không đọc được cập nhật của phòng.');}};
    ws.onerror=()=>{};
    ws.onclose=event=>{if(!owns())return;socket=null;setSocket(null);if(event.code===4403){status('Phiên không hợp lệ');error('Phòng hoặc phiên của bạn không còn hợp lệ. Về sảnh để tạo hoặc vào phòng khác.');return;}status('Mất kết nối · đang thử lại');timer=schedule(connect,Math.min(15000,1000*2**Math.min(++retries,4)));};
  };
  timer=schedule(connect,0);
  return ()=>{active=false;cancel(timer);setSocket(null);if(socket){socket.onopen=null;socket.onclose=null;socket.onmessage=null;socket.onerror=null;socket.close(1000,'Leaving room');}};
}
