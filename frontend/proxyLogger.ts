import type {Logger} from 'vite';

/** Keep transport failures visible, without duplicate stacks for Windows socket aborts. */
export function withWebSocketDiagnostics(logger:Logger):Logger {
  const reported=new WeakSet<object>();
  const wrapped:Logger=Object.create(logger);
  wrapped.error=(message,options)=>{
    const error=options?.error as (Error & {code?:string})|undefined;
    const websocket=/\bws proxy(?: socket)? error:/i.test(message.replace(/\x1b\[[0-9;]*m/g,''));
    if(websocket&&error?.code==='ECONNABORTED'){
      if(reported.has(error))return;
      reported.add(error);
      logger.warn('WebSocket bị ngắt (ECONNABORTED). Nếu vẫn ở trong phòng, trình duyệt sẽ tự kết nối lại.',{timestamp:true});
      return;
    }
    logger.error(message,options);
  };
  return wrapped;
}
