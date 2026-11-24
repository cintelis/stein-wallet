/** The Stein mark: the S of a currency on the blue disc, as on steinchain.com and steinscan. */
export default function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1366d6" />
      <g transform="rotate(14 16 16)" fill="none" stroke="white">
        <path d="M21.2 12.3c-1.3-1.5-3.2-2.2-5.2-2.2-2.9 0-4.9 1.4-4.9 3.4 0 4.4 10 2 10 6.6 0 2.1-2.1 3.6-5.1 3.6-2.2 0-4.2-.8-5.5-2.4" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14.3 6.2v3.6M17.7 6.2v3.6M14.3 22.4v3.6M17.7 22.4v3.6" strokeWidth="2.3" />
      </g>
    </svg>
  );
}
