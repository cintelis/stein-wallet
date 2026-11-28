'use client';

// The tokens the account holds, and its shares of liquidity pools. Symbols
// are not unique on Stein Chain, so each token is shown with its address.

import { formatUnits } from '@/lib/stein/assets';
import { useWallet } from './WalletContext';
import { short } from './util';

export default function Holdings() {
  const { address, account, network } = useWallet();
  const held = (account?.holdings ?? []).filter((h) => BigInt(h.balance) > 0n);
  if (!address || held.length === 0) return null;

  return (
    <section id="tokens" className="mt-12 scroll-mt-6 border-t border-slate-900 pt-10">
      <h2 className="text-2xl font-bold tracking-tight">Tokens</h2>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {held.map((h) => {
          const row = (
            <>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium text-slate-100">{h.symbol}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-500">
                  {h.pool_shares ? 'Pool ' : ''}
                  {short(h.asset)}
                </div>
              </div>
              <div className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-slate-100">
                {formatUnits(BigInt(h.balance), h.decimals)}
              </div>
            </>
          );
          const box =
            'flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3';
          return (
            <li key={h.asset}>
              {network.explorer ? (
                <a
                  href={`${network.explorer}/#/address/${h.asset}`}
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
    </section>
  );
}
