'use client';

// The account's transactions, newest first, as the node reports them, with
// when each block was made and, for transfers sent from this browser, how
// long each took to reach a block.

import { useEffect, useState } from 'react';

import { formatStein } from '@/lib/stein/amount';
import { ago, formatDuration } from '@/lib/stein/time';
import { useWallet } from './WalletContext';
import { short } from './util';

export default function Activity() {
  const { address, txs, network, deliveries, blockTimes } = useWallet();
  // "3 min ago" goes stale: read the clock again every half minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!address) return null;

  return (
    <section id="activity" className="mt-12 scroll-mt-6 border-t border-slate-900 pt-10">
      <h2 className="text-2xl font-bold tracking-tight">Activity</h2>
      {txs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No transactions on {network.label} yet.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {txs.map((tx) => {
            const out = tx.sender === address;
            const self = out && tx.to === address;
            const other = out ? tx.to : tx.sender;
            const made = blockTimes[tx.height];
            const took = deliveries[tx.id];
            const row = (
              <>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-slate-100">
                    {self ? 'Sent to yourself' : out ? 'Sent' : 'Received'}
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {self ? '' : `${out ? 'to' : 'from'} ${short(other)}`}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-slate-500">
                    Block {tx.height.toLocaleString('en-US')}
                    {made !== undefined && (
                      <span title={new Date(made).toLocaleString()}> · {ago(made, now)}</span>
                    )}
                    {' · '}
                    {tx.size.toLocaleString('en-US')} bytes · {tx.scheme}
                    {out && ` · fee ${formatStein(BigInt(tx.fee))}`}
                  </div>
                  {took !== undefined && (
                    <div
                      className="mt-0.5 text-xs tabular-nums text-emerald-400/90"
                      title="From sending until this wallet saw it in a block"
                    >
                      Delivered in {formatDuration(took)}
                    </div>
                  )}
                </div>
                <div
                  className={`shrink-0 text-right text-[15px] font-semibold tabular-nums ${
                    self ? 'text-slate-400' : out ? 'text-slate-100' : 'text-emerald-400'
                  }`}
                >
                  {self ? '' : out ? '−' : '+'}
                  {formatStein(BigInt(tx.amount))}
                  <span className="ml-1 text-xs font-normal text-slate-500">STEIN</span>
                </div>
              </>
            );
            const box =
              'flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3';
            return (
              <li key={tx.id}>
                {network.explorer ? (
                  <a
                    href={`${network.explorer}/#/tx/${tx.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${box} transition hover:border-slate-600`}
                  >
                    {row}
                  </a>
                ) : (
                  <div className={box}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
