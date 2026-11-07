import { webcrypto } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseMasterKey(masterKeyBase64: string): Uint8Array {
  if (!masterKeyBase64 || typeof masterKeyBase64 !== 'string') {
    throw new Error('BYOK_MASTER_KEY is not set');
  }
  const buf = Buffer.from(masterKeyBase64, 'base64');
  if (buf.length !== 32) {
    throw new Error('BYOK_MASTER_KEY must be 32 bytes (base64)');
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function importAesKey(
  masterKeyBase64: string,
  usage: webcrypto.KeyUsage[]
): Promise<webcrypto.CryptoKey> {
  const rawBytes = parseMasterKey(masterKeyBase64);
  return webcrypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, usage);
}

/**
 * Encrypts an API key with AES-256-GCM.
 * Returns `iv (12 bytes) || ciphertext || authTag (16 bytes)`, byte-compatible with Deno `crypto.ts`.
 */
export async function encryptApiKey(
  plaintext: string,
  masterKeyBase64: string
): Promise<Uint8Array> {
  const key = await importAesKey(masterKeyBase64, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
}

/**
 * Decrypts an `iv (12 bytes) || ciphertext || authTag (16 bytes)` blob produced by `encryptApiKey`.
 */
export async function decryptApiKey(
  blob: Uint8Array,
  masterKeyBase64: string
): Promise<string> {
  if (blob.byteLength < IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted key blob is too short');
  }
  const key = await importAesKey(masterKeyBase64, ['decrypt']);
  const iv = blob.slice(0, IV_BYTES);
  const cipher = blob.slice(IV_BYTES);
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/** Last 4 chars only — safe to show in the UI. */
export function keyHint(plaintext: string): string {
  return `…${plaintext.slice(-4)}`;
}
