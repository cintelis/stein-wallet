import { useState } from 'react';

export const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

/** Clipboard write + 1.5s "copied" flag. */
export function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return [copied, copy];
}

/** Errors can be long; keep the useful first line. */
export function readable(e: unknown): string {
  const message = e instanceof Error ? e.message : 'Something went wrong.';
  return message.split('\n')[0].slice(0, 220);
}

/** Saves text as a file from the browser. */
export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Shared look of the wallet card.
export const ui = {
  side: 'rounded-xl border border-slate-800 bg-slate-950/60 p-3.5',
  label: 'font-mono text-[10px] uppercase tracking-widest text-slate-500',
  bigInput:
    'w-full min-w-0 bg-transparent text-[26px] font-semibold leading-tight tabular-nums text-slate-50 placeholder:text-slate-700 focus:outline-none disabled:opacity-60',
  input:
    'w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/70 focus:outline-none disabled:opacity-60',
  select:
    'max-w-full cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm font-semibold text-slate-100 focus:border-blue-500/60 focus:outline-none disabled:opacity-50',
  primary:
    'w-full rounded-xl bg-blue-500 px-4 py-3.5 text-[15px] font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-500',
  ghost:
    'rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-50 disabled:opacity-40',
  meta: 'flex items-center justify-between gap-3 text-[13px] text-slate-500',
  error: 'rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300',
  warn: 'rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300',
  ok: 'rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-300',
};
