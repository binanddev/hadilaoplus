import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {withWebSocketDiagnostics} from './proxyLogger.ts';
export default defineConfig({customLogger:withWebSocketDiagnostics(createLogger()),plugins:[react()],server:{proxy:{'/api':{target:'http://127.0.0.1:8000',changeOrigin:true},'/ws':{target:'ws://127.0.0.1:8000',ws:true}}}});
