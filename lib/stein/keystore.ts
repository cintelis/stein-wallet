// The wallet's key, kept in this browser.
//
// The 32-byte seed IS the private key. It is stored in localStorage only
// encrypted: AES-256-GCM under a key stretched from the user's passphrase with
// PBKDF2-SHA-256. The address is stored in the clear, so the wallet can show a
// balance while locked. Nothing is ever sent to a server.
//
// This protects the seed at rest on this device. It does not protect against
// malware in the browser or a weak passphrase: fine for a devnet, not for
// funds that matter.

const STORAGE_KEY = 'stein-wallet:vault:v1';
export const SCHEME = 'fn-dsa-512-draft';
const ITERATIONS = 600_000;
const SEED_LEN = 32;

export interface Vault {
  v: 1;
  scheme: typeof SCHEME;
  address: string;
  /** Whether the user has saved a backup of the seed. */
  backedUp: boolean;
  iterations: number;
  /** Hex. */
  salt: string;
  iv: string;
  ciphertext: string;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts `seed` for `address` under `passphrase`. */
export async function seal(
  seed: Uint8Array,
  address: string,
  passphrase: string,
  backedUp: boolean,
): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  // The address is authenticated with the seed: a vault edited to show
  // another address fails to open.
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(address) },
    key,
    new Uint8Array(seed),
  );
  return {
    v: 1,
    scheme: SCHEME,
    address,
    backedUp,
    iterations: ITERATIONS,
    salt: toHex(salt),
    iv: toHex(iv),
    ciphertext: toHex(new Uint8Array(ciphertext)),
  };
}

/** Decrypts the seed. Throws if the passphrase is wrong. */
export async function open(vault: Vault, passphrase: string): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, fromHex(vault.salt), vault.iterations);
  try {
    const seed = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromHex(vault.iv),
        additionalData: new TextEncoder().encode(vault.address),
      },
      key,
      fromHex(vault.ciphertext),
    );
    return new Uint8Array(seed);
  } catch {
    throw new Error('Wrong passphrase.');
  }
}

export function loadVault(): Vault | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const vault = JSON.parse(text) as Vault;
    return vault.v === 1 && vault.scheme === SCHEME && typeof vault.address === 'string'
      ? vault
      : null;
  } catch {
    return null;
  }
}

export function saveVault(vault: Vault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function deleteVault(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** A fresh seed from the browser's random source. */
export function newSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SEED_LEN));
}

/** The seed-file text the chain's command-line wallet reads and writes. */
export function seedFileText(seed: Uint8Array): string {
  return `${SCHEME}:${toHex(seed)}`;
}

/** Parses seed-file text. Throws with a message fit to show the user. */
export function parseSeedFile(text: string): Uint8Array {
  const trimmed = text.trim();
  const at = trimmed.indexOf(':');
  const scheme = at < 0 ? '' : trimmed.slice(0, at);
  const hex = at < 0 ? trimmed : trimmed.slice(at + 1);
  if (scheme.startsWith('ml-dsa')) {
    throw new Error(
      `This is an ${scheme} key. The browser wallet signs with FN-DSA only; use the command-line wallet for ML-DSA accounts.`,
    );
  }
  if (scheme !== SCHEME || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`A seed file holds ${SCHEME}: followed by 64 hex characters.`);
  }
  return fromHex(hex);
}
