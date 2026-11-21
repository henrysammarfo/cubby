/**
 * A tiny in-memory Nostr relay (NIP-01 EVENT / REQ / CLOSE, replaceable kind 10011) for local demos and tests.
 * Cubby never publishes to public relays from scripts; `identity-chipnet.ts --publish <wss url>` exists for the owner to choose.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { matchFilter, type Filter } from 'nostr-tools/filter';

export const startMiniRelay = (port: number): Promise<{ url: string; events: Event[]; close: () => Promise<void> }> =>
  new Promise((resolve) => {
    const events: Event[] = [];
    const subs = new Map<WebSocket, Map<string, Filter[]>>();
    const wss = new WebSocketServer({ port, host: '127.0.0.1' });
    wss.on('connection', (ws) => {
      subs.set(ws, new Map());
      ws.on('message', (raw) => {
        let msg: unknown[];
        try {
          msg = JSON.parse(String(raw)) as unknown[];
        } catch {
          return;
        }
        if (msg[0] === 'EVENT') {
          const e = msg[1] as Event;
          const clean = { id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig };
          if (!verifyEvent(clean)) {
            ws.send(JSON.stringify(['OK', e.id, false, 'invalid: bad signature']));
            return;
          }
          // NIP-01: kinds 10000-19999 are replaceable per pubkey and kind.
          if (e.kind >= 10000 && e.kind < 20000) {
            for (let i = events.length - 1; i >= 0; i--) if (events[i]!.pubkey === e.pubkey && events[i]!.kind === e.kind) events.splice(i, 1);
          }
          events.push(clean);
          ws.send(JSON.stringify(['OK', e.id, true, '']));
          for (const [client, m] of subs) for (const [id, filters] of m) if (filters.some((f) => matchFilter(f, clean))) client.send(JSON.stringify(['EVENT', id, clean]));
        } else if (msg[0] === 'REQ') {
          const id = String(msg[1]);
          const filters = msg.slice(2) as Filter[];
          subs.get(ws)!.set(id, filters);
          for (const e of events) if (filters.some((f) => matchFilter(f, e))) ws.send(JSON.stringify(['EVENT', id, e]));
          ws.send(JSON.stringify(['EOSE', id]));
        } else if (msg[0] === 'CLOSE') {
          subs.get(ws)!.delete(String(msg[1]));
        }
      });
      ws.on('close', () => subs.delete(ws));
    });
    wss.on('listening', () =>
      resolve({ url: `ws://127.0.0.1:${port}`, events, close: () => new Promise((r) => wss.close(() => r())) }),
    );
  });
