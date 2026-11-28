'use client';

// Send tab: unlock if needed, then what to send (STEIN, or a token the
// account holds), the recipient, the amount and the exact fee. The fee is the
// chain's minimum for the transaction's size, which is known before signing:
// 790 bytes for STEIN and 822 for a token, plus 898 on the account's first
// transaction, which carries its public key.

import { useState } from 'react';
import { formatStein } from '@/lib/stein/amount';
import { STEIN, STEIN_CHOICE, formatUnits, names, parseUnits, txBytes } from '@/lib/stein/assets';
import SentNotice from './SentNotice';
import { useWallet } from './WalletContext';
import { readable, short, ui } from './util';

export function UnlockForm({ to = 'send' }: { to?: string }) {
  const { unlock } = useWallet();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await unlock(passphrase);
        } catch (error) {
          setErr(readable(error));
          setBusy(false);
        }
      }}
    >
      <p className="text-sm leading-relaxed text-slate-400">
        The wallet is locked. Enter your passphrase to {to}.
      </p>
      <input
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="current-password"
        aria-label="Passphrase"
        placeholder="Passphrase"
        className={ui.input}
      />
      {err && <p className={ui.error}>{err}</p>}
      <button type="submit" disabled={busy || !passphrase} className={ui.primary}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  );
}

export default function SendPanel() {
  const { unlocked, address, account, status, checkAddress, send, sendToken } = useWallet();
  const [asset, setAsset] = useState(STEIN);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!unlocked) return <UnlockForm />;

  // STEIN, and every token the account holds some of.
  const held = (account?.holdings ?? []).filter((h) => BigInt(h.balance) > 0n);
  const holding = held.find((h) => h.asset === asset);
  // A token that has since been spent to nothing is no longer on offer.
  const sending = holding ? asset : STEIN;
  const choice = holding ? { asset, symbol: holding.symbol, decimals: holding.decimals } : STEIN_CHOICE;

  const label = names(held.map((h) => ({ asset: h.asset, symbol: h.symbol, decimals: h.decimals })));

  const stein = account ? BigInt(account.balance) : null;
  const balance = holding ? BigInt(holding.balance) : stein;
  const registersKey = account ? !account.key_registered : false;
  const bytes = txBytes({ kind: sending === STEIN ? 'transfer' : 'transfer_token' }, registersKey);
  const fee = status ? BigInt(status.min_fee_per_byte) * BigInt(bytes) : null;
  const units = parseUnits(amount, choice.decimals);
  // The fee is always STEIN: it comes off the amount only when STEIN is what is sent.
  const spendable =
    balance === null || fee === null ? null : sending === STEIN ? balance - fee : balance;
  const toProblem = to.trim() ? checkAddress(to) : null;

  const problem = !to.trim()
    ? 'Enter the recipient address.'
    : toProblem
      ? toProblem
      : !amount
        ? 'Enter an amount.'
        : units === null || units === 0n
          ? choice.decimals === 0
            ? 'Enter a whole amount above zero.'
            : `Enter an amount above zero, with at most ${choice.decimals} decimal places.`
          : spendable === null || stein === null || fee === null
            ? 'Waiting for the network…'
            : stein < fee
              ? 'The STEIN balance does not cover the network fee.'
              : units > spendable
                ? sending === STEIN
                  ? 'The balance does not cover the amount plus the fee.'
                  : `You hold less ${choice.symbol} than that.`
                : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || units === null) return;
    setBusy(true);
    setErr(null);
    try {
      if (sending === STEIN) await send(to.trim(), units);
      else await sendToken(sending, to.trim(), units);
      setAmount('');
    } catch (error) {
      setErr(readable(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={ui.side}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 grow">
            <label htmlFor="amount" className={ui.label}>
              Amount
            </label>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').slice(0, 30))}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                className={ui.bigInput}
              />
              {held.length === 0 ? (
                <span className="text-sm font-semibold text-slate-500">STEIN</span>
              ) : (
                <select
                  value={sending}
                  onChange={(e) => {
                    setAsset(e.target.value);
                    setAmount('');
                  }}
                  aria-label="What to send"
                  className={`${ui.select} shrink-0`}
                >
                  <option value={STEIN}>STEIN</option>
                  {held.map((h) => (
                    <option key={h.asset} value={h.asset}>
                      {label.get(h.asset)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-500">
              Balance: {balance !== null ? formatUnits(balance, choice.decimals) : '—'}
            </div>
            <button
              type="button"
              disabled={spendable === null || spendable <= 0n}
              onClick={() => {
                if (spendable !== null) setAmount(formatUnits(spendable, choice.decimals).replace(/,/g, ''));
              }}
              className={`${ui.ghost} mt-1.5`}
            >
              Max
            </button>
          </div>
        </div>
      </div>

      <div className={ui.side}>
        <label htmlFor="to" className={ui.label}>
          To
        </label>
        <textarea
          id="to"
          value={to}
          onChange={(e) => setTo(e.target.value.replace(/\s/g, ''))}
          rows={2}
          spellCheck={false}
          autoComplete="off"
          placeholder="st…"
          className="mt-1.5 w-full resize-none bg-transparent font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-700 focus:outline-none"
        />
        {to.trim() && (
          <div className={`mt-1 text-xs ${toProblem ? 'text-red-400' : 'text-emerald-400'}`}>
            {toProblem ?? (to.trim() === address ? 'Valid address (your own)' : 'Valid address')}
          </div>
        )}
      </div>

      <div className="space-y-1.5 px-1">
        {holding && (
          <div className={ui.meta}>
            <span>{holding.symbol} is the token</span>
            <span className="font-mono text-xs text-slate-300">{short(holding.asset)}</span>
          </div>
        )}
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
        {busy ? 'Signing and sending…' : 'Send'}
      </button>
      {problem && (to || amount) && <p className="text-center text-xs text-slate-500">{problem}</p>}

      <SentNotice what="send" />
    </form>
  );
}
