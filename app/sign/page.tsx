'use client';

// /sign: steinchain.com asks this wallet to sign a statement (see
// lib/stein/statement.ts). The page shows exactly what is asked, signs only
// when the user says so, and sends them back to the site with the answer.

import { useEffect, useState } from 'react';
import Logo from '@/components/layout/Logo';
import { useWallet } from '@/components/wallet/WalletContext';
import { readable, short, ui } from '@/components/wallet/util';
import {
  answerUrl,
  parseRequest,
  SITE_NAME,
  SITE_ORIGIN,
  type SignRequest,
} from '@/lib/stein/statement';

function Unlock() {
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
        The wallet is locked. Enter your passphrase to continue.
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

function Request({ request }: { request: SignRequest }) {
  const { address, unlocked, signStatement } = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!address) {
    return (
      <div className="space-y-3">
        <p className={ui.warn}>
          There is no wallet in this browser. Create or import one first, then start again from{' '}
          {SITE_NAME}.
        </p>
        <a href="/" className={`${ui.primary} block text-center`}>
          Open the wallet
        </a>
      </div>
    );
  }

  const decline = (
    <a
      href={answerUrl(request, null)}
      className="block text-center text-sm text-slate-500 transition hover:text-slate-200"
    >
      Decline and go back to {SITE_NAME}
    </a>
  );

  return (
    <div className="space-y-4">
      <div className={ui.side}>
        <div className={ui.label}>Signing as</div>
        <div className="mt-1 font-mono text-sm text-slate-100" title={address}>
          {short(address)}
        </div>
      </div>

      {request.kind === 'register' ? (
        <p className="text-sm leading-relaxed text-slate-300">
          <b className="text-slate-50">{SITE_NAME}</b> asks you to prove that you hold this
          account. Signing registers its address with Stein Chain.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-300">
            <b className="text-slate-50">{SITE_NAME}</b> asks you to sign this message. It will be
            sent, encrypted, to the Stein Chain inbox, and whoever reads it will see that it came
            from this account.
          </p>
          <div className={ui.side}>
            <div className={ui.label}>Message</div>
            <p className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">
              {request.text}
            </p>
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        This is a signature, not a transaction: it moves no STEIN, costs no fee and cannot be used
        on the chain. Your key stays in this browser; only your public key and the signature go
        back to {SITE_NAME}.
      </p>

      {!unlocked ? (
        <Unlock />
      ) : (
        <button
          type="button"
          disabled={busy}
          className={ui.primary}
          onClick={() => {
            setBusy(true);
            setErr(null);
            try {
              window.location.assign(answerUrl(request, signStatement(request)));
            } catch (error) {
              setErr(readable(error));
              setBusy(false);
            }
          }}
        >
          {busy ? 'Signing…' : request.kind === 'register' ? 'Sign and register' : 'Sign and send'}
        </button>
      )}
      {err && <p className={ui.error}>{err}</p>}
      {decline}
    </div>
  );
}

export default function Sign() {
  const { ready, coreError } = useWallet();
  // The request is in the fragment, which only the browser sees.
  const [parsed, setParsed] = useState<{ request?: SignRequest; error?: string } | null>(null);

  useEffect(() => {
    try {
      setParsed({ request: parseRequest(window.location.hash) });
    } catch (e) {
      setParsed({ error: readable(e) });
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10">
      <a href="/" className="mb-6 flex items-center gap-3">
        <Logo />
        <div className="text-lg font-semibold leading-tight">
          stein<span className="text-blue-400">wallet</span>
        </div>
      </a>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-2xl shadow-black/40">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Signature request</h1>
        {!ready || !parsed ? (
          <p className="py-10 text-center font-mono text-[11px] tracking-widest text-slate-600">
            LOADING WALLET…
          </p>
        ) : coreError ? (
          <p className={ui.error}>The signing core did not load: {coreError}</p>
        ) : parsed.request ? (
          <Request request={parsed.request} />
        ) : (
          <div className="space-y-3">
            <p className={ui.error}>{parsed.error}</p>
            <a href={SITE_ORIGIN} className="block text-center text-sm text-slate-500 hover:text-slate-200">
              Go to {SITE_NAME}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
