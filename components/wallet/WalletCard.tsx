'use client';

// The main card. Without a wallet in this browser: Create or Import. With
// one: Send, Swap and Receive. Panels stay mounted so switching tabs keeps
// what was typed.

import { useState } from 'react';
import OnboardPanel from './OnboardPanel';
import ReceivePanel from './ReceivePanel';
import SendPanel from './SendPanel';
import SwapPanel from './SwapPanel';
import { useWallet } from './WalletContext';
import { download, ui } from './util';

function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      className={`mb-3 grid gap-1 rounded-xl bg-slate-950/70 p-1 ${
        tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
      }`}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-lg py-2 text-sm font-semibold transition ${
            value === t.key ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function BackupNotice() {
  const { address, unlocked, backedUp, backupText, markBackedUp } = useWallet();
  if (!address || backedUp) return null;
  return (
    <div className={`${ui.warn} mb-3`}>
      <strong className="font-semibold">Save your backup file.</strong> It is the only way to
      recover this wallet if you clear this browser or forget the passphrase. Anyone who has the
      file controls the account.
      <button
        type="button"
        disabled={!unlocked}
        onClick={() => {
          download(`stein-wallet-${address.slice(2, 10)}.seed`, backupText());
          markBackedUp();
        }}
        className="mt-2 block rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        {unlocked ? 'Download backup file' : 'Unlock the wallet to download it'}
      </button>
    </div>
  );
}

export default function WalletCard() {
  const { ready, coreError, address, network } = useWallet();
  const [onboardTab, setOnboardTab] = useState<'create' | 'import'>('create');
  const [tab, setTab] = useState<'send' | 'swap' | 'receive'>('send');

  return (
    <div id="wallet" className="w-full scroll-mt-6">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 font-mono text-[11px] text-slate-400">
        {network.label} · FN-DSA-512 (draft FIPS 206)
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-2xl shadow-black/40">
        {!ready ? (
          <p className="py-10 text-center font-mono text-[11px] tracking-widest text-slate-600">
            LOADING WALLET…
          </p>
        ) : coreError ? (
          <p className={ui.error}>The signing core did not load: {coreError}</p>
        ) : !address ? (
          <>
            <Tabs
              tabs={[
                { key: 'create', label: 'Create wallet' },
                { key: 'import', label: 'Import' },
              ]}
              value={onboardTab}
              onChange={setOnboardTab}
            />
            <OnboardPanel mode={onboardTab} />
          </>
        ) : (
          <>
            <Tabs
              tabs={[
                { key: 'send', label: 'Send' },
                { key: 'swap', label: 'Swap' },
                { key: 'receive', label: 'Receive' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <BackupNotice />
            <div hidden={tab !== 'send'}>
              <SendPanel />
            </div>
            <div hidden={tab !== 'swap'}>
              <SwapPanel />
            </div>
            <div hidden={tab !== 'receive'}>
              <ReceivePanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
