/** Shared security headers for the live site. Imported by next.config.mjs and tests. */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // libauth compiles WebAssembly (secp256k1, sha256, ripemd160). 'wasm-unsafe-eval' allows that and nothing else (no JS eval).
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://watchtower.cash https://chipnet.watchtower.cash https://bchexplorer.info https://chipnet.bchexplorer.info wss://relay.riften.net:443",
  "upgrade-insecure-requests",
].join('; ');

export const PERMISSIONS_POLICY = [
  'publickey-credentials-get=(self)',
  'publickey-credentials-create=(self)',
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
].join(', ');

export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];
