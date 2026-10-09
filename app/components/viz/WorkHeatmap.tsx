import { addDays, weekdayOf } from "../../../src/lib/time";

/**
 * Griglia dei giorni (colonne = settimane, righe = lun-dom): il colore è il tempo lavorato, il puntino i giorni con commit.
 * Pura: riceve i minuti per giorno e i commit per giorno già calcolati.
 */
export function WorkHeatmap({ today, weeks = 26, minutes, commits }: { today: string; weeks?: number; minutes: Record<string, number>; commits?: Record<string, number> }) {
  const CELL = 13;
  const GAP = 3;
  const LEFT = 4;
  const TOP = 4;
  const dow = (weekdayOf(today) + 6) % 7; // 0 = lunedì
  const start = addDays(today, -(dow + (weeks - 1) * 7));
  const cells: { day: string; col: number; row: number }[] = [];
  for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) {
    const day = addDays(start, w * 7 + r);
    if (day <= today) cells.push({ day, col: w, row: r });
  }
  const shade = (m: number) => (m <= 0 ? "rgba(120,170,220,0.08)" : m < 120 ? "rgba(255, 159, 10,0.35)" : m < 240 ? "rgba(255, 159, 10,0.6)" : m < 360 ? "rgba(255, 159, 10,0.85)" : "#ff9f0a");
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label="Giorni lavorati">
        {cells.map((c) => {
          const m = minutes[c.day] ?? 0;
          const x = LEFT + c.col * (CELL + GAP);
          const y = TOP + c.row * (CELL + GAP);
          return (
            <g key={c.day}>
              <rect x={x} y={y} width={CELL} height={CELL} rx={3} fill={shade(m)}>
                <title>{`${c.day}: ${m ? `${Math.round((m / 60) * 10) / 10} h` : "niente ore"}${commits?.[c.day] ? ` · ${commits[c.day]} commit` : ""}`}</title>
              </rect>
              {commits?.[c.day] ? <circle cx={x + CELL / 2} cy={y + CELL / 2} r={2.2} fill="#0a84ff" /> : null}
            </g>
          );
        })}
      </svg>
      <p className="muted small" style={{ marginTop: 6 }}>
        Più scuro = più ore · <span style={{ color: "#0a84ff" }}>●</span> = giorno con commit
      </p>
    </div>
  );
}
