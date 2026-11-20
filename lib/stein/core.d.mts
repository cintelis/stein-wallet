// Types for core.mjs, the caller of the WebAssembly wallet core.

export interface TransferRequest {
  /** The 32-byte key seed. */
  seed: Uint8Array;
  chainId: bigint;
  /** The sender's next nonce. */
  nonce: bigint;
  /** Last height at which the transaction may be included. */
  expiresAt: bigint;
  /** The chain's minimum fee per encoded byte, in base units. */
  minFeePerByte: bigint;
  /** Recipient address, in text form. */
  to: string;
  /** Base units to move. */
  amount: bigint;
  /** Attach the public key: on the sender's first transaction only. */
  registerKey: boolean;
}

export interface SignedTransfer {
  /** Transaction id, hex. */
  id: string;
  /** Fee paid, in base units. */
  fee: bigint;
  /** The encoded transaction. */
  raw: Uint8Array;
}

export interface Statement {
  /** The 32-byte key seed. */
  seed: Uint8Array;
  /** What kind of statement: the asking site defines the kinds. */
  kind: number;
  payload: Uint8Array;
}

export interface SignedStatement {
  /** The account's FN-DSA-512 public key. */
  publicKey: Uint8Array;
  signature: Uint8Array;
}

export interface Core {
  /** The address, in text form, of the key derived from a seed. */
  addressFromSeed(seed: Uint8Array): string;
  encodeAddress(address: Uint8Array): string;
  /** Parses an address, checking its checksum. Throws with a readable message. */
  decodeAddress(text: string): Uint8Array;
  signTransfer(request: TransferRequest): SignedTransfer;
  /** Signs a statement: proof to a site, never a transaction. */
  signStatement(statement: Statement): SignedStatement;
  verifyStatement(signed: {
    publicKey: Uint8Array;
    kind: number;
    payload: Uint8Array;
    signature: Uint8Array;
  }): boolean;
  /** The address, in text form, that a public key controls. */
  addressFromPublicKey(publicKey: Uint8Array): string;
}

export const PUBLIC_KEY_LEN: number;
export const SIGNATURE_LEN: number;

export function loadCore(source: Response | BufferSource | WebAssembly.Module): Promise<Core>;
