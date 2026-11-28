export const EXPLORER_URL = 'https://steinscan.io';
export const GITHUB_URL = 'https://github.com/steinchain/stein-chain';
/** Where the messages sent to this account on steinchain.com are read. */
export const INBOX_URL = `${process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://steinchain.com'}/mailbox`;

/**
 * The assistant that answers questions about Stein Chain. A link, not a chat
 * box in this page: the wallet's pages talk to the Stein nodes and to nothing
 * else (public/_headers), and the assistant is another server.
 */
export const ASK_URL = `${process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://steinchain.com'}/?ask`;

export const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'steinscan', href: EXPLORER_URL },
  { label: 'Inbox', href: INBOX_URL },
  { label: 'Ask a question', href: ASK_URL },
  { label: 'Validators', href: `${EXPLORER_URL}/#/validators` },
  { label: 'Protocol spec', href: `${GITHUB_URL}/blob/main/docs/SPEC.md` },
  { label: 'GitHub', href: GITHUB_URL },
];
