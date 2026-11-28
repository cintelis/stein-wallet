'use client';

// What happened to the last transaction sent from this page: waiting, then
// the block it is in, how long that took, and for a swap what the pool paid.

import { formatStein } from '@/lib/stein/amount';
import { formatUnits, type AssetChoice } from '@/lib/stein/assets';
import { formatDuration } from '@/lib/stein/time';
import { useWallet, type Sent } from './WalletContext';
import { ui } from './util';

export default function SentNotice({
  what,
  receiving,
}: {
  what: Sent['what'];
  /** For a swap: the asset being bought, to show what the pool paid in. */
  receiving?: AssetChoice;
}) {
  const { lastSent, network } = useWallet();
  if (!lastSent || lastSent.what !== what) return null;

  const included = lastSent.height !== null;
  const swapped = lastSent.outcome?.result === 'swapped';
  // A swap that is in a block but was not filled: valid, fee paid, payment returned.
  const returned = what === 'swap' && included && !swapped;

  let title = what === 'swap' ? 'Swap sent. Waiting for a block…' : 'Sent. Waiting for a block…';
  if (lastSent.height !== null) {
    const after = lastSent.tookMs === null ? '' : ` after ${formatDuration(lastSent.tookMs)}`;
    title = `Included in block ${lastSent.height.toLocaleString('en-US')}${after}`;
  }

  return (
    <div className={!included || returned ? ui.warn : ui.ok}>
      <div className="font-semibold">{title}</div>
      {what === 'swap' && swapped && receiving && (
        <div className="mt-1 tabular-nums">
          Received {formatUnits(BigInt(lastSent.outcome?.amount_out ?? '0'), receiving.decimals)}{' '}
          {receiving.symbol}
        </div>
      )}
      {returned && (
        <div className="mt-1">
          The pool could not fill it at your minimum, so it returned what you paid. The network
          fee was still spent.
        </div>
      )}
      <div className="mt-1 tabular-nums">
        {lastSent.size.toLocaleString('en-US')} bytes · fee {formatStein(lastSent.fee)} STEIN
      </div>
      {network.explorer ? (
        <a
          href={`${network.explorer}/#/tx/${lastSent.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-[11px] underline decoration-dotted underline-offset-2"
        >
          {lastSent.id}
        </a>
      ) : (
        <code className="mt-1 block break-all font-mono text-[11px]">{lastSent.id}</code>
      )}
    </div>
  );
}
