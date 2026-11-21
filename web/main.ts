import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { EMBER_TOKEN_ADDRESS, REPO_URL, WIDGET_FACTORY_URL } from '../src/banner.js';
import { getNetwork, explorerTxUrl, explorerAddressUrl, type Network, type NetworkId } from '../src/network.js';
import { assertNetworkAddress, addressToLocking, p2pkhAddressFromPublicKey } from '../src/address.js';
import { addressesHaveHistory, broadcastTransaction, getTransaction, pusdBalanceFromWatchtower, utxosFromApi, utxosFromTransaction, utxosFromWatchtower, type ChainUtxo } from '../src/chain.js';
import { scanAddressBatches } from '../src/wallet-scan.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { createDeviceLock, loadVault, requestAssertion, vaultFromStored, currentRpId, type StoredVault } from './passkey.js';
import { copyConnectionLink, drawQr, requestWalletSend, startConnect, stopConnect, type WalletCoin, type WalletSession } from './wizard.js';
import { loadActivity, recordActivity, renderActivity } from './activity.js';
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

const formatSats = (sats: bigint): string => {
  const whole = sats / 100_000_000n;
  const frac = (sats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac} BCH (${sats} units)` : `${whole} BCH (${sats} units)`;
};

const formatPusd = (cents: bigint): string => `${(Number(cents) / 100).toFixed(2)} PUSD`;

let network: Network = getNetwork(new URLSearchParams(location.search).get('network'));
let wallet: WalletSession | undefined;
let stored: StoredVault | null = loadVault();
let vaultUtxo: ChainUtxo | undefined;

($('widgetLink') as HTMLAnchorElement).href = WIDGET_FACTORY_URL;
($('repoLink') as HTMLAnchorElement).href = REPO_URL;
$('emberAddress').textContent = EMBER_TOKEN_ADDRESS;

const select = $('network') as HTMLSelectElement;
select.value = network.id;
const useMainnet = $('useMainnet') as HTMLInputElement;
useMainnet.checked = network.id === 'mainnet';

const refreshActivity = (): void => {
  const items = stored ? loadActivity(stored.address, network.id) : [];
  renderActivity($('activityList'), items, network);
};

type DiscoveredAddress = { address: string; chain: 'receive' | 'change'; index: number };

let walletCoins: WalletCoin[] = [];

const deriveWalletAddress = (session: WalletSession, chain: 'receive' | 'change') => {
  const child = chain === 'receive' ? 0 : 1;
  return (index: number): DiscoveredAddress | undefined => {
    const pubkey = session.manager.getPubkey(child, BigInt(index));
    if (!pubkey) return undefined;
    return { address: p2pkhAddressFromPublicKey(pubkey, network), chain, index };
  };
};

const inspectWalletBatch = (batch: DiscoveredAddress[]): Promise<boolean[]> =>
  addressesHaveHistory(network, batch.map((item) => item.address));

const discoverWalletCoins = async (session: WalletSession): Promise<WalletCoin[]> => {
  const receive = await scanAddressBatches(deriveWalletAddress(session, 'receive'), inspectWalletBatch);
  const change = session.manager.hasPath(1)
    ? await scanAddressBatches(deriveWalletAddress(session, 'change'), inspectWalletBatch)
    : [];
  const used = [...receive, ...change];
  const coins: WalletCoin[] = [];
  for (const item of used) {
    const utxos =
      (await utxosFromApi(item.address, network)) ??
      (await utxosFromWatchtower(network, item.address).catch(() => [] as ChainUtxo[]));
    for (const utxo of utxos) coins.push({ ...utxo, inputPath: [0, item.chain, item.index] });
  }
  return coins;
};

const refreshBalances = async (): Promise<void> => {
  const box = $('walletBalance');
  if (!wallet) {
    walletCoins = [];
    box.textContent = 'No wallet connected';
    return;
  }
  box.textContent = 'Checking wallet balance…';
  try {
    walletCoins = await discoverWalletCoins(wallet);
    const satoshis = walletCoins.reduce((sum, u) => sum + u.satoshis, 0n);
    let pusdLabel = formatPusd(0n);
    if (network.id === 'mainnet') {
      const pusd = await pusdBalanceFromWatchtower(network, wallet.address);
      pusdLabel = pusd === null ? 'PUSD unknown' : formatPusd(pusd);
    }
    box.innerHTML = `<strong>${wallet.walletName}</strong><br>${formatSats(satoshis)}<br>${pusdLabel}`;
  } catch (error) {
    box.textContent = `Connected, but the balance could not be read. ${error instanceof Error ? error.message : ''}`;
  }
};

const readyStep = (): number => {
  const lockReady = Boolean(stored && stored.rpId === currentRpId());
  if (vaultUtxo && lockReady) return 4;
  if (lockReady) return 3;
  if (wallet) return 2;
  return 1;
};

const paintStepper = (open?: number): void => {
  const ready = readyStep();
  const openStep = open ?? ready;
  document.querySelectorAll('#tryStepper .step').forEach((el) => {
    const n = Number((el as HTMLElement).dataset.step);
    el.classList.toggle('is-open', n === openStep);
    el.classList.toggle('is-done', n < ready);
    el.classList.toggle('is-active', n === ready);
    el.classList.toggle('is-locked', n > ready);
  });
  document.querySelectorAll('#tryRail li').forEach((el) => {
    const n = Number((el as HTMLElement).dataset.n);
    el.classList.toggle('is-done', n < ready);
    el.classList.toggle('is-active', n === ready);
  });
};
const setWalletConnected = (session: WalletSession | undefined): void => {
  wallet = session;
  button('disconnect').classList.toggle('hidden', !session);
  button('reconnect').classList.add('hidden');
  button('fundWallet').disabled = !session || !stored || stored.rpId !== currentRpId() || !network.allowBroadcast;
  if (session) input('dest').value = session.address;
  void refreshBalances();
  paintStepper();
};

const markWalletDropped = (reason: string): void => {
  wallet = undefined;
  walletCoins = [];
  button('disconnect').classList.add('hidden');
  button('fundWallet').disabled = true;
  $('qrWrap').classList.add('hidden');
  setStatus('walletStatus', 'err', 'Wallet disconnected');
  $('walletBalance').textContent = 'Wallet disconnected';
  button('reconnect').classList.remove('hidden');
  paintStepper();
  void stopConnect();
  void reason;
};

const refreshNetworkCopy = (): void => {
  $('fundNeed').textContent = network.recommendedFundSats.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const help = $('networkHelp');
  if (network.id === 'mainnet') {
    help.textContent = 'Main network sending is off until Henry approves the funding address and the exact number of units. You can still create a lock and see the box address.';
  } else {
    help.textContent = 'The test network coins have no value. A send needs about 20 000 test units in the box so the fee fits. Addresses must start with bchtest.';
  }
  if (stored && stored.network === network.id && stored.rpId === currentRpId()) showVault(stored);
  refreshActivity();
  void refreshBalances();
  paintStepper();
};

const applyNetwork = (id: NetworkId): void => {
  network = getNetwork(id);
  select.value = network.id;
  useMainnet.checked = network.id === 'mainnet';
  const url = new URL(location.href);
  url.searchParams.set('network', network.id);
  history.replaceState({}, '', url);
  vaultUtxo = undefined;
  if (wallet) {
    setStatus('walletStatus', 'info', 'Network changed. Connect the wallet again so the address matches this network.');
    void stopConnect().then(() => setWalletConnected(undefined));
  }
  refreshNetworkCopy();
};
select.addEventListener('change', () => applyNetwork(select.value as NetworkId));
useMainnet.addEventListener('change', () => applyNetwork(useMainnet.checked ? 'mainnet' : 'chipnet'));

const showVault = (vault: StoredVault): void => {
  setStatus(
    'lockStatus',
    'ok',
    vault.rpId === currentRpId() ? 'Your phone lock is ready on this site.' : 'This lock was made on a different website address and will not work here. Create a new one.',
  );
  $('vaultAddress').textContent = vault.address;
  $('copyVault').classList.remove('hidden');
  paintStepper();
  void findVaultCoins(true);
};

const reviewHold = attachHold(button('reviewConfirm'), { hint: document.getElementById('reviewHint') });

const openReview = (title: string, rows: Array<[string, string]>): Promise<boolean> =>
  new Promise((resolve) => {
    const modal = $('reviewModal') as HTMLDialogElement;
    $('reviewTitle').textContent = title;
    const body = $('reviewBody');
    body.replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      body.append(dt, dd);
    }
    reviewHold.reset();
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const onClose = (): void => {
      modal.removeEventListener('close', onClose);
      reviewHold.reset();
      finish(modal.returnValue === 'confirm');
    };
    modal.addEventListener('close', onClose);
    modal.showModal();
    void reviewHold.wait().then((ok) => {
      if (!ok) return;
      modal.returnValue = 'confirm';
      if (modal.open) modal.close();
    });
  });

const beginConnect = async (): Promise<void> => {
  try {
    await startConnect(
      {
        onUri: async (uri, qrUri) => {
          $('qrWrap').classList.remove('hidden');
          $('wcUri').textContent = uri;
          await drawQr($('qr') as HTMLCanvasElement, uri, qrUri);
          const openLink = $('openUri') as HTMLAnchorElement;
          openLink.href = uri;
          openLink.hidden = false;
          const cashonize = $('openCashonize') as HTMLAnchorElement;
          cashonize.href = `https://cashonize.com/?uri=${encodeURIComponent(uri)}`;
          cashonize.hidden = false;
          setStatus(
            'walletStatus',
            'info',
            'In Paytaca, open Apps, then WizardConnect, then Scan. The usual Scan button does not connect. If it hangs, tap New code for a fresh code.',
          );
        },
        onStatus: (message) => setStatus('walletStatus', 'info', message),
        onReady: (session) => {
          $('qrWrap').classList.add('hidden');
          setWalletConnected(session);
          setStatus('walletStatus', 'ok', `Connected to ${session.walletName} with WizardConnect. Address: ${session.address}. The balance loads on its own.`);
          void findVaultCoins(true);
        },
        onDropped: (reason) => markWalletDropped(reason),
        onTimeout: () => {
          setStatus(
            'walletStatus',
            'err',
            'The wallet did not connect in time. Tap New code for a fresh code, then in Paytaca open Apps, then WizardConnect, then Scan.',
          );
        },
        onError: (message) => setStatus('walletStatus', 'err', message),
      },
      network,
    );
  } catch (error) {
    setStatus('walletStatus', 'err', error instanceof Error ? error.message : String(error));
  }
};
$('connect').addEventListener('click', () => void beginConnect());
$('newQr').addEventListener('click', () => {
  setStatus('walletStatus', 'info', 'Getting a fresh code…');
  void beginConnect();
});
$('reconnect').addEventListener('click', () => {
  button('reconnect').classList.add('hidden');
  setStatus('walletStatus', 'info', 'Getting a fresh code…');
  void beginConnect();
});

