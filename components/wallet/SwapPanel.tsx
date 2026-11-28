'use client';

// Swap tab: trade one asset for another through their liquidity pool.
//
// The estimate is the chain's own formula on the pool's reserves as last
// read. The pool may have moved by the time the swap is in a block, so the
// wallet sets a minimum to receive, half a percent below the estimate: if the
// pool would pay less, it returns what was paid. The network fee is spent
// either way.

import { useState } from 'react';
import { formatStein } from '@/lib/stein/amount';
import {
  STEIN,
  formatUnits,
  leastOut,
  names,
  parseUnits,
  poolFor,
  quote,
  tradable,
  txBytes,
} from '@/lib/stein/assets';
import { UnlockForm } from './SendPanel';
import SentNotice from './SentNotice';
import { useWallet } from './WalletContext';
import { readable, short, ui } from './util';

/** How far the result may fall short of the estimate, in hundredths of a percent. */
const SLIPPAGE_BPS = 50;

export default function SwapPanel() {
  const { unlocked, account, status, network, pools, swap } = useWallet();
  const assets = tradable(pools);
  const [from, setFrom] = useState(STEIN);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!unlocked) return <UnlockForm to="swap" />;
  if (assets.length < 2) {
    return (
      <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
        {network.label} has no liquidity pool yet, so there is nothing to swap.
      </p>
    );
  }

  // What is chosen, falling back to the first pair on offer.
  const paying = assets.find((a) => a.asset === from) ?? assets[0];
  const receiving =
    assets.find((a) => a.asset === to && a.asset !== paying.asset) ??
    assets.find((a) => a.asset !== paying.asset && poolFor(pools, paying.asset, a.asset)) ??
    assets.find((a) => a.asset !== paying.asset)!;

  const stein = account ? BigInt(account.balance) : null;
  const heldOf = (asset: string) =>
    asset === STEIN
      ? stein
      : account
        ? BigInt(account.holdings?.find((h) => h.asset === asset)?.balance ?? '0')
        : null;
  const balance = heldOf(paying.asset);
  const registersKey = account ? !account.key_registered : false;
  const bytes = txBytes({ kind: 'swap', assetIn: paying.asset, assetOut: receiving.asset }, registersKey);
  const fee = status ? BigInt(status.min_fee_per_byte) * BigInt(bytes) : null;
  const spendable =
    balance === null || fee === null ? null : paying.asset === STEIN ? balance - fee : balance;

  const market = poolFor(pools, paying.asset, receiving.asset);
  const units = parseUnits(amount, paying.decimals);
  const expected =
    market && units ? quote(units, market.reserveIn, market.reserveOut, BigInt(market.pool.fee_per_mille)) : 0n;
  const least = expected > 0n ? leastOut(expected, SLIPPAGE_BPS) : 0n;

  const problem = !market
    ? `There is no pool that trades ${paying.symbol} for ${receiving.symbol}.`
    : !amount
      ? 'Enter an amount.'
      : units === null || units === 0n
        ? paying.decimals === 0
          ? 'Enter a whole amount above zero.'
          : `Enter an amount above zero, with at most ${paying.decimals} decimal places.`
        : spendable === null || stein === null || fee === null
          ? 'Waiting for the network…'
          : stein < fee
            ? 'The STEIN balance does not cover the network fee.'
            : units > spendable
              ? paying.asset === STEIN
                ? 'The balance does not cover the amount plus the fee.'
                : `You hold less ${paying.symbol} than that.`
              : expected === 0n
                ? 'That is too little for the pool to pay anything back.'
                : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || units === null) return;
    setBusy(true);
    setErr(null);
    try {
      await swap(paying.asset, units, receiving.asset, least);
      setAmount('');
    } catch (error) {
      setErr(readable(error));
    } finally {
      setBusy(false);
    }
  };

  const label = names(assets);
  // Symbols are not unique: the address is what says which token this is.
  const token = [paying, receiving].find((a) => a.asset !== STEIN);

  const flip = () => {
    setFrom(receiving.asset);
    setTo(paying.asset);
    setAmount('');
  };

  const picker = (value: string, onChange: (asset: string) => void, title: string, not?: string) => (
    <select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setAmount('');
      }}
      aria-label={title}
      className={`${ui.select} shrink-0`}
    >
      {assets
        .filter((a) => a.asset !== not)
        .map((a) => (
          <option key={a.asset} value={a.asset}>
            {label.get(a.asset)}
          </option>
        ))}
    </select>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={ui.side}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 grow">
            <label htmlFor="swap-amount" className={ui.label}>
              You pay
            </label>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                id="swap-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').slice(0, 30))}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                className={ui.bigInput}
              />
              {picker(paying.asset, setFrom, 'Asset to pay')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-500">
              Balance: {balance !== null ? formatUnits(balance, paying.decimals) : '—'}
            </div>
            <button
              type="button"
              disabled={spendable === null || spendable <= 0n}
              onClick={() => {
                if (spendable !== null) setAmount(formatUnits(spendable, paying.decimals).replace(/,/g, ''));
              }}
              className={`${ui.ghost} mt-1.5`}
            >
              Max
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button type="button" onClick={flip} aria-label="Swap the two assets" className={ui.ghost}>
          ⇅
        </button>
      </div>

      <div className={ui.side}>
        <div className={ui.label}>You receive, about</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div
            className={`min-w-0 grow truncate text-[26px] font-semibold leading-tight tabular-nums ${
              expected > 0n ? 'text-slate-50' : 'text-slate-700'
            }`}
          >
            {expected > 0n ? formatUnits(expected, receiving.decimals) : '0'}
          </div>
          {picker(receiving.asset, setTo, 'Asset to receive', paying.asset)}
        </div>
      </div>

      <div className="space-y-1.5 px-1">
        {token && (
          <div className={ui.meta}>
            <span>{token.symbol} is the token</span>
            {network.explorer ? (
              <a
                href={`${network.explorer}/#/address/${token.asset}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-slate-300 underline decoration-dotted underline-offset-2"
              >
                {short(token.asset)}
              </a>
            ) : (
              <span className="font-mono text-xs text-slate-300">{short(token.asset)}</span>
            )}
          </div>
        )}
        <div className={ui.meta}>
          <span>Least you will receive</span>
          <span className="tabular-nums text-slate-300">
            {least > 0n ? `${formatUnits(least, receiving.decimals)} ${receiving.symbol}` : '—'}
          </span>
        </div>
        <div className={ui.meta}>
          <span>Pool fee</span>
          <span className="tabular-nums text-slate-300">
            {market ? `${market.pool.fee_per_mille / 10}%, kept by the pool` : '—'}
          </span>
        </div>
        <div className={ui.meta}>
          <span>Network fee</span>
          <span className="tabular-nums text-slate-300">
            {fee !== null ? `${formatStein(fee)} STEIN` : '—'}
          </span>
        </div>
        <div className={ui.meta}>
          <span>Size</span>
          <span className="tabular-nums text-slate-300">
            {bytes.toLocaleString('en-US')} bytes
            {registersKey && ' · first transaction, carries your public key'}
          </span>
        </div>
      </div>

      {err && <p className={ui.error}>{err}</p>}
      <button type="submit" disabled={busy || problem !== null} className={ui.primary}>
        {busy ? 'Signing and sending…' : 'Swap'}
      </button>
      {problem && (amount || !market) && <p className="text-center text-xs text-slate-500">{problem}</p>}
      <p className="px-1 text-center text-[11px] leading-relaxed text-slate-600">
        If the pool would pay less than the least shown, it returns what you paid. The network fee
        is spent either way.
      </p>

      <SentNotice what="swap" receiving={receiving} />
    </form>
  );
}
