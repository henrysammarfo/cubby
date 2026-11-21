/**
 * Chipnet demo of Cubby ID (Paytaca Decentralized Identity bounty). Resumable; public data lands in docs/proofs/identity-chipnet.json.
 *  1 anchor    the owner's Cubby vault spends to itself with OP_RETURN "CUBBYID" <nostr key> <statement hash>
 *              (the covenant checks the passkey signed that output, on chain)
 *  2 publish   a NIP-39 kind 10011 event is signed with the Nostr key and sent to a relay
 *              (a local relay by default; public relays only with --publish <url>, which the owner must choose)
 *  3 discover  a separate "app" finds the identity by vault address (#i filter), verifies both proofs and re-runs the anchor
 *  4 login     the app sends a challenge; the user answers with a NIP-42 style event and a passkey assertion
 *  5 pay       a payer resolves the npub to the verified vault address and sends test coins to it
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { binToHex, hexToBin, sha256, utf8ToBin } from '@bitauth/libauth';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { addressToLocking, lockingToAddress } from '../../src/address.js';
import { buildVault, type VaultParams } from '../../src/covenant.js';
import { keyedPasskey } from '../../src/bounties/keyed-passkey.js';
import { intentHash } from '../../src/intent.js';
import { unlockFromAssertion } from '../../src/unlock.js';
import { getTransaction } from '../../src/chain.js';
import {
  anchorOutput,
  claimFor,
  filterByVault,
  loginPasskeyChallenge,
  newLoginChallenge,
  passkeyProofFrom,
  pickVerified,
  signIdentityEvent,
  signLogin,
  statementHash,
  verifyAnchor,
  verifyLogin,
} from '../../src/bounties/identity.js';
import { broadcast, loadDemoPasskeyKey, loadE2eKeys, loadProof, network, saveProof, signP2pkh, utxoAt, waitConfirmed, waitSeen } from './lib.js';
import { startMiniRelay } from './mini-relay.js';

const RP_ID = 'bounties.cubby.test'; // same demo vault as the allowance run
const ROOT = new URL('../../', import.meta.url).pathname;
const FEE = 11_000n;

const loadNostrKey = async (): Promise<Uint8Array> => {
  const path = `${ROOT}.secrets/bounty-nostr.json`;
  if (!existsSync(path)) {
    await mkdir(`${ROOT}.secrets`, { recursive: true });
    await writeFile(path, JSON.stringify({ nsecHex: binToHex(generateSecretKey()) }) + '\n', { mode: 0o600 });
  }
  return hexToBin((JSON.parse(await readFile(path, 'utf8')) as { nsecHex: string }).nsecHex);
};

const rawTx = async (txid: string): Promise<string> => {
  for (let i = 0; i < 30; i++) {
    try {
      const hex = ((await getTransaction(network, txid)) as unknown as { hex?: string }).hex;
      if (hex) return hex;
    } catch {
      /* not indexed yet */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`No raw transaction for ${txid}`);
};

interface Proof {
  network: string;
  npub?: string;
  vaultAddress?: string;
  anchor?: string;
  anchorUnlockingBytes?: number;
  event?: unknown;
  relay?: string;
  discovered?: { vaultAddress: string; anchor: string };
  login?: { factors: string[] };
  pay?: string;
}