$('disconnect').addEventListener('click', async () => {
  await stopConnect();
  setWalletConnected(undefined);
  setStatus('walletStatus', 'info', 'Wallet disconnected.');
});

const copyLink = async (): Promise<void> => {
  try {
    await copyConnectionLink();
    setStatus('walletStatus', 'ok', 'Connection link copied.');
  } catch (error) {
    setStatus('walletStatus', 'err', error instanceof Error ? error.message : String(error));
  }
};
$('copyUri').addEventListener('click', () => void copyLink());
$('qrButton').addEventListener('click', () => void copyLink());

$('createLock').addEventListener('click', async () => {
  try {
    setStatus('lockStatus', 'info', 'Waiting for your device…');
    stored = await createDeviceLock(network);
    showVault(stored);
    button('fundWallet').disabled = !wallet || !network.allowBroadcast;
    refreshActivity();
  } catch (error) {
    setStatus('lockStatus', 'err', error instanceof Error ? error.message : String(error));
  }
});

$('copyVault').addEventListener('click', async () => {
  if (stored) await navigator.clipboard.writeText(stored.address);
});

const rememberUtxo = (utxo: ChainUtxo): void => {
  vaultUtxo = utxo;
  button('spend').disabled = !network.allowBroadcast;
  paintStepper();
  setStatus(
    'fundStatus',
    utxo.satoshis >= network.recommendedFundSats ? 'ok' : 'info',
    `Found ${utxo.satoshis} units in the box.${utxo.satoshis < network.vaultSpendFeeSats + 546n ? ' That is not enough for the send fee yet.' : ''}`,
  );
};

