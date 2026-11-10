// A pixel droplet. Its bottom row carries the three change colors the first sites show.
const ROWS = ["..X..", ".XXX.", ".XXX.", "XXXXX", "XXXXX", ".ABC."] as const;
const COLORS: Record<string, string> = { A: "#3987e5", B: "#d95926", C: "#199e70" };
const CELL = 10;
const GAP = 1.5;
const STEP = CELL + GAP;

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${5 * STEP - GAP} ${ROWS.length * STEP - GAP}`} className={className} aria-hidden>
      {ROWS.flatMap((row, y) =>
        [...row].flatMap((c, x) =>
          c === "." ? [] : [<rect key={`${x}-${y}`} x={x * STEP} y={y * STEP} width={CELL} height={CELL} rx={1.6} fill={COLORS[c] ?? "currentColor"} />],
        ),
      )}
    </svg>
  );
}
