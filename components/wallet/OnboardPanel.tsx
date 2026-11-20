'use client';

// First run: make a new key, or import the seed file of an existing account.
// Either way the seed is encrypted under a passphrase and kept in this
// browser only.

import { useState } from 'react';
import { useWallet } from './WalletContext';
import { readable, ui } from './util';

const MIN_PASSPHRASE = 10;

export default function OnboardPanel({ mode }: { mode: 'create' | 'import' }) {
  const { create, importSeed } = useWallet();
  const [seedFile, setSeedFile] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const problem =
    mode === 'import' && !seedFile.trim()
      ? 'Paste or choose your seed file.'
      : passphrase.length < MIN_PASSPHRASE
        ? `Choose a passphrase of at least ${MIN_PASSPHRASE} characters.`
        : passphrase !== confirm
          ? 'The two passphrases do not match.'
          : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'create') await create(passphrase);
      else await importSeed(seedFile, passphrase);
    } catch (error) {
      setErr(readable(error));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-400">
        {mode === 'create'
          ? 'Creates a new Stein account. Its key is generated here, in your browser, and never leaves it.'
          : 'Use an account you already have, such as one made with the stein command-line wallet.'}
      </p>

      {mode === 'import' && (
        <div className={ui.side}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="seed-file" className={ui.label}>
              Seed file
            </label>
            <label className={`${ui.ghost} cursor-pointer`}>
              Choose file
              <input
                type="file"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setSeedFile((await file.text()).trim());
                }}
              />
            </label>
          </div>
          <textarea
            id="seed-file"
            value={seedFile}
            onChange={(e) => setSeedFile(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            placeholder="fn-dsa-512-draft:…"
            className="mt-2 w-full resize-none bg-transparent font-mono text-[11px] leading-relaxed text-slate-200 placeholder:text-slate-700 focus:outline-none"
          />
        </div>
      )}

      <div>
        <label htmlFor="passphrase" className={ui.label}>
          Passphrase
        </label>
        <input
          id="passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="new-password"
          className={`${ui.input} mt-1.5`}
        />
      </div>
      <div>
        <label htmlFor="passphrase-confirm" className={ui.label}>
          Passphrase again
        </label>
        <input
          id="passphrase-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={`${ui.input} mt-1.5`}
        />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        The passphrase encrypts the key in this browser. It is asked for each time you open the
        wallet, and it cannot be reset.
      </p>

      {err && <p className={ui.error}>{err}</p>}
      <button type="submit" disabled={busy || problem !== null} className={ui.primary}>
        {busy ? 'Working…' : mode === 'create' ? 'Create wallet' : 'Import wallet'}
      </button>
      {problem && (passphrase || confirm || seedFile) && (
        <p className="text-center text-xs text-slate-500">{problem}</p>
      )}
    </form>
  );
}
