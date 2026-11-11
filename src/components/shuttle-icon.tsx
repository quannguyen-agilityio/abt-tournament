/** The shuttle, on the server's name tag and next to the serving team. */
export function ShuttleIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="19.2" r="3" fill="currentColor" />
      <path
        d="M8.6 16.2 5.2 4.2h13.6l-3.4 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.2 4.2l1.5 11.4M14.8 4.2l-1.5 11.4M12 4.2v11.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
