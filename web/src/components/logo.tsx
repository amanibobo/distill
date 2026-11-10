// A pixel droplet in the current text color (NASA blue on the reading pages), with one cell of NASA red.
const ROWS = ["..X..", "..X..", ".XXX.", "XXXXX", "XXRXX", ".XXX."] as const;
const COLORS: Record<string, string> = { X: "currentColor", R: "#fc3d21" };
const CELL = 10;
const GAP = 1.5;
const STEP = CELL + GAP;

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${5 * STEP - GAP} ${ROWS.length * STEP - GAP}`} className={className} aria-hidden>
      {ROWS.flatMap((row, y) =>
        [...row].flatMap((c, x) =>
          c === "." ? [] : [<rect key={`${x}-${y}`} x={x * STEP} y={y * STEP} width={CELL} height={CELL} rx={1.6} fill={COLORS[c]} />],
        ),
      )}
    </svg>
  );
}