const main = async () => {
  const publishUrl = process.argv.includes('--publish') ? process.argv[process.argv.indexOf('--publish') + 1] : undefined;
  const { keyA, addrA } = await loadE2eKeys();
  const passkey = keyedPasskey(await loadDemoPasskeyKey('allowance-owner'), RP_ID);
  const vaultParams: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP_ID)) };
  const vault = buildVault(vaultParams);
  const vaultAddress = lockingToAddress(vault.lockingBytecode, network);
  const nsec = await loadNostrKey();
  const claim = claimFor('chipnet', passkey.publicKey, RP_ID, getPublicKey(nsec));
  const proof = await loadProof<Proof>('identity-chipnet.json', { network: 'chipnet' });
  const allowance = await loadProof<{ manage?: string }>('allowance-chipnet.json', {});

  // 1 anchor
  if (!proof.anchor) {
    const vaultUtxo = await utxoAt(allowance.manage!, 1, vaultAddress);
    const unsigned = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin(vaultUtxo.txid), outpointIndex: vaultUtxo.vout, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [anchorOutput(claim), { lockingBytecode: vault.lockingBytecode, valueSatoshis: vaultUtxo.satoshis - FEE }],
    };
    const unlocking = unlockFromAssertion(vault, vaultParams, unsigned, 0, passkey.assert(intentHash(unsigned, 0)));
    const { encodeTransactionBch } = await import('@bitauth/libauth');
    const hex = binToHex(encodeTransactionBch({ ...unsigned, inputs: [{ ...unsigned.inputs[0]!, unlockingBytecode: unlocking }] }));
    proof.anchorUnlockingBytes = unlocking.length;
    proof.anchor = await broadcast('anchor (passkey-approved OP_RETURN)', hex);
    await saveProof('identity-chipnet.json', proof);
    await waitSeen(proof.anchor);
  }

  // 2 publish
  const event = signIdentityEvent({ claim, passkeyProof: passkeyProofFrom(passkey.assert(statementHash(claim))), anchorTxid: proof.anchor }, nsec);
  const local = publishUrl ? undefined : await startMiniRelay(7447);
  const relayUrl = publishUrl ?? local!.url;
  const writer = await Relay.connect(relayUrl);
  await writer.publish(event);
  writer.close();
  Object.assign(proof, { npub: undefined, vaultAddress, event, relay: publishUrl ? relayUrl : 'local mini relay (ws://127.0.0.1:7447)' });

  // 3 discover (a separate app, new connection, by vault address)
  const reader = await Relay.connect(relayUrl);
  const found: typeof event[] = [];
  await new Promise<void>((resolve) => {
    const sub = reader.subscribe([filterByVault('chipnet', vaultAddress)], { onevent: (e) => found.push(e as typeof event), oneose: () => { sub.close(); resolve(); } });
  });
  reader.close();
  const id = pickVerified(found);
  if (!id) throw new Error('Discovery found no verified identity.');
  await waitConfirmed(proof.anchor!, 1, 90);
  const anchorHex = await rawTx(proof.anchor!);
  const { decodeTransactionBch } = await import('@bitauth/libauth');
  const decoded = decodeTransactionBch(hexToBin(anchorHex));
  if (typeof decoded === 'string') throw new Error(decoded);
  const parents = new Map<string, string>();
  for (const input of decoded.inputs) {
    const ptxid = binToHex(input.outpointTransactionHash);
    parents.set(ptxid, await rawTx(ptxid));
  }
  const anchored = verifyAnchor(id, anchorHex, (txid) => parents.get(txid)!);
  proof.npub = id.npub;
  proof.discovered = { vaultAddress: anchored.vaultAddress, anchor: anchored.anchor };
  console.log('discovered', proof.discovered, id.npub);

  // 4 login
  const challenge = newLoginChallenge('https://shop.example');
  const response = signLogin(challenge, nsec, passkeyProofFrom(passkey.assert(loginPasskeyChallenge(challenge, id.nostrPubkey))));
  proof.login = { factors: verifyLogin(challenge, response, anchored).factors };
  console.log('login', proof.login);

  // 5 pay by identity
  if (!proof.pay) {
    const fund = await loadProof<{ fund?: string }>('allowance-chipnet.json', {});
    const payer = await utxoAt(fund.fund!, 2, addrA);
    const signed = signP2pkh(keyA, [payer], [
      { lockingBytecode: addressToLocking(anchored.vaultAddress), valueSatoshis: 5_000n },
      { lockingBytecode: addressToLocking(addrA), valueSatoshis: payer.satoshis - 5_000n - 300n },
    ]);
    proof.pay = await broadcast(`pay ${id.npub.slice(0, 16)}… by identity`, signed.hex);
  }
  await saveProof('identity-chipnet.json', proof);
  await local?.close();
  console.log(JSON.stringify({ ...proof, event: '(saved)' }, null, 2));
  process.exit(0);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
