export type RoomAuth = { code: string; token: string };
type ConnectionOptions<T> = {
  session: RoomAuth;
  base: string;
  origin: string;
  socketRef: { current: WebSocket | null };
  onState: (state: T) => void;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
  onInvalid: () => void;
  createSocket?: (url: string) => WebSocket;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
};

/** Each mounted room owns its connection and cancels all callbacks on exit. */
export function connectRoom<T>(options: ConnectionOptions<T>): () => void {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const createSocket = options.createSocket ?? (url => new WebSocket(url));
  let active = true;
  let current: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout>;
  let retries = 0;
  const connect = () => {
    if (!active) return;
    options.onStatus('Đang kết nối…');
    const host = (options.base || options.origin).replace(/^http/, 'ws');
    try {
      const ws = createSocket(`${host}/ws/rooms/${options.session.code}/?token=${encodeURIComponent(options.session.token)}`);
      current = ws;
      options.socketRef.current = ws;
      const owns = () => active && current === ws;
      ws.onopen = () => {
        if (!owns()) return;
        retries = 0;
        options.onStatus('Đã kết nối');
      };
      ws.onmessage = event => {
        if (!owns()) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state') options.onState(data.state);
          else if (data.type === 'error') options.onError(data.message);
        } catch {
          options.onError('Không đọc được cập nhật từ phòng.');
        }
      };
      ws.onclose = event => {
        if (!owns()) return;
        if (options.socketRef.current === ws) options.socketRef.current = null;
        if (event.code === 4403) {
          options.onInvalid();
          options.onStatus('Phòng hoặc phiên không còn hợp lệ');
          options.onError('Phiên đã hết hạn. Trở về và vào phòng lại.');
          return;
        }
        options.onStatus('Mất kết nối · đang thử lại');
        timer = schedule(connect, Math.min(15000, 3000 * ++retries));
      };
      // Browsers dispatch close after a transport error; do not force another close.
      ws.onerror = () => {};
    } catch {
      options.onError('Địa chỉ máy chủ không hợp lệ. Kiểm tra cấu hình kết nối.');
    }
  };
  // React development StrictMode mounts then cleans up immediately. Defer creation
  // so that discarded mount never opens a socket just to abort its handshake.
  timer = schedule(connect, 0);
  return () => {
    active = false;
    cancel(timer);
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      if (options.socketRef.current === current) options.socketRef.current = null;
      current.close(1000, 'Leaving room');
    }
  };
}
