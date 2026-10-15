/** Two electrodes with the deposit between them and an accent dot for the Au ion. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M18 20v24M46 20v24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M24 40h16" fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="26" r="5" fill="var(--color-accent)" />
    </svg>
  )
}
