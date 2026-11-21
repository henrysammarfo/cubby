import { createRequire } from 'node:module';
import { sha256, utf8ToBin } from '@bitauth/libauth';

// The webpack ProvidePlugin injects this package, not Node's built-in Buffer.
// Node's `buffer` specifier supports base64url; this stand-in does not.
const { Buffer: BrowserBuffer } = createRequire(import.meta.url)('../node_modules/buffer/index.js') as {
  Buffer: typeof Buffer;
};
import { describe, expect, it } from 'vitest';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import {
  assertAuthenticatorFlags,
  base64url,
  fromBase64url,
  splitClientData,
} from '../src/webauthn.js';

const STORE = 'cubby-vault-v1';

const bytes = (...n: number[]) => Uint8Array.from(n);
const utf8 = (s: string) => utf8ToBin(s);

/** RFC 4648 section 5 (base64url, no padding). */
const RFC_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['f', 'Zg'],
  ['fo', 'Zm8'],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg'],
  ['fooba', 'Zm9vYmE'],
  ['foobar', 'Zm9vYmFy'],
];

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

describe('base64url helpers', () => {
  it('matches RFC 4648 section 5 vectors and round-trips them', () => {
    for (const [plain, encoded] of RFC_VECTORS) {
      const data = utf8(plain);
      expect(base64url(data)).toBe(encoded);
      expect(fromBase64url(encoded)).toEqual(data);
    }
  });

  it('round-trips arbitrary lengths, including 32-byte WebAuthn challenges', () => {
    for (let n = 0; n <= 64; n++) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 17 + n) & 255);
      const encoded = base64url(data);
      expect(encoded.includes('+')).toBe(false);
      expect(encoded.includes('/')).toBe(false);
      expect(encoded.includes('=')).toBe(false);
      expect(fromBase64url(encoded)).toEqual(data);
    }
    const challenge = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const encoded = base64url(challenge);
    expect(encoded.length).toBe(43);
    expect(fromBase64url(encoded)).toEqual(challenge);
  });

  it('uses - and _ in place of + and /', () => {
    const data = bytes(0xfb, 0xff);
    expect(base64url(data)).toBe('-_8');
    expect(fromBase64url('-_8')).toEqual(data);
  });

  it('decodes unpadded and padded input to the same bytes', () => {
    expect(fromBase64url('Zg')).toEqual(utf8('f'));
    expect(fromBase64url('Zg==')).toEqual(utf8('f'));
    expect(fromBase64url('Zm8')).toEqual(utf8('fo'));
    expect(fromBase64url('Zm8=')).toEqual(utf8('fo'));
    expect(fromBase64url('Zm9vYg')).toEqual(utf8('foob'));
    expect(fromBase64url('Zm9vYg==')).toEqual(utf8('foob'));
  });

  it('rejects invalid length and alphabet', () => {
    expect(() => fromBase64url('A')).toThrow(/Invalid base64url/);
    expect(() => fromBase64url('!!!!')).toThrow(/Invalid base64url/);
    expect(() => fromBase64url('+/8=')).toThrow(/Invalid base64url/);
  });

  it('agrees with Node Buffer base64url when it is available', () => {
    const data = Uint8Array.from({ length: 40 }, (_, i) => (i * 13) & 255);
    expect(base64url(data)).toBe(Buffer.from(data).toString('base64url'));
    const padded = Buffer.from(data).toString('base64url');
    expect(fromBase64url(padded)).toEqual(data);
  });

  it('still works when Buffer is the browser stand-in that lacks base64url', () => {
    expect(() => BrowserBuffer.from([1, 2, 3]).toString('base64url')).toThrow(/Unknown encoding: base64url/);
    expect(() => BrowserBuffer.from('Zg', 'base64url')).toThrow(/Unknown encoding: base64url/);

    const real = globalThis.Buffer;
    globalThis.Buffer = BrowserBuffer as unknown as typeof Buffer;
    try {
      expect(() => Buffer.from([1]).toString('base64url')).toThrow(/Unknown encoding: base64url/);
      const data = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
      expect(fromBase64url(base64url(data))).toEqual(data);
    } finally {
      globalThis.Buffer = real;
    }
  });

  it('encodes and decodes when globalThis.Buffer is undefined', () => {
    const real = globalThis.Buffer;
    const data = utf8('hello passkey');
    const hidden = data.slice();
    // @ts-expect-error -- test the helpers with no Buffer in the environment
    delete globalThis.Buffer;
    try {
      const encoded = base64url(hidden);
      expect(fromBase64url(encoded)).toEqual(hidden);
      expect(fromBase64url('Zm9vYg==')).toEqual(utf8('foob'));
    } finally {
      globalThis.Buffer = real;
    }
  });
});

describe('unlock after a saved box is reopened', () => {
  it('loads a stored credential id and unlocks with the software authenticator under the browser Buffer stand-in', async () => {
    const realBuffer = globalThis.Buffer;
    const realStorage = globalThis.localStorage;
    const storage = memoryStorage();
    globalThis.Buffer = BrowserBuffer as unknown as typeof Buffer;
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    try {
      const rpId = 'cubby-liart-six.vercel.app';
      const passkey = await createSoftPasskey(rpId);
      const credentialId = Uint8Array.from({ length: 16 }, (_, i) => i + 9);
      const stored = {
        credentialId: base64url(credentialId),
        publicKeyX: passkey.publicKey.x.toString(16).padStart(64, '0'),
        publicKeyY: passkey.publicKey.y.toString(16).padStart(64, '0'),
        rpId,
        address: 'bitcoincash:qpplaceholder',
        network: 'chipnet',
      };
      localStorage.setItem(STORE, JSON.stringify(stored));

      // Reload: a fresh read of what the app saved before Safari closed.
      const raw = localStorage.getItem(STORE);
      expect(raw).toBeTruthy();
      const loaded = JSON.parse(raw ?? '') as { credentialId: string; rpId: string };
      expect(() => Buffer.from(loaded.credentialId, 'base64url')).toThrow(/Unknown encoding: base64url/);
      const decoded = fromBase64url(loaded.credentialId);
      expect(decoded).toEqual(credentialId);

      const challenge = Uint8Array.from({ length: 32 }, (_, i) => (i * 3 + 1) & 255);
      const assertion = await passkey.assert(challenge);
      expect(() => splitClientData(assertion.clientDataJSON, challenge)).not.toThrow();
      expect(() => assertAuthenticatorFlags(assertion.authenticatorData, sha256.hash(utf8ToBin(rpId)))).not.toThrow();
    } finally {
      globalThis.Buffer = realBuffer;
      if (realStorage === undefined) {
        // @ts-expect-error -- restore a Node process that had no localStorage
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(globalThis, 'localStorage', { value: realStorage, configurable: true });
      }
    }
  });
});
