// Minimal ambient types for socket.io-client v2 (it ships none, and the
// published @types/socket.io-client package is a deprecated stub past
// v1.4.x) - just enough surface for what App.tsx actually uses.
declare module 'socket.io-client' {
  export interface Socket {
    on(event: string, handler: (...args: unknown[]) => void): Socket;
    emit(event: string, ...args: unknown[]): Socket;
    disconnect(): Socket;
  }

  export default function io(uri?: string, opts?: Record<string, unknown>): Socket;
}
