import { initiateDappRelay, type DappRelayResult } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import QRCode from 'qrcode';
import { encodeTransactionBch, hexToBin } from '@bitauth/libauth';
import type { Network } from '../src/network.js';
import { p2pkhAddressFromPublicKey, addressToLocking } from '../src/address.js';
import type { ChainUtxo } from '../src/chain.js';

export interface WalletSession {
  readonly manager: DappConnectionManager;
  readonly address: string;
  readonly walletName: string;
}

export type ConnectHandlers = {
  onUri: (uri: string) => void;
  onStatus: (message: string) => void;
  onReady: (session: WalletSession) => void;
  onDropped: (reason: string) => void;
  onTimeout: () => void;
  onError: (message: string) => void;
};

const CONNECT_TIMEOUT_MS = 45_000;
const RELAYS = ['wss://relay.riften.net:443'];

let relay: DappRelayResult | null = null;
let manager: DappConnectionManager | null = null;
let timeoutId: ReturnType<typeof setTimeout> | undefined;
let currentUri = '';
let droppedHandler: ((reason: string) => void) | undefined;
let settled = false;

const clearTimer = (): void => {
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  timeoutId = undefined;
};

export const getConnectionLink = (): string => currentUri;

export const startConnect = async (handlers: ConnectHandlers, network: Network): Promise<void> => {
  await stopConnect();
  settled = false;
  droppedHandler = handlers.onDropped;
  handlers.onStatus('Opening a private WizardConnect link to your wallet. This should finish in under a minute.');
  manager = new DappConnectionManager('Cubby', undefined, { session: false });
  try {
    relay = initiateDappRelay((payload) => {
      manager?.updateConnection(payload.client, payload.status);
      const status = payload.status.status;
      if (status === 'reconnecting') {
        handlers.onStatus('The wallet link dropped. Trying to reconnect…');
      } else if (status === 'disconnected' || status === 'session_deleted') {
        if (!settled) return;
        handlers.onDropped('The wallet closed the link. Connect again before you send.');
      } else if (payload.status.error) {
        handlers.onError(`WizardConnect error: ${payload.status.error}`);
      }
    }, { explicitRelayUrls: RELAYS, maxReconnectAttempts: 3, reconnectInterval: 2000 });
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : String(error));
    return;
  }
  manager.attachRelay(relay);
  currentUri = relay.uri;
  handlers.onUri(relay.uri);

  const finishReady = (): void => {
    if (settled || !manager) return;
    const pubkey = manager.getPubkey(0, 0n);
    if (!pubkey) {
      handlers.onError('The wallet did not share a receive key.');
      return;
    }
    settled = true;
    clearTimer();
    const address = p2pkhAddressFromPublicKey(pubkey, network);
    handlers.onReady({ manager, address, walletName: manager.walletName ?? 'wallet' });
  };

  manager.on('walletready', finishReady);
  manager.on('disconnect', (reason, message) => {
    const text = message || String(reason) || 'The wallet closed the link.';
    if (!settled) {
      handlers.onError(`The wallet disconnected before it finished connecting. ${text}`);
      return;
    }
    droppedHandler?.(text);
  });

  timeoutId = setTimeout(() => {
    if (settled) return;
    void stopConnect();
    handlers.onTimeout();
  }, CONNECT_TIMEOUT_MS);
};

export const stopConnect = async (): Promise<void> => {
  clearTimer();
  currentUri = '';
  droppedHandler = undefined;
  if (manager) {
    try {
      manager.clearStoredSession();
      await manager.sendDisconnect('user closed the connection');
    } catch {
      /* ignore */
    }
  }
  relay?.cleanup();
  manager = null;
  relay = null;
  settled = false;
};

const drawWizardHat = (canvas: HTMLCanvasElement): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const box = Math.round(size * 0.22);
  const x = Math.round((size - box) / 2);
  const y = Math.round((size - box) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1635';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, box, box, 8);
  ctx.fill();
  ctx.stroke();
  // Simple wizard hat (WizardConnect brand mark, not a Cubby logo).
  const cx = size / 2;
  const top = y + box * 0.14;
  const brimY = y + box * 0.68;
  const brimW = box * 0.78;
  ctx.fillStyle = '#5b2dff';
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx + box * 0.28, brimY);
  ctx.lineTo(cx - box * 0.28, brimY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1b1635';
  ctx.fillRect(cx - brimW / 2, brimY, brimW, box * 0.1);
  ctx.fillStyle = '#ffd36a';
  ctx.fillRect(cx - box * 0.08, brimY - box * 0.12, box * 0.16, box * 0.1);
};

export const drawQr = async (canvas: HTMLCanvasElement, uri: string): Promise<void> => {
  await QRCode.toCanvas(canvas, uri, { width: 240, margin: 1, color: { dark: '#1b1635', light: '#ffffff' } });
  drawWizardHat(canvas);
};

export const copyConnectionLink = async (): Promise<string> => {
  if (!currentUri) throw new Error('There is no connection link yet.');
  await navigator.clipboard.writeText(currentUri);
  return currentUri;
};

const estimateFee = (inputs: number, outputs: number): bigint => 10n + 148n * BigInt(inputs) + 34n * BigInt(outputs);

export const requestWalletSend = async (
  session: WalletSession,
  utxos: ChainUtxo[],
  destinationLocking: Uint8Array,
  amount: bigint,
  network: Network,
): Promise<{ txid: string; hex: string }> => {
  if (utxos.length === 0) throw new Error('The connected wallet has no coins on this network yet.');
  const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
  const changeLock = addressToLocking(session.address);
  const withChange = estimateFee(utxos.length, 2);
  const noChange = estimateFee(utxos.length, 1);
  let outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>;
  if (total >= amount + withChange + 546n) {
    outputs = [
      { lockingBytecode: destinationLocking, valueSatoshis: amount },
      { lockingBytecode: changeLock, valueSatoshis: total - amount - withChange },
    ];
  } else if (total >= amount + noChange) {
    outputs = [{ lockingBytecode: destinationLocking, valueSatoshis: amount }];
  } else {
    throw new Error(`The wallet needs about ${amount + withChange} units (it has ${total}).`);
  }
  const tx = {
    version: 2,
    locktime: 0,
    inputs: utxos.map((u) => ({
      outpointTransactionHash: hexToBin(u.txid),
      outpointIndex: u.vout,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
    })),
    outputs,
  };
  const hex = Buffer.from(encodeTransactionBch(tx)).toString('hex');
  const sourceOutputs = utxos.map((u) => ({
    outpointTransactionHash: hexToBin(u.txid),
    outpointIndex: u.vout,
    sequenceNumber: 0xffffffff,
    unlockingBytecode: new Uint8Array(),
    lockingBytecode: u.lockingBytecode,
    valueSatoshis: u.satoshis,
  }));
  const inputPaths = utxos.map((_, i) => [i, 'receive' as const, 0] as [number, 'receive', number]);
  const response = await session.manager.signTransaction({
    transaction: { transaction: hex, sourceOutputs, userPrompt: 'Send coins to your Cubby box', broadcast: network.allowBroadcast },
    inputPaths,
  });
  const signed = response as { signedTransaction?: string; signedTransactionHash?: string };
  if (!signed?.signedTransactionHash || !signed.signedTransaction) {
    throw new Error('The wallet did not return a signed payment.');
  }
  return { txid: signed.signedTransactionHash, hex: signed.signedTransaction };
};
