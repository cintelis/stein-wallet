'use client';

// Header wallet control: the address with a menu (copy, lock, backup,
// remove). Renders nothing until this browser holds a wallet.

import { useEffect, useRef, useState } from 'react';
import { useWallet } from './WalletContext';
import { download, short, useCopied } from './util';

export default function WalletControls() {
  const { ready, address, unlocked, lock, forget, backupText, markBackedUp } = useWallet();
  const [copied, copy, copyFailed] = useCopied();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      setConfirmRemove(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!ready || !address) return null;

  const item =
    'grow rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 disabled:opacity-40';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 transition hover:border-slate-600"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${unlocked ? 'bg-emerald-400' : 'bg-slate-500'}`}
        />
        {short(address)}
        <span className="text-[9px] text-slate-500">▾</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-800 bg-[#070d1a] p-3 text-left shadow-xl shadow-black/50">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Your address · {unlocked ? 'unlocked' : 'locked'}
          </div>
          <code className="mt-2 block select-all break-all rounded-lg border border-slate-800 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
            {address}
          </code>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => copy(address)} className={item}>
              {copied ? 'Copied' : copyFailed ? 'Press and hold the address to copy' : 'Copy address'}
            </button>
            <button
              type="button"
              disabled={!unlocked}
              onClick={() => {
                lock();
                setMenuOpen(false);
              }}
              className={item}
            >
              Lock
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!unlocked}
              title={unlocked ? undefined : 'Unlock the wallet first'}
              onClick={() => {
                download(`stein-wallet-${address.slice(2, 10)}.seed`, backupText());
                markBackedUp();
              }}
              className={item}
            >
              Download backup
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return;
                }
                setMenuOpen(false);
                forget();
              }}
              className="grow rounded-lg border border-red-900/50 bg-red-950/30 px-2 py-2 text-xs font-medium text-red-300 transition hover:bg-red-950/60"
            >
              {confirmRemove ? 'Click again to remove' : 'Remove wallet'}
            </button>
          </div>
          {confirmRemove && (
            <p className="mt-2 text-[11px] leading-relaxed text-red-300">
              This deletes the key from this browser. Without a backup file, the account and its
              STEIN are lost for good.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
