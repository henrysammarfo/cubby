import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { EMBER_TOKEN_ADDRESS, REPO_URL, WIDGET_FACTORY_URL } from '../src/banner.js';
import { getNetwork, explorerTxUrl, explorerAddressUrl, type Network, type NetworkId } from '../src/network.js';
import { assertNetworkAddress, addressToLocking } from '../src/address.js';
import { broadcastTransaction, getWalletBalances, utxosFromApi, utxosFromTransaction, type ChainUtxo } from '../src/chain.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { createDeviceLock, loadVault, requestAssertion, vaultFromStored, currentRpId, type StoredVault } from './passkey.js';
import { copyConnectionLink, drawQr, requestWalletSend, startConnect, stopConnect, type WalletSession } from './wizard.js';
import { loadActivity, recordActivity, renderActivity } from './activity.js';

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

const refreshActivity = (): void => {
  const items = stored ? loadActivity(stored.address, network.id) : [];
  renderActivity($('activityList'), items, network);
};

const refreshBalances = async (): Promise<void> => {
  const box = $('walletBalance');
  if (!wallet) {
    box.textContent = 'No wallet connected';
    return;
  }
  box.textContent = 'Checking wallet balance…';
  try {
    const balances = await getWalletBalances(network, wallet.address);
    const pusd = balances.pusdCents === null ? 'PUSD unknown' : formatPusd(balances.pusdCents);
    box.innerHTML = `<strong>${wallet.walletName}</strong><br>${formatSats(balances.satoshis)}<br>${pusd}`;
  } catch (error) {
    box.textContent = `Connected, but the balance could not be read. ${error instanceof Error ? error.message : ''}`;
  }
};

const setWalletConnected = (session: WalletSession | undefined): void => {
  wallet = session;
  button('disconnect').classList.toggle('hidden', !session);
  button('fundWallet').disabled = !session || !stored || stored.rpId !== currentRpId() || !network.allowBroadcast;
  if (session) input('dest').value = session.address;
  void refreshBalances();
};

const markWalletDropped = (reason: string): void => {
  wallet = undefined;
  button('disconnect').classList.add('hidden');
  button('fundWallet').disabled = true;
  $('qrWrap').classList.add('hidden');
  setStatus('walletStatus', 'err', reason);
  $('walletBalance').textContent = 'Wallet disconnected';
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
};

select.addEventListener('change', () => {
  network = getNetwork(select.value as NetworkId);
  const url = new URL(location.href);
  url.searchParams.set('network', network.id);
  history.replaceState({}, '', url);
  vaultUtxo = undefined;
  if (wallet) {
    setStatus('walletStatus', 'info', 'Network changed. Connect the wallet again so the address matches this network.');
    void stopConnect().then(() => setWalletConnected(undefined));
  }
  refreshNetworkCopy();
});

const showVault = (vault: StoredVault): void => {
  setStatus(
    'lockStatus',
    'ok',
    vault.rpId === currentRpId() ? 'Your phone lock is ready on this site.' : 'This lock was made on a different website address and will not work here. Create a new one.',
  );
  $('vaultAddress').textContent = vault.address;
  $('copyVault').classList.remove('hidden');
};

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
    const onClose = (): void => {
      modal.removeEventListener('close', onClose);
      resolve(modal.returnValue === 'confirm');
    };
    modal.addEventListener('close', onClose);
    modal.showModal();
  });

$('copyEmber').addEventListener('click', async () => {
  await navigator.clipboard.writeText(EMBER_TOKEN_ADDRESS);
});

$('connect').addEventListener('click', async () => {
  try {
    await startConnect(
      {
        onUri: async (uri) => {
          $('qrWrap').classList.remove('hidden');
          $('wcUri').textContent = uri;
          await drawQr($('qr') as HTMLCanvasElement, uri);
          setStatus('walletStatus', 'info', 'Scan the WizardConnect code in your wallet, or copy the connection link.');
        },
        onStatus: (message) => setStatus('walletStatus', 'info', message),
        onReady: (session) => {
          $('qrWrap').classList.add('hidden');
          setWalletConnected(session);
          setStatus('walletStatus', 'ok', `Connected to ${session.walletName} with WizardConnect. Address: ${session.address}`);
        },
        onDropped: (reason) => markWalletDropped(reason),
        onTimeout: () => {
          $('qrWrap').classList.add('hidden');
          setStatus('walletStatus', 'err', 'The wallet did not connect in time. Check that the wallet is open and supports WizardConnect, then try again.');
        },
        onError: (message) => setStatus('walletStatus', 'err', message),
      },
      network,
    );
  } catch (error) {
    setStatus('walletStatus', 'err', error instanceof Error ? error.message : String(error));
  }
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
    const walletUtxos = await utxosFromApi(wallet.address, network);
    if (!walletUtxos || walletUtxos.length === 0) {
      throw new Error('Could not find coins in the connected wallet on this network. Send coins to the box address yourself and paste the payment id.');
    }
    const { vault } = vaultFromStored(stored);
    const sent = await requestWalletSend(wallet, walletUtxos, vault.lockingBytecode, network.recommendedFundSats, network);
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

$('checkFund').addEventListener('click', async () => {
  try {
    if (!stored) throw new Error('Create a phone lock first so we know the box address.');
    const fromApi = await utxosFromApi(stored.address, network);
    const txid = input('fundTxid').value.trim();
    const fromTx = txid ? await utxosFromTransaction(network, txid, stored.address) : [];
    const all = [...(fromApi ?? []), ...fromTx];
    const unique = new Map(all.map((u) => [`${u.txid}:${u.vout}`, u]));
    const best = [...unique.values()].sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
    if (!best) throw new Error('No coins found yet. Send to the box address, then paste the payment id.');
    rememberUtxo(best);
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

const loadDemoProof = async (): Promise<void> => {
  const host = $('demoProof');
  try {
    const response = await fetch('/demo-proof.json', { cache: 'no-store' });
    if (!response.ok) return;
    const proof = (await response.json()) as { spend?: string; fund?: string; vaultAddress?: string };
    if (!proof.spend) return;
    host.innerHTML = `<p>A real test network spend is already on the chain. <a href="${explorerTxUrl(getNetwork('chipnet'), proof.spend)}" target="_blank" rel="noreferrer">Open the completed spend</a>${proof.fund ? ` · <a href="${explorerTxUrl(getNetwork('chipnet'), proof.fund)}" target="_blank" rel="noreferrer">Open the deposit</a>` : ''}.</p>`;
  } catch {
    /* optional */
  }
};

if (stored && stored.rpId === currentRpId()) showVault(stored);
refreshNetworkCopy();
void loadDemoProof();