$('fundWallet').addEventListener('click', async () => {
  try {
    if (!wallet || !stored) throw new Error('Connect a wallet and create a phone lock first.');
    if (!network.allowBroadcast) throw new Error('Main network sending is off until Henry approves it.');
    const agreed = await openReview('Review wallet deposit', [
      ['Network', network.label],
      ['From your wallet', wallet.address],
      ['To your box', stored.address],
      ['Amount', `${network.recommendedFundSats} units`],
    ]);
    if (!agreed) return;
    setStatus('fundStatus', 'info', 'Asking your wallet to send coins to the box…');
    walletCoins = await discoverWalletCoins(wallet);
    if (walletCoins.length === 0) {
      throw new Error('Could not find coins in the connected wallet on this network. Send coins to the box address yourself and paste the payment id.');
    }
    const { vault } = vaultFromStored(stored);
    const sent = await requestWalletSend(wallet, walletCoins, vault.lockingBytecode, network.recommendedFundSats, network);
    input('fundTxid').value = sent.txid;
    recordActivity({
      kind: 'deposit',
      txid: sent.txid,
      at: new Date().toISOString(),
      satoshis: String(network.recommendedFundSats),
      network: network.id,
      vaultAddress: stored.address,
    });
    refreshActivity();
    void refreshBalances();
    setStatus('fundStatus', 'info', `Wallet payment ${sent.txid}. Looking it up…`);
    const found = await utxosFromTransaction(network, sent.txid, stored.address);
    const first = found[0];
    if (!first) throw new Error('The payment was made, but the box output is not visible yet. Wait a moment and press Find the coins.');
    rememberUtxo(first);
  } catch (error) {
    setStatus('fundStatus', 'err', error instanceof Error ? error.message : String(error));
  }
});

