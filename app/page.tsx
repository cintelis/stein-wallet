import TopBar from '@/components/layout/TopBar';
import SiteFooter from '@/components/layout/SiteFooter';
import { INBOX_URL } from '@/components/layout/site';
import Activity from '@/components/wallet/Activity';
import Holdings from '@/components/wallet/Holdings';
import StatStrip from '@/components/wallet/StatStrip';
import WalletCard from '@/components/wallet/WalletCard';

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Create or import',
    body: 'Make a new account here, or import the seed file of one you already have. The key is generated and kept in your browser, encrypted with your passphrase.',
  },
  {
    title: 'Receive',
    body: 'Give your address to the sender. It starts with st and ends in a checksum, so a typo is caught before anything moves.',
  },
  {
    title: 'Send',
    body: 'Enter an address and an amount. The transfer is signed in your browser with a post-quantum signature and is in a block about a second later.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Where is my key?',
    a: 'In this browser only. It is a 32-byte seed, stored encrypted under your passphrase, and it is never sent anywhere: this site has no server that could receive it. Reloading the page locks the wallet.',
  },
  {
    q: 'What if I lose it?',
    a: 'The backup file is the only way back. If you clear this browser’s data or forget the passphrase without one, the account and its STEIN are gone. Nobody can reset it.',
  },
  {
    q: 'What does post-quantum mean here?',
    a: 'Every signature on Stein Chain uses a scheme designed to resist quantum computers. This wallet signs with FN-DSA-512 as specified in the draft of FIPS 206, which Stein adopted ahead of the final standard. Its signatures are 666 bytes.',
  },
  {
    q: 'Why was my first transfer bigger?',
    a: 'An account’s first transaction carries its public key, so the chain can store it: 1,688 bytes. Every later one leaves the key out and is 790 bytes. The fee follows the size.',
  },
  {
    q: 'What are tokens and swaps?',
    a: 'Anyone can issue a token on Stein Chain, and any two assets can have a liquidity pool that trades one for the other at the ratio of what it holds. The Swap tab trades through a pool: it shows what you would receive and the least you will accept, and if the pool cannot pay that much it returns what you paid. Token symbols are not unique, so check the address. The devnet has a token called DEMO to try this with; like devnet STEIN, it has no value.',
  },
  {
    q: 'Can I use MetaMask or a hardware wallet?',
    a: 'No. They sign with the elliptic-curve scheme Ethereum uses, which Stein does not accept. A Stein account needs a wallet that can make post-quantum signatures, such as this one or the stein command-line wallet.',
  },
  {
    q: 'Can I use the same account in the command-line wallet?',
    a: 'Yes. The backup file is the seed file the stein command-line wallet reads, and a seed file made by it imports here. Accounts on ML-DSA keys are not supported in the browser yet.',
  },
  {
    q: 'Is STEIN worth anything?',
    a: 'No. This is a devnet: its STEIN has no value and the network can be reset at any time. Do not treat this wallet as safe for funds that matter.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl grow px-4 sm:px-6">
        <section className="grid items-start gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:py-14">
          <div className="lg:pt-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-900/60 bg-blue-950/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Stein Chain devnet
            </div>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Hold and send <span className="text-blue-400">STEIN</span>.
              <br />
              Signed post-quantum, in your browser.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-400">
              A wallet for Stein Chain, the post-quantum layer-1. Your key is created and kept in
              this browser, and every transfer is signed here with FN-DSA. Your wallet, your key.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <a
                href="#wallet"
                className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
              >
                Open wallet
              </a>
              <a
                href="#how"
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600"
              >
                See how it works
              </a>
              <a
                href={INBOX_URL}
                className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
                Read your inbox
              </a>
            </div>
          </div>
          <WalletCard />
        </section>

        <StatStrip />
        <Holdings />
        <Activity />

        <section id="how" className="mt-12 scroll-mt-6 border-t border-slate-900 pt-10">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
            An account is a key pair. The address is a hash of the public key, and only the holder
            of the key can sign transfers out of it.
          </p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/15 text-xs font-bold text-blue-300">
                  {i + 1}
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-slate-100">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="mb-14 mt-12 scroll-mt-6 border-t border-slate-900 pt-10">
          <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
          <div className="mt-5 space-y-2">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-[15px] font-medium text-slate-100 marker:hidden">
                  <span className="mr-2 inline-block text-blue-400 transition group-open:rotate-90">
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-4 text-sm leading-relaxed text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
