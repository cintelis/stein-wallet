/** The Stein mark: the same disc and stroke as steinscan's. */
export default function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1366d6" />
      <path
        d="M10.5 20.5c1.8 1.8 4.4 2.5 7 1.8 2.5-.7 3.2-3.5.6-4.4l-4.2-1.4c-2.6-.9-2-4.4.6-4.6 1.8-.1 3.4.6 4.6 1.6"
        stroke="white"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