const findVaultCoins = async (quiet = false): Promise<boolean> => {
  if (!stored) {
    if (!quiet) throw new Error('Create a phone lock first so we know the box address.');
    return false;
  }
  const fromApi = await utxosFromApi(stored.address, network);
  const txid = input('fundTxid').value.trim();
  const fromTx = txid ? await utxosFromTransaction(network, txid, stored.address) : [];
  const all = [...(fromApi ?? []), ...fromTx];
  const unique = new Map(all.map((u) => [`${u.txid}:${u.vout}`, u]));
  const best = [...unique.values()].sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
  if (!best) {
    if (!quiet) throw new Error('No coins found yet. Send to the box address, then paste the payment id.');
    return false;
  }
  rememberUtxo(best);
  return true;
};

$('checkFund').addEventListener('click', async () => {
  try {
    await findVaultCoins(false);
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

$('spend').addEventListener('click', async () => {
  try {
    if (!stored || !vaultUtxo) throw new Error('Create a lock and put coins in the box first.');
    if (stored.rpId !== currentRpId()) throw new Error('This lock belongs to a different website address.');
    const dest = input('dest').value.trim();
    try {
      assertNetworkAddress(dest, network);
      showDestError(null);
    } catch (error) {
      showDestError(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!network.allowBroadcast) {
      setStatus(
        'spendStatus',
        'info',
        `Main network send is paused. Box address: ${stored.address}. Needed: ${network.recommendedFundSats} satoshis (0.0002 BCH) so a ${network.vaultSpendFeeSats} satoshi fee fits.`,
      );
      return;
    }
    const sendAmount = vaultUtxo.satoshis - network.vaultSpendFeeSats;
    const agreed = await openReview('Review passkey spend', [
      ['Network', network.label],
      ['From your box', stored.address],
      ['To', dest],
      ['Amount', `${sendAmount} units`],
      ['Fee', `${network.vaultSpendFeeSats} units`],
    ]);
    if (!agreed) return;
    const { params, vault } = vaultFromStored(stored);
    const unsigned = buildUnsignedVaultSpend(network, vaultUtxo, addressToLocking(dest));
    setStatus('spendStatus', 'info', 'Waiting for your face or fingerprint…');
    const assertion = await requestAssertion(stored, challengeForSpend(unsigned));
    const signed = attachPasskeyUnlock(vault, params, unsigned, vaultUtxo, assertion);
    const txid = await broadcastTransaction(network, signed.hex);
    recordActivity({
      kind: 'spend',
      txid,
      at: new Date().toISOString(),
      satoshis: String(sendAmount),
      network: network.id,
      vaultAddress: stored.address,
    });
    refreshActivity();
    const spendUrl = explorerTxUrl(network, txid);
    const addrUrl = explorerAddressUrl(network, dest);
    setStatus('spendStatus', 'ok', `Sent. The chain accepted the phone lock. Payment id: ${txid}`);
    $('resultLinks').innerHTML = `<a href="${spendUrl}" target="_blank" rel="noreferrer">Open this payment on the explorer</a> · <a href="${addrUrl}" target="_blank" rel="noreferrer">Open the destination address</a>`;
    button('spend').disabled = true;
  } catch (error) {
    setStatus('spendStatus', 'err', error instanceof Error ? error.message : String(error));
  }
});

const shortTxid = (txid: string): string => (txid.length <= 16 ? txid : `${txid.slice(0, 8)}…${txid.slice(-6)}`);
const shortAddress = (address: string): string => {
  const [prefix, body] = address.includes(':') ? (address.split(':') as [string, string]) : (['', address] as const);
  if (body.length <= 10) return address;
  return `${prefix}:${body.slice(0, 4)}…${body.slice(-4)}`;
};

const fillProofTicket = async (kind: 'spend' | 'fund', txid: string, url: string): Promise<void> => {
  const link = $(kind === 'spend' ? 'proofSpend' : 'proofFund') as HTMLAnchorElement;
  link.href = url;
  const short = $(kind === 'spend' ? 'proofSpendShort' : 'proofFundShort');
  short.textContent = shortTxid(txid);
  const conf = $(kind === 'spend' ? 'proofSpendConf' : 'proofFundConf');
  try {
    const tx = await getTransaction(getNetwork('chipnet'), txid);
    const count = tx.confirmations;
    if (typeof count === 'number' && count >= 0) {
      conf.textContent = count === 1 ? '1 confirmation on the test network' : `${count} confirmations on the test network`;
      return;
    }
  } catch {
    /* Keep the static confirmed line. */
  }
  conf.textContent = 'Confirmed on the test network';
};

const loadDemoProof = async (): Promise<void> => {
  try {
    const response = await fetch('/demo-proof.json', { cache: 'no-store' });
    if (!response.ok) return;
    const proof = (await response.json()) as {
      spend?: string;
      spendTxid?: string;
      fund?: string;
      fundTxid?: string;
      vaultAddress?: string;
      explorer?: { spend?: string; fund?: string };
    };
    const spend = proof.spendTxid ?? proof.spend;
    const fund = proof.fundTxid ?? proof.fund;
    const chipnet = getNetwork('chipnet');
    if (spend) {
      await fillProofTicket('spend', spend, proof.explorer?.spend ?? explorerTxUrl(chipnet, spend));
    }
    if (fund) {
      await fillProofTicket('fund', fund, proof.explorer?.fund ?? explorerTxUrl(chipnet, fund));
    }
    const vault = proof.vaultAddress;
    if (vault) {
      const el = $('proofVault');
      el.setAttribute('data-full', vault);
      el.setAttribute('title', vault);
      el.textContent = shortAddress(vault);
    }
  } catch {
    /* The static markup in the page already has the completed test network links. */
  }
};



document.querySelectorAll('#tryStepper .step-head').forEach((btn) => {
  btn.addEventListener('click', () => {
    const n = Number((btn as HTMLElement).dataset.open);
    if (!Number.isFinite(n) || n > readyStep()) return;
    paintStepper(n);
  });
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

$('copyProofVault').addEventListener('click', async () => {
  const el = $('proofVault');
  const full = el.getAttribute('data-full') ?? el.getAttribute('title') ?? el.textContent ?? '';
  if (full) await navigator.clipboard.writeText(full);
});

const revealSections = (): void => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shot = new URLSearchParams(location.search).has('shot') || new URLSearchParams(location.search).has('state');
  document.querySelectorAll('.reveal').forEach((el) => {
    if (reduced || shot) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
  });
};

if (stored && stored.rpId === currentRpId()) showVault(stored);
refreshNetworkCopy();
paintStepper();
revealSections();
void loadDemoProof();
