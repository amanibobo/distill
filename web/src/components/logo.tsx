// A water droplet in the current text color, with a soft highlight.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 26" className={className} aria-hidden>
      <path d="M10 1.2C10 1.2 2 10.6 2 16.6a8 8 0 0 0 16 0C18 10.6 10 1.2 10 1.2Z" fill="currentColor" />
      <path d="M6.2 16.9a3.9 3.9 0 0 0 3.6 3.9" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
