// Signing for steinchain.com: the site sends the visitor here with a request
// in the URL fragment, the wallet shows what is asked and signs a statement,
// and sends the visitor back with the public key and signature in the
// fragment. A fragment is never sent to a server.
//
// A statement is not a transaction (see the wallet core): it proves to the
// site that the holder of this account asked for something, and can never be
// replayed on the chain.
//
//   request   /sign#v=1&kind=register&state=<hex>
//             /sign#v=1&kind=message&state=<hex>&to=<inbox key>&text=<utf-8>
//   answer    <site>/#wallet=<public key ‖ signature>&kind=<kind>&state=<hex>
//             <site>/#wallet=declined&kind=<kind>&state=<hex>
//
// Binary values are base64url. The answer goes to SITE_ORIGIN only, whatever
// the request says, so no other site can use this page to collect signatures.

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://steinchain.com';
export const SITE_NAME = new URL(SITE_ORIGIN).host;

/** "I hold this account": payload is the 32-byte address. */
export const KIND_REGISTER = 1;
/** "I wrote this, to this inbox": payload is the inbox's public key, then the text. */
export const KIND_MESSAGE = 2;

/** An ML-KEM-768 public key: the site's inbox. */
const INBOX_KEY_BYTES = 1184;
const MAX_TEXT_BYTES = 4000;

export type SignRequest =
  | { kind: 'register'; state: string }
  | { kind: 'message'; state: string; to: Uint8Array; text: string };

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads a request from a URL fragment. Throws with a readable message. */
export function parseRequest(fragment: string): SignRequest {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  if (params.get('v') !== '1') throw new Error('This is not a signing request this wallet understands.');
  const state = params.get('state') ?? '';
  if (!/^[0-9a-f]{16,64}$/.test(state)) throw new Error('The signing request is malformed.');
  const kind = params.get('kind');
  if (kind === 'register') return { kind, state };
  if (kind === 'message') {
    let to: Uint8Array;
    let text: string;
    try {
      to = fromBase64Url(params.get('to') ?? '');
      const bytes = fromBase64Url(params.get('text') ?? '');
      if (bytes.length === 0 || bytes.length > MAX_TEXT_BYTES) throw new Error('length');
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('The signing request is malformed.');
    }
    if (to.length !== INBOX_KEY_BYTES) throw new Error('The signing request is malformed.');
    return { kind, state, to, text };
  }
  throw new Error('This wallet does not know that kind of request.');
}

/** The statement a request asks this account to sign. */
export function statementFor(
  request: SignRequest,
  address: Uint8Array,
): { kind: number; payload: Uint8Array } {
  if (request.kind === 'register') return { kind: KIND_REGISTER, payload: address };
  const text = new TextEncoder().encode(request.text);
  const payload = new Uint8Array(request.to.length + text.length);
  payload.set(request.to);
  payload.set(text, request.to.length);
  return { kind: KIND_MESSAGE, payload };
}

/** Where to send the visitor back to, with the signature or a refusal. */
export function answerUrl(
  request: SignRequest,
  signed: { publicKey: Uint8Array; signature: Uint8Array } | null,
): string {
  let wallet = 'declined';
  if (signed) {
    const both = new Uint8Array(signed.publicKey.length + signed.signature.length);
    both.set(signed.publicKey);
    both.set(signed.signature, signed.publicKey.length);
    wallet = toBase64Url(both);
  }
  const params = new URLSearchParams({ wallet, kind: request.kind, state: request.state });
  return `${SITE_ORIGIN}/#${params.toString()}`;
}
