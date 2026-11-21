// Minimal types for the `ws` server used by the local demo relay (ws ships no types; @types/ws is not installed).
declare module 'ws' {
  export interface WebSocket {
    send(data: string): void;
    on(event: 'message', cb: (raw: unknown) => void): void;
    on(event: 'close', cb: () => void): void;
  }
  export class WebSocketServer {
    constructor(options: { port: number; host?: string });
    on(event: 'connection', cb: (ws: WebSocket) => void): void;
    on(event: 'listening', cb: () => void): void;
    close(cb?: () => void): void;
  }
}
