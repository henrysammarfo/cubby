import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import QRCode from 'qrcode';
import { EMBER_TOKEN_ADDRESS, REPO_URL, WIDGET_FACTORY_URL } from '../src/banner.js';
import { getNetwork, explorerTxUrl, explorerAddressUrl, type Network, type NetworkId, DUST_SATS } from '../src/network.js';
import { assertNetworkAddress, addressToLocking, p2pkhAddressFromPublicKey } from '../src/address.js';
import {
  addressesHaveHistory,
  broadcastTransaction,
  getWalletBalances,
  transactionsFromApi,
  utxosFromApi,
  utxosFromTransaction,
  type ChainUtxo,
} from '../src/chain.js';
import { scanAddressBatches } from '../src/wallet-scan.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { createDeviceLock, loadVault, requestAssertion, vaultFromStored, currentRpId, type StoredVault } from './passkey.js';
import { copyConnectionLink, drawQr, requestWalletSend, startConnect, stopConnect, type WalletCoin, type WalletSession } from './wizard.js';
import { loadActivity, mergeChainActivity, recordActivity, renderActivity } from './activity.js';
import { attachHold } from './hold.js';
import './hero-demo.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element ${id}`);
  return el as T;
};
const button = (id: string): HTMLButtonElement => $(id);
const input = (id: string): HTMLInputElement => $(id);

const setStatus = (id: string, kind: 'ok' | 'err' | 'info', text: string): void => {
  const el = $(id);
  el.className = `status ${kind}`;
  el.textContent = text;
  el.classList.remove('hidden');
};

