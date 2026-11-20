import Logo from './Logo';
import { FOOTER_LINKS } from './site';

/** Compact footer: the Stein mark and links to the explorer and the source. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-blue-950 bg-[#040913] px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-max items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-sm font-semibold text-slate-100">Stein Chain</span>
        </div>
        <nav aria-label="Stein Chain" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              rel="noopener"
              className="text-sm text-slate-400 transition hover:text-blue-400"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="mx-auto mt-6 w-full max-w-5xl border-t border-slate-900 pt-5 font-mono text-[10px] leading-relaxed text-slate-600">
        steinwallet © 2026 · Stein Chain devnet · not a production network. Your key stays in this
        browser; this site never holds keys or funds.
      </div>
    </footer>
  );
}
