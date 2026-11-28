'use client';

// Send tab: unlock if needed, then recipient, amount and the exact fee. The
// fee is the chain's minimum for the transfer's size, which is known before
// signing: 790 bytes, or 1,688 for the account's first transaction, which
// carries its public key.

import { useState } from 'react';
import { formatStein, parseStein, transferFee, TRANSFER_BYTES } from '@/lib/stein/amount';
import { formatDuration } from '@/lib/stein/time';
import { useWallet } from './WalletContext';
import { readable, ui } from './util';

function UnlockForm() {
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
        The wallet is locked. Enter your passphrase to send.
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
  const { unlocked, address, account, status, network, checkAddress, send, lastSent } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!unlocked) return <UnlockForm />;

  const balance = account ? BigInt(account.balance) : null;
  const registersKey = account ? !account.key_registered : false;
  const fee = status ? transferFee(BigInt(status.min_fee_per_byte), registersKey) : null;
  const units = parseStein(amount);
  const toProblem = to.trim() ? checkAddress(to) : null;

  const problem = !to.trim()
    ? 'Enter the recipient address.'
    : toProblem
      ? toProblem
      : !amount
        ? 'Enter an amount.'
        : units === null || units === 0n
          ? 'Enter an amount above zero, with at most 9 decimal places.'
          : balance === null || fee === null
            ? 'Waiting for the network…'
            : units + fee > balance
              ? 'The balance does not cover the amount plus the fee.'
              : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || units === null) return;
    setBusy(true);
    setErr(null);
    try {
      await send(to.trim(), units);
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
              <span className="text-sm font-semibold text-slate-500">STEIN</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-500">
              Balance: {balance !== null ? formatStein(balance) : '—'}
            </div>
            <button
              type="button"
              disabled={balance === null || fee === null || balance <= fee}
              onClick={() => {
                if (balance !== null && fee !== null) setAmount(formatStein(balance - fee).replace(/,/g, ''));
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
        <div className={ui.meta}>
          <span>Network fee</span>
          <span className="tabular-nums text-slate-300">
            {fee !== null ? `${formatStein(fee)} STEIN` : '—'}
          </span>
        </div>
        <div className={ui.meta}>
          <span>Size</span>
          <span className="tabular-nums text-slate-300">
            {(registersKey ? TRANSFER_BYTES.first : TRANSFER_BYTES.later).toLocaleString('en-US')} bytes
            {registersKey && ' · first transaction, carries your public key'}
          </span>
        </div>
      </div>

      {err && <p className={ui.error}>{err}</p>}
      <button type="submit" disabled={busy || problem !== null} className={ui.primary}>
        {busy ? 'Signing and sending…' : 'Send'}
      </button>
      {problem && (to || amount) && <p className="text-center text-xs text-slate-500">{problem}</p>}

      {lastSent && (
        <div className={lastSent.height === null ? ui.warn : ui.ok}>
          <div className="font-semibold">
            {lastSent.height === null
              ? 'Sent. Waiting for a block…'
              : `Included in block ${lastSent.height.toLocaleString('en-US')}${
                  lastSent.tookMs === null ? '' : ` after ${formatDuration(lastSent.tookMs)}`
                }`}
          </div>
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
      )}
    </form>
  );
}
