// Answering steinchain.com: the site sends the visitor here with a request
// in the URL fragment, the wallet shows what is asked, and sends the visitor
// back with the answer in the fragment. A fragment is never sent to a server.
//
// Three requests ask for a signature. What is signed is a statement, not a
// transaction (see the wallet core): it proves to the site that the holder
// of this account asked for something, and can never be replayed on the
// chain. The fourth asks for the account's inbox key (lib/stein/inbox.mjs),
// so that the site's page can open the messages sent to this account.
//
//   request   /sign#v=1&kind=register&state=<hex>
//             /sign#v=1&kind=message&state=<hex>&to=<inbox key>&text=<utf-8>
//             /sign#v=1&kind=inbox&state=<hex>
//             /sign#v=1&kind=open&state=<hex>
//   answer    <site>/#wallet=<public key ‖ signature>&kind=<kind>&state=<hex>
//             <site>/#wallet=<public key ‖ signature ‖ inbox key>&kind=inbox&state=<hex>
//             <site>/mailbox#wallet=<inbox seed>&address=<address>&kind=open&state=<hex>
//             …#wallet=declined&kind=<kind>&state=<hex>
//
// Binary values are base64url. The answer goes to SITE_ORIGIN only, at a
// path this file fixes, whatever the request says: no other site can use
// this page to collect signatures or an inbox key.

import { INBOX_KEY_LEN } from './inbox.mjs';

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://steinchain.com';
export const SITE_NAME = new URL(SITE_ORIGIN).host;

/** "I hold this account": payload is the 32-byte address. */
export const KIND_REGISTER = 1;
/** "I wrote this, to this inbox": payload is the inbox's public key, then the text. */
export const KIND_MESSAGE = 2;
/** "This account's inbox is this key": payload is the address, then the inbox's public key. */
export const KIND_INBOX = 3;

const MAX_TEXT_BYTES = 4000;

export type SignRequest =
  | { kind: 'register'; state: string }
  | { kind: 'message'; state: string; to: Uint8Array; text: string }
  | { kind: 'inbox'; state: string }
  | { kind: 'open'; state: string };

/** What the wallet gives back, by the kind of request. */
export type Answer =
  | { publicKey: Uint8Array; signature: Uint8Array; inboxKey?: Uint8Array }
  | { inboxSeed: Uint8Array; address: string };

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

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Reads a request from a URL fragment. Throws with a readable message. */
export function parseRequest(fragment: string): SignRequest {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  if (params.get('v') !== '1') throw new Error('This is not a signing request this wallet understands.');
  const state = params.get('state') ?? '';
  if (!/^[0-9a-f]{16,64}$/.test(state)) throw new Error('The signing request is malformed.');
  const kind = params.get('kind');
  if (kind === 'register' || kind === 'inbox' || kind === 'open') return { kind, state };
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
    if (to.length !== INBOX_KEY_LEN) throw new Error('The signing request is malformed.');
    return { kind, state, to, text };
  }
  throw new Error('This wallet does not know that kind of request.');
}

/**
 * The statement a request asks this account to sign. `inboxKey` is the
 * account's own inbox key, which an inbox request signs. An open request
 * signs nothing.
 */
export function statementFor(
  request: Exclude<SignRequest, { kind: 'open' }>,
  address: Uint8Array,
  inboxKey: Uint8Array,
): { kind: number; payload: Uint8Array } {
  if (request.kind === 'register') return { kind: KIND_REGISTER, payload: address };
  if (request.kind === 'inbox') return { kind: KIND_INBOX, payload: concat(address, inboxKey) };
  return { kind: KIND_MESSAGE, payload: concat(request.to, new TextEncoder().encode(request.text)) };
}

/** Where to send the visitor back to, with the answer or a refusal. */
export function answerUrl(request: SignRequest, answer: Answer | null): string {
  const params = new URLSearchParams({ wallet: 'declined', kind: request.kind, state: request.state });
  if (answer && 'inboxSeed' in answer) {
    params.set('wallet', toBase64Url(answer.inboxSeed));
    params.set('address', answer.address);
  } else if (answer) {
    params.set(
      'wallet',
      toBase64Url(concat(answer.publicKey, answer.signature, answer.inboxKey ?? new Uint8Array(0))),
    );
  }
  // The inbox key opens messages: it goes to the page that reads them only.
  const path = request.kind === 'open' ? '/mailbox' : '/';
  return `${SITE_ORIGIN}${path}#${params.toString()}`;
}
