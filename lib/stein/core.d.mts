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

export interface Core {
  /** The address, in text form, of the key derived from a seed. */
  addressFromSeed(seed: Uint8Array): string;
  encodeAddress(address: Uint8Array): string;
  /** Parses an address, checking its checksum. Throws with a readable message. */
  decodeAddress(text: string): Uint8Array;
  signTransfer(request: TransferRequest): SignedTransfer;
}

export function loadCore(source: Response | BufferSource): Promise<Core>;
