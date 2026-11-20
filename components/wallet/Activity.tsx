'use client';

// The account's transactions, newest first, as the node reports them.

import { formatStein } from '@/lib/stein/amount';
import { useWallet } from './WalletContext';
import { short } from './util';

export default function Activity() {
  const { address, txs, network } = useWallet();
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
                    Block {tx.height.toLocaleString('en-US')} · {tx.size.toLocaleString('en-US')}{' '}
                    bytes · {tx.scheme}
                    {out && ` · fee ${formatStein(BigInt(tx.fee))}`}
                  </div>
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
