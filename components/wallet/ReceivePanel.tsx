'use client';

// Receive tab: the address to give to a sender. Receiving needs no key and
// costs nothing, so it works while the wallet is locked.

import { useWallet } from './WalletContext';
import { ui, useCopied } from './util';

export default function ReceivePanel() {
  const { address, network } = useWallet();
  const [copied, copy, copyFailed] = useCopied();
  if (!address) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-400">
        Give this address to whoever is sending you STEIN on {network.label}. The last 8 characters
        are a checksum, so a mistyped address is refused before anything is sent.
      </p>
      <div className={ui.side}>
        <div className={ui.label}>Your address</div>
        <code className="mt-2 block select-all break-all font-mono text-[13px] leading-relaxed text-slate-100">
          {address}
        </code>
      </div>
      <button type="button" onClick={() => copy(address)} className={ui.primary}>
        {copied ? 'Copied' : copyFailed ? 'Press and hold the address to copy' : 'Copy address'}
      </button>
      {network.explorer && (
        <a
          href={`${network.explorer}/#/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-slate-400 underline decoration-dotted underline-offset-2 transition hover:text-blue-400"
        >
          View this account on steinscan
        </a>
      )}
    </div>
  );
}