const formatBch = (sats: bigint): string => {
  const whole = sats / 100_000_000n;
  const frac = (sats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac} BCH` : `${whole} BCH`;
};

const parseBch = (text: string): bigint | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) return null;
  const [w, f = ''] = trimmed.split('.');
  return BigInt(w ?? '0') * 100_000_000n + BigInt((f ?? '').padEnd(8, '0'));
};

const shortAddress = (address: string): string => {
  const [prefix, body] = address.includes(':') ? (address.split(':') as [string, string]) : (['', address] as const);
  if (body.length <= 10) return address;
  return `${prefix}:${body.slice(0, 4)}…${body.slice(-4)}`;
};

const shortTxid = (txid: string): string => (txid.length <= 16 ? txid : `${txid.slice(0, 8)}…${txid.slice(-6)}`);

const params = new URLSearchParams(location.search);
const shot = params.has('shot') || params.has('state');
let network: Network = getNetwork(params.get('network'));
let wallet: WalletSession | undefined;
let stored: StoredVault | null = loadVault();
let vaultUtxo: ChainUtxo | undefined;
let vaultBalance = 0n;
let pollId: ReturnType<typeof setInterval> | undefined;
let unlocked = shot;

($('widgetLink') as HTMLAnchorElement).href = WIDGET_FACTORY_URL;
($('repoLink') as HTMLAnchorElement).href = REPO_URL;
$('emberAddress').textContent = EMBER_TOKEN_ADDRESS;

const select = $('network') as HTMLSelectElement;
select.value = network.id;
const useMainnet = $('useMainnet') as HTMLInputElement;
useMainnet.checked = network.id === 'mainnet';

type ScreenName = 'create' | 'unlock' | 'dashboard' | 'receive' | 'send' | 'success' | 'error' | 'activity' | 'details';
const APP_SCREENS: ScreenName[] = ['create', 'unlock', 'dashboard', 'receive', 'send', 'success', 'error', 'activity', 'details'];

const showLanding = (): void => {
  $('landing').hidden = false;
  $('app').hidden = true;
  $('dock').classList.add('hidden');
};

const showApp = (): void => {
  $('landing').hidden = true;
  $('app').hidden = false;
};

const paintDock = (name: ScreenName): void => {
  const dock = $('dock');
  const inApp = APP_SCREENS.includes(name) && name !== 'create' && name !== 'unlock' && name !== 'success' && name !== 'error';
  dock.classList.toggle('hidden', !inApp);
  dock.querySelectorAll('a').forEach((a) => {
    const key = (a as HTMLElement).dataset.dock;
    a.setAttribute('aria-current', key === name ? 'page' : 'false');
  });
};

const showScreen = (name: ScreenName): void => {
  showApp();
  document.querySelectorAll('#app .screen').forEach((el) => {
    (el as HTMLElement).hidden = (el as HTMLElement).dataset.screen !== name;
  });
  paintDock(name);
};

const entryScreen = (): ScreenName => {
  if (!stored) return 'create';
  if (shot) return 'dashboard';
  return 'unlock';
};

const refreshNetworkCopy = (): void => {
  $('dashNetwork').textContent = network.label[0]!.toUpperCase() + network.label.slice(1);
  $('fundNeed').textContent = network.id === 'chipnet'
    ? `Send at least ${network.recommendedFundSats} test units so a later send can pay the network fee. Test coins have no value.`
    : `Send at least ${network.recommendedFundSats} units (0.0002 BCH) so a later send can pay the network fee. Sending on the main network is still off.`;
  const faucet = $('faucetLink') as HTMLAnchorElement;
  if (network.faucetHint) {
    faucet.href = network.id === 'chipnet' ? 'https://tbch.googol.cash/' : network.faucetHint;
    faucet.classList.toggle('hidden', network.id !== 'chipnet');
  }
  $('detailFee').textContent = `${network.vaultSpendFeeSats.toLocaleString('en-GB')} units`;
  $('detailFund').textContent = `${network.recommendedFundSats.toLocaleString('en-GB')} units`;
  $('detailNetwork').textContent = network.label;
  $('sendHint').textContent = `Available ${formatBch(vaultBalance)}. The network fee is ${network.vaultSpendFeeSats} units, taken from the box.`;
};

const paintVault = (): void => {
  const address = stored?.address ?? '';
  $('vaultAddress').textContent = address;
  $('dashAddress').textContent = address ? shortAddress(address) : 'No box yet';
  $('detailAddress').textContent = address;
  $('unlockAddress').textContent = address;
  $('detailRp').textContent = stored?.rpId ?? currentRpId();
  $('detailLock').textContent = stored
    ? 'Saved on this device after you created the box. A real iPhone Face ID check has not been completed yet.'
    : 'No phone lock on this device yet.';
  $('bal').textContent = formatBch(vaultBalance);
  $('balUnits').textContent = `${vaultBalance} units`;
  refreshNetworkCopy();
};

const drawAddressQr = async (): Promise<void> => {
  if (!stored) return;
  const canvas = $('addrQr') as HTMLCanvasElement;
  await QRCode.toCanvas(canvas, stored.address, { margin: 1, width: 240, color: { dark: '#0B0B0F', light: '#ffffff' } });
};

const refreshActivity = async (): Promise<void> => {
  const host = $('activityList');
  if (!stored) {
    renderActivity(host, [], network);
    return;
  }
  const local = loadActivity(stored.address, network.id);
  const chain = (await transactionsFromApi(stored.address, network)) ?? [];
  renderActivity(host, mergeChainActivity(local, chain, stored.address, network.id), network);
};

const rememberUtxo = (utxo: ChainUtxo): void => {
  vaultUtxo = utxo;
};

const refreshBalance = async (): Promise<void> => {
  if (!stored) {
    vaultBalance = 0n;
    vaultUtxo = undefined;
    paintVault();
    return;
  }
  const utxos = (await utxosFromApi(stored.address, network)) ?? [];
  vaultBalance = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
  vaultUtxo = [...utxos].sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
  paintVault();
};

const startBalancePoll = (): void => {
  if (pollId) clearInterval(pollId);
  pollId = setInterval(() => {
    void refreshBalance();
  }, 8_000);
};

type DiscoveredAddress = { address: string; chain: 'receive' | 'change'; index: number };
const deriveWalletAddress = (session: WalletSession, chain: 'receive' | 'change') => {
  const child = chain === 'receive' ? 0 : 1;
  return (index: number): DiscoveredAddress | undefined => {
    const pubkey = session.manager.getPubkey(child, BigInt(index));
    if (!pubkey) return undefined;
    return { address: p2pkhAddressFromPublicKey(pubkey, network), chain, index };
  };
};

const inspectWalletBatch = (batch: DiscoveredAddress[]): Promise<boolean[]> =>
  addressesHaveHistory(network, batch.map((row) => row.address));

const discoverWalletCoins = async (session: WalletSession): Promise<WalletCoin[]> => {
  const receive = await scanAddressBatches(deriveWalletAddress(session, 'receive'), inspectWalletBatch);
  const change = session.manager.hasPath(1)
    ? await scanAddressBatches(deriveWalletAddress(session, 'change'), inspectWalletBatch)
    : [];
  const used = [...receive, ...change];
  const coins: WalletCoin[] = [];
  for (const row of used) {
    const utxos = (await utxosFromApi(row.address, network)) ?? [];
    for (const utxo of utxos) coins.push({ ...utxo, inputPath: [0, row.chain, row.index] });
  }
  return coins;
};

const refreshWalletBalance = async (): Promise<void> => {
  const el = $('walletBalance');
  if (!wallet) {
    el.textContent = 'No wallet connected';
    return;
  }
  try {
    const balances = await getWalletBalances(network, wallet.address);
    el.textContent = `${formatBch(balances.satoshis)}${balances.pusdCents ? ` · ${(Number(balances.pusdCents) / 100).toFixed(2)} PUSD` : ''}`;
  } catch {
    el.textContent = wallet.address;
  }
};

const markWalletDropped = (reason: string): void => {
  wallet = undefined;
  button('reconnect').classList.remove('hidden');
  button('disconnect').classList.add('hidden');
  setStatus('walletStatus', 'err', reason);
  void refreshWalletBalance();
};

const beginConnect = async (): Promise<void> => {
  button('reconnect').classList.add('hidden');
  setStatus('walletStatus', 'info', 'Waiting for your wallet. If nothing happens in 20 seconds, tap New code.');
  await startConnect(
    {
      onUri: (uri, qrUri) => {
        $('wcUri').textContent = uri;
        $('wcUri').classList.remove('hidden');
        $('qr').classList.remove('hidden');
        button('copyUri').classList.remove('hidden');
        const open = $('openUri') as HTMLAnchorElement;
        open.href = qrUri;
        open.classList.remove('hidden');
        void drawQr($('qr') as HTMLCanvasElement, qrUri);
      },
      onStatus: (message) => setStatus('walletStatus', 'info', message),
      onReady: (session) => {
        wallet = session;
        button('disconnect').classList.remove('hidden');
        button('reconnect').classList.add('hidden');
        button('fundWallet').disabled = !stored || !network.allowBroadcast;
        setStatus('walletStatus', 'ok', `Connected to ${session.walletName}.`);
        void refreshWalletBalance();
      },
      onDropped: markWalletDropped,
      onTimeout: () => setStatus('walletStatus', 'err', 'Nothing happened in 20 seconds. Tap New code for a fresh code.'),
      onError: (message) => setStatus('walletStatus', 'err', message),
    },
    network,
  );
};

const applyNetwork = (id: NetworkId): void => {
  network = getNetwork(id);
  select.value = network.id;
  useMainnet.checked = network.id === 'mainnet';
  if (stored && stored.network !== network.id) {
    stored = loadVault();
    if (stored && stored.network !== network.id) {
      setStatus('walletStatus', 'info', 'This box was created on a different network. Create a new box to use this network, or switch back.');
    }
  }
  refreshNetworkCopy();
  void refreshBalance();
  void refreshActivity();
  void refreshWalletBalance();
};

select.addEventListener('change', () => applyNetwork(select.value as NetworkId));
useMainnet.addEventListener('change', () => applyNetwork(useMainnet.checked ? 'mainnet' : 'chipnet'));

const reviewHold = attachHold(button('reviewConfirm'), { hint: document.getElementById('reviewHint') });

const openReview = (title: string, rows: Array<[string, string]>): Promise<boolean> =>
  new Promise((resolve) => {
    $('reviewTitle').textContent = title;
    const body = $('reviewBody');
    body.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      body.append(dt, dd);
    }
    const modal = $('reviewModal') as HTMLDialogElement;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      reviewHold.reset();
      if (modal.open) modal.close();
      resolve(ok);
    };
    modal.addEventListener('close', () => finish(false), { once: true });
    void reviewHold.wait().then((ok) => {
      if (ok) finish(true);
    });
    modal.showModal();
  });

button('createLock').addEventListener('click', async () => {
  try {
    button('createLock').disabled = true;
    setStatus('lockStatus', 'info', 'Waiting for your face or fingerprint…');
    stored = await createDeviceLock(network);
    paintVault();
    await drawAddressQr();
    setStatus('lockStatus', 'ok', 'Your box is ready.');
    unlocked = true;
    showScreen('dashboard');
    startBalancePoll();
    void refreshBalance();
  } catch (error) {
    setStatus('lockStatus', 'err', error instanceof Error ? error.message : String(error));
  } finally {
    button('createLock').disabled = false;
  }
});

button('unlockBtn').addEventListener('click', async () => {
  try {
    if (!stored) throw new Error('Create a box first.');
    button('unlockBtn').disabled = true;
    setStatus('unlockStatus', 'info', 'Waiting for your face or fingerprint…');
    await requestAssertion(stored, crypto.getRandomValues(new Uint8Array(32)));
    setStatus('unlockStatus', 'ok', 'Opened.');
    unlocked = true;
    showScreen('dashboard');
    startBalancePoll();
    void refreshBalance();
    void refreshActivity();
  } catch (error) {
    setStatus('unlockStatus', 'err', error instanceof Error ? error.message : String(error));
  } finally {
    button('unlockBtn').disabled = false;
  }
});

button('copyVault').addEventListener('click', async () => {
  if (stored) {
    await navigator.clipboard.writeText(stored.address);
    setStatus('fundStatus', 'ok', 'Address copied.');
  }
});
button('qrButton').addEventListener('click', () => button('copyVault').click());

button('connect').addEventListener('click', () => void beginConnect());
button('newQr').addEventListener('click', () => void beginConnect());
button('reconnect').addEventListener('click', () => void beginConnect());
button('disconnect').addEventListener('click', async () => {
  await stopConnect();
  wallet = undefined;
  button('disconnect').classList.add('hidden');
  setStatus('walletStatus', 'info', 'Wallet disconnected');
  void refreshWalletBalance();
});
$('copyUri').addEventListener('click', async () => {
  try {
    await copyConnectionLink();
    setStatus('walletStatus', 'ok', 'Connection link copied.');
  } catch (error) {
    setStatus('walletStatus', 'err', error instanceof Error ? error.message : String(error));
  }
});

button('fundWallet').addEventListener('click', async () => {
  try {
    if (!wallet || !stored) throw new Error('Connect a wallet and create a box first.');
    if (!network.allowBroadcast) throw new Error('Main network sending is off until it is approved.');
    const agreed = await openReview('Review wallet deposit', [
      ['Network', network.label],
      ['From your wallet', wallet.address],
      ['To your box', stored.address],
      ['Amount', `${network.recommendedFundSats} units`],
    ]);
    if (!agreed) return;
    setStatus('fundStatus', 'info', 'Asking your wallet to send coins to the box…');
    const walletCoins = await discoverWalletCoins(wallet);
    if (walletCoins.length === 0) {
      throw new Error('Could not find coins in the connected wallet on this network. Send coins to the box address yourself.');
    }
    const { vault } = vaultFromStored(stored);
    const sent = await requestWalletSend(wallet, walletCoins, vault.lockingBytecode, network.recommendedFundSats, network);
    input('fundTxid').value = sent.txid;
    recordActivity({ kind: 'deposit', txid: sent.txid, at: new Date().toISOString(), satoshis: String(network.recommendedFundSats), network: network.id, vaultAddress: stored.address });
    const found = await utxosFromTransaction(network, sent.txid, stored.address);
    const first = found[0];
    if (first) rememberUtxo(first);
    void refreshBalance();
    void refreshActivity();
    setStatus('fundStatus', 'ok', `Wallet payment sent. ${shortTxid(sent.txid)}`);
  } catch (error) {
    setStatus('fundStatus', 'err', error instanceof Error ? error.message : String(error));
  }
});

const showDestError = (message: string | null): boolean => {
  const el = $('destError');
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return true;
  }
  el.className = 'status err';
  el.textContent = message;
  el.classList.remove('hidden');
  return false;
};

input('dest').addEventListener('input', () => {
  const value = input('dest').value.trim();
  if (!value) {
    showDestError(null);
    return;
  }
  try {
    assertNetworkAddress(value, network);
    showDestError(null);
  } catch (error) {
    showDestError(error instanceof Error ? error.message : String(error));
  }
});

button('sendMax').addEventListener('click', () => {
  const max = vaultBalance > network.vaultSpendFeeSats ? vaultBalance - network.vaultSpendFeeSats : 0n;
  input('amount').value = formatBch(max).replace(' BCH', '');
});

const showSuccess = (txid: string, amount: bigint, dest: string): void => {
  $('successAmount').textContent = formatBch(amount);
  $('successTxid').textContent = txid;
  const spendUrl = explorerTxUrl(network, txid);
  const addrUrl = explorerAddressUrl(network, dest);
  $('resultLinks').innerHTML = `<a class="btn btn-ember" href="${spendUrl}" target="_blank" rel="noreferrer">Open this payment</a> <a class="btn btn-on-light" href="${addrUrl}" target="_blank" rel="noreferrer">Open the destination</a>`;
  showScreen('success');
};

const showError = (message: string): void => {
  $('errorText').textContent = message;
  showScreen('error');
};

button('errorBack').addEventListener('click', () => {
  showScreen(stored ? 'dashboard' : 'create');
});

button('spend').addEventListener('click', async () => {
  try {
    if (!stored) throw new Error('Create a box first.');
    await refreshBalance();
    if (!vaultUtxo) throw new Error('The box is empty. Receive coins first.');
    if (stored.rpId !== currentRpId()) throw new Error('This box was created on a different website address. Open the original site, or create a new box here.');
    const dest = input('dest').value.trim();
    try {
      assertNetworkAddress(dest, network);
      showDestError(null);
    } catch (error) {
      showDestError(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!network.allowBroadcast) {
      setStatus('spendStatus', 'info', 'Main network sending is off until it is approved.');
      return;
    }
    const parsed = parseBch(input('amount').value);
    if (parsed === null) {
      setStatus('spendStatus', 'err', 'Enter an amount in BCH, like 0.0001.');
      return;
    }
    const maxSend = vaultUtxo.satoshis - network.vaultSpendFeeSats;
    if (parsed > maxSend || parsed < DUST_SATS) {
      setStatus('spendStatus', 'err', `Enter an amount between ${DUST_SATS} units and ${formatBch(maxSend)}.`);
      return;
    }
    const agreed = await openReview('Review this send', [
      ['Network', network.label],
      ['From your box', stored.address],
      ['To', dest],
      ['Amount', formatBch(parsed)],
      ['Fee', `${network.vaultSpendFeeSats} units`],
    ]);
    if (!agreed) return;
    const { params, vault } = vaultFromStored(stored);
    const unsigned = buildUnsignedVaultSpend(network, vaultUtxo, addressToLocking(dest), {
      amountSats: parsed,
      changeLocking: vault.lockingBytecode,
    });
    setStatus('spendStatus', 'info', 'Waiting for your face or fingerprint…');
    const assertion = await requestAssertion(stored, challengeForSpend(unsigned));
    const signed = attachPasskeyUnlock(vault, params, unsigned, vaultUtxo, assertion);
    const txid = await broadcastTransaction(network, signed.hex);
    recordActivity({ kind: 'spend', txid, at: new Date().toISOString(), satoshis: String(parsed), network: network.id, vaultAddress: stored.address });
    void refreshBalance();
    void refreshActivity();
    showSuccess(txid, parsed, dest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('spendStatus', 'err', message);
    showError(message);
  }
});

$('demoFilmPlay').addEventListener('click', () => {
  const host = $('demoFilmPlay');
  const video = document.createElement('video');
  video.src = '/cubby-demo.mp4';
  video.controls = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.poster = '/mascot/cubby-hero-1280.jpg';
  host.replaceWith(video);
  void video.play();
});

$('openApp').addEventListener('click', (event) => {
  event.preventDefault();
  location.hash = '#app';
});

const route = async (): Promise<void> => {
  const hash = (location.hash.replace('#', '') || '').split('?')[0];
  if (hash === 'demoFilm') {
    showLanding();
    $('demoFilm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (hash === '' || hash === 'landing' || hash === 'stage') {
    showLanding();
    return;
  }
  if (!stored && hash !== 'app' && hash !== 'create') {
    showScreen('create');
    return;
  }
  if (hash === 'app' || hash === 'home' || hash === 'dashboard') {
    if (!stored) showScreen('create');
    else if (!unlocked) showScreen('unlock');
    else showScreen('dashboard');
    if (stored) {
      void drawAddressQr();
      void refreshBalance();
      startBalancePoll();
    }
    return;
  }
  if (hash === 'create') {
    showScreen('create');
    return;
  }
  if (hash === 'unlock') {
    showScreen(stored ? 'unlock' : 'create');
    return;
  }
  if (!stored) {
    showScreen('create');
    return;
  }
  if (hash === 'receive') {
    showScreen('receive');
    void drawAddressQr();
    void refreshBalance();
    startBalancePoll();
    return;
  }
  if (hash === 'send') {
    showScreen('send');
    void refreshBalance();
    return;
  }
  if (hash === 'activity') {
    showScreen('activity');
    void refreshActivity();
    return;
  }
  if (hash === 'details') {
    showScreen('details');
    paintVault();
    return;
  }
  if (hash === 'success') {
    showScreen('success');
    return;
  }
  if (hash === 'error') {
    showScreen('error');
    return;
  }
  showScreen('dashboard');
};

window.addEventListener('hashchange', () => void route());

const bootShot = (): void => {
  const screen = (params.get('screen') ?? '') as ScreenName | 'review' | '';
  if (stored) paintVault();
  if (screen === 'review') {
    showScreen('send');
    const modal = $('reviewModal') as HTMLDialogElement;
    $('reviewTitle').textContent = 'Review this send';
    $('reviewBody').innerHTML = '<dt>Network</dt><dd>test network</dd><dt>To</dt><dd>Preview only</dd><dt>Amount</dt><dd>0.0001 BCH</dd><dt>Fee</dt><dd>11000 units</dd>';
    modal.showModal();
    return;
  }
  if (screen === 'create' || (!stored && (screen === '' || screen === 'dashboard'))) {
    // create shot can be shown even with a stored vault in the tester by forcing the screen
  }
  if (screen && APP_SCREENS.includes(screen)) {
    if (screen === 'create') showScreen('create');
    else if (!stored && screen !== 'error') showScreen('create');
    else showScreen(screen);
    if (screen === 'success') {
      if (!$('successTxid').textContent) {
        $('successAmount').textContent = '0.0001 BCH';
        $('successTxid').textContent = 'Preview only';
      }
      if (!$('resultLinks').innerHTML.trim()) {
        $('resultLinks').innerHTML = '<p class="hint">Preview only. A real payment id and explorer link appear after a send.</p>';
      }
    }
    if (screen === 'error' && !$('errorText').textContent) {
      $('errorText').textContent = 'The phone lock was cancelled, or it timed out. Try again.';
    }
    if (screen === 'receive') void drawAddressQr();
    if (screen === 'activity') void refreshActivity();
    return;
  }
  void route();
};

paintVault();
if (shot) bootShot();
else void route();
