// One small line drawing per step, drawn on a loop by the .glyph CSS.
// pathLength="1" lets one dash length fit every stroke.
const GLYPHS = {
  read: (
    <>
      <path pathLength={1} d="M12 6h18l8 8v28H12z" />
      <path pathLength={1} d="M17 18h16" />
      <path pathLength={1} d="M17 24h16" />
      <path pathLength={1} d="M17 30h10" />
      <path pathLength={1} d="M8 36h34" />
    </>
  ),
  rules: (
    <>
      <path
        pathLength={1}
        d="M17 8c-5 0-6 3-6 7v5c0 3-2 4-5 4 3 0 5 1 5 4v5c0 4 1 7 6 7"
      />
      <path
        pathLength={1}
        d="M31 8c5 0 6 3 6 7v5c0 3 2 4 5 4-3 0-5 1-5 4v5c0 4-1 7-6 7"
      />
      <path pathLength={1} d="M19 24h10" />
      <path pathLength={1} d="M25 19l5 5-5 5" />
    </>
  ),
  fuzz: (
    <>
      <path pathLength={1} d="M24 8v32" />
      <path pathLength={1} d="M6 12l14 9" />
      <path pathLength={1} d="M6 36l14-9" />
      <path pathLength={1} d="M42 14l-14 8" />
      <path pathLength={1} d="M42 34l-14-7" />
    </>
  ),
  compare: (
    <>
      <path pathLength={1} d="M8 16h22" />
      <path pathLength={1} d="M8 32h32" />
      <path pathLength={1} d="M30 10v12" />
      <path pathLength={1} d="M40 26v12" />
      <circle pathLength={1} cx="35" cy="24" r="9" />
    </>
  ),
};

export function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="glyph size-12"
    >
      {GLYPHS[name]}
    </svg>
  );
}
