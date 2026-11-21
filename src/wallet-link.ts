/** Detect WizardConnect drops quickly, and never hang on "connecting". */
export const CONNECT_TIMEOUT_MS = 20_000;
export const HEARTBEAT_INTERVAL_MS = 2_000;
export const HEARTBEAT_STALE_MS = 6_000;
export const RECONNECT_GIVE_UP_MS = 5_000;

export type LinkPhase = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'dead';

export type LinkState = {
  phase: LinkPhase;
  startedAt: number;
  lastSeen: number;
  reconnectSince: number | null;
};

export type LinkEvent =
  | { type: 'start' }
  | { type: 'ready' }
  | { type: 'relay'; status: string }
  | { type: 'tick' }
  | { type: 'stop' };

export type LinkResult = { state: LinkState; action?: 'timeout' | 'dropped' };

export const initialLinkState = (now = 0): LinkState => ({
  phase: 'idle',
  startedAt: now,
  lastSeen: now,
  reconnectSince: null,
});

const dead = (state: LinkState, action: 'timeout' | 'dropped'): LinkResult => ({
  state: { ...state, phase: 'dead', reconnectSince: null },
  action,
});

const isDropStatus = (status: string): boolean =>
  status === 'disconnected' || status === 'session_deleted' || status === 'session deleted';

export const reduceLink = (state: LinkState, event: LinkEvent, now: number): LinkResult => {
  if (event.type === 'stop') return { state: initialLinkState(now) };
  if (event.type === 'start') {
    return { state: { phase: 'connecting', startedAt: now, lastSeen: now, reconnectSince: null } };
  }
  if (event.type === 'ready') {
    return { state: { ...state, phase: 'ready', lastSeen: now, reconnectSince: null } };
  }
  if (event.type === 'relay') {
    if (isDropStatus(event.status)) {
      // During the first connect, a brief relay blip should not wipe the QR; the 20s timer covers a hang.
      if (state.phase === 'connecting' || state.phase === 'idle') return { state };
      return dead(state, 'dropped');
    }
    if (event.status === 'reconnecting') {
      if (state.phase === 'connecting' || state.phase === 'idle') return { state };
      return {
        state: { ...state, phase: 'reconnecting', reconnectSince: state.reconnectSince ?? now },
      };
    }
    return {
      state: {
        ...state,
        phase: state.phase === 'connecting' ? 'connecting' : 'ready',
        lastSeen: now,
        reconnectSince: null,
      },
    };
  }
  if (event.type === 'tick') {
    if (state.phase === 'connecting' && now - state.startedAt >= CONNECT_TIMEOUT_MS) {
      return dead(state, 'timeout');
    }
    if (state.phase === 'reconnecting' && state.reconnectSince !== null && now - state.reconnectSince >= RECONNECT_GIVE_UP_MS) {
      return dead(state, 'dropped');
    }
    if (state.phase === 'ready' && now - state.lastSeen >= HEARTBEAT_STALE_MS) {
      return dead(state, 'dropped');
    }
  }
  return { state };
};
