const IV_BYTES = 12;

function masterKeyBytes(): Uint8Array {
  const raw = Deno.env.get('BYOK_MASTER_KEY');
  if (!raw) throw new Error('BYOK_MASTER_KEY is not set');
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('BYOK_MASTER_KEY must be 32 bytes (base64)');
  return bytes;
}

async function importKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', masterKeyBytes(), { name: 'AES-GCM' }, false, usage);
}

/** Returns iv || ciphertext so the blob is self-contained. */
export async function encryptApiKey(plaintext: string): Promise<Uint8Array> {
  const key = await importKey(['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
}

export async function decryptApiKey(blob: Uint8Array): Promise<string> {
  const key = await importKey(['decrypt']);
  const iv = blob.slice(0, IV_BYTES);
  const cipher = blob.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/** Last 4 chars only — safe to show in the UI. */
export function keyHint(plaintext: string): string {
  return `…${plaintext.slice(-4)}`;
}
