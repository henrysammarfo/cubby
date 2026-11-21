import { describe, expect, it } from 'vitest';
import {
  CONNECT_TIMEOUT_MS,
  HEARTBEAT_STALE_MS,
  RECONNECT_GIVE_UP_MS,
  initialLinkState,
  reduceLink,
} from '../src/wallet-link.js';

describe('wallet link watch', () => {
  it('times out a connect that never becomes ready after 20 seconds', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    const mid = reduceLink(state, { type: 'tick' }, CONNECT_TIMEOUT_MS - 1);
    expect(mid.action).toBeUndefined();
    const done = reduceLink(mid.state, { type: 'tick' }, CONNECT_TIMEOUT_MS);
    expect(done.action).toBe('timeout');
    expect(done.state.phase).toBe('dead');
  });

  it('does not hang after a mid-connect reconnecting blip; the 20s timer still fires', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    state = reduceLink(state, { type: 'relay', status: 'reconnecting' }, 1_000).state;
    expect(state.phase).toBe('connecting');
    const done = reduceLink(state, { type: 'tick' }, CONNECT_TIMEOUT_MS);
    expect(done.action).toBe('timeout');
  });

  it('notices a wallet-side disconnect within a few seconds once connected', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    state = reduceLink(state, { type: 'ready' }, 2_000).state;
    const dropped = reduceLink(state, { type: 'relay', status: 'disconnected' }, 3_000);
    expect(dropped.action).toBe('dropped');
  });

  it('gives up if the relay stays on reconnecting after the wallet is ready', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    state = reduceLink(state, { type: 'ready' }, 1_000).state;
    state = reduceLink(state, { type: 'relay', status: 'reconnecting' }, 2_000).state;
    expect(state.phase).toBe('reconnecting');
    const still = reduceLink(state, { type: 'tick' }, 2_000 + RECONNECT_GIVE_UP_MS - 1);
    expect(still.action).toBeUndefined();
    const given = reduceLink(state, { type: 'tick' }, 2_000 + RECONNECT_GIVE_UP_MS);
    expect(given.action).toBe('dropped');
  });

  it('drops a ready session when heartbeats go stale', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    state = reduceLink(state, { type: 'ready' }, 1_000).state;
    const ok = reduceLink(state, { type: 'tick' }, 1_000 + HEARTBEAT_STALE_MS - 1);
    expect(ok.action).toBeUndefined();
    const stale = reduceLink(state, { type: 'tick' }, 1_000 + HEARTBEAT_STALE_MS);
    expect(stale.action).toBe('dropped');
  });

  it('keeps the session when a heartbeat arrives in time', () => {
    let { state } = reduceLink(initialLinkState(0), { type: 'start' }, 0);
    state = reduceLink(state, { type: 'ready' }, 1_000).state;
    state = reduceLink(state, { type: 'relay', status: 'connected' }, 1_000 + HEARTBEAT_STALE_MS - 500).state;
    const tick = reduceLink(state, { type: 'tick' }, 1_000 + HEARTBEAT_STALE_MS);
    expect(tick.action).toBeUndefined();
    expect(tick.state.phase).toBe('ready');
  });
});
