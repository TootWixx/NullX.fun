// Client-side AES-GCM encryption using Web Crypto API

const ALGORITHM = 'AES-GCM';

/** False on non-secure pages (e.g. http://192.168.x.x) where `crypto.subtle` is undefined. */
export function isVaultCryptoAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new Error(
      'Web Crypto is not available on this page. Open the app at http://localhost:PORT (on this PC) or use HTTPS. ' +
        'LAN URLs like http://192.168.x.x block vault encryption in the browser.',
    );
  }
  return s;
}
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const VERIFY_PHRASE = 'NOVA_VERIFY_OK';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function generateRandomKey(length = 32): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

export function generateRecoveryKey(): string {
  const raw = generateRandomKey(20);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

async function deriveKey(recoveryKey: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await subtle().importKey(
    'raw',
    encoder.encode(recoveryKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createVerificationBlob(recoveryKey: string): Promise<{ verificationBlob: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(recoveryKey, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await subtle().encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(VERIFY_PHRASE)
  );
  const blob = JSON.stringify({
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(encrypted),
  });
  return { verificationBlob: blob, salt: arrayBufferToBase64(salt.buffer) };
}

export async function verifyRecoveryKey(recoveryKey: string, verificationBlob: string, saltBase64: string): Promise<boolean> {
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
    const key = await deriveKey(recoveryKey, salt);
    const { iv, ciphertext } = JSON.parse(verificationBlob);
    const decrypted = await subtle().decrypt(
      { name: ALGORITHM, iv: new Uint8Array(base64ToArrayBuffer(iv)) },
      key,
      base64ToArrayBuffer(ciphertext)
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted) === VERIFY_PHRASE;
  } catch {
    return false;
  }
}

export async function encryptContent(content: string, recoveryKey: string, saltBase64: string): Promise<{ iv: string; ciphertext: string }> {
  const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
  const key = await deriveKey(recoveryKey, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await subtle().encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(content)
  );
  return {
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(encrypted),
  };
}

export async function decryptContent(iv: string, ciphertext: string, recoveryKey: string, saltBase64: string): Promise<string> {
  const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
  const key = await deriveKey(recoveryKey, salt);
  const decrypted = await subtle().decrypt(
    { name: ALGORITHM, iv: new Uint8Array(base64ToArrayBuffer(iv)) },
    key,
    base64ToArrayBuffer(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}
