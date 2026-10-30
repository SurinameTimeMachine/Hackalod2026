// Small inline icons shared by the screens.

export function Back({ onClick, light = true }: { onClick: () => void; light?: boolean }) {
  return (
    <button type="button" className={`iconbtn${light ? ' light' : ''}`} onClick={onClick} aria-label="Terug">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}

export function Mic() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="7" y="2" width="8" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M4 10a7 7 0 0014 0M11 17v3" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}
