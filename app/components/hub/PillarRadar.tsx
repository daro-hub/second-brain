"use client";

export interface RadarPillar {
  key: string;
  label: string;
  color: string;
  score: number | null;
  trend: number | null;
}

const N = 5;
const C = 200;
const R = 120;
const pt = (i: number, f: number): [number, number] => {
  const a = (i / N) * Math.PI * 2 - Math.PI / 2;
  return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f];
};
const poly = (fracs: number[]) => fracs.map((f, i) => pt(i, f).join(",")).join(" ");

/**
 * Radar dei cinque pilastri: i vertici sono la navigazione, al centro vive l'orb (children).
 * `compact` toglie etichette e punteggi e riduce il disegno; il poligono resta leggibile.
 */
export function PillarRadar({
  pillars,
  active,
  compact,
  onSelect,
}: {
  pillars: RadarPillar[];
  active: string | null;
  compact: boolean;
  onSelect: (key: string) => void;
}) {
  const real = pillars.map((p) => Math.min(1.08, (p.score ?? 0) / 100));
  return (
    <div className={`hub-radar${compact ? " compact" : ""}`}>
      <svg viewBox="-70 -20 540 440" role="img" aria-label="Radar dei cinque pilastri">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={poly(pillars.map(() => f))} fill="none" stroke="rgba(120,170,220,0.16)" />
        ))}
        {pillars.map((p, i) => {
          const [x, y] = pt(i, 1);
          return <line key={p.key} x1={C} y1={C} x2={x} y2={y} stroke="rgba(120,170,220,0.16)" />;
        })}
        <polygon points={poly(pillars.map(() => 0.7))} fill="none" stroke="rgba(255,122,217,0.5)" strokeDasharray="4 4" />
        <polygon points={poly(real)} fill="rgba(77,225,255,0.14)" stroke="#4de1ff" strokeWidth="1.6" />
        {pillars.map((p, i) => {
          const [x, y] = pt(i, real[i]);
          const [hx, hy] = pt(i, 1);
          const [lx, ly] = pt(i, 1.3);
          const on = active === p.key;
          const anchor = lx < C - 8 ? "end" : lx > C + 8 ? "start" : "middle";
          return (
            <g key={p.key} className="hub-vertex" onClick={() => onSelect(p.key)} role="button" tabIndex={0} aria-label={`${p.label}${p.score === null ? ", nessun dato" : `, ${p.score} su 100`}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(p.key)}>
              <circle cx={hx} cy={hy} r="34" fill="transparent" />
              {p.score !== null && <circle cx={x} cy={y} r={on ? 8 : 5.5} fill={p.color} style={{ filter: on ? `drop-shadow(0 0 6px ${p.color})` : undefined }} />}
              {p.score === null && <circle cx={hx} cy={hy} r="4" fill="none" stroke={p.color} strokeDasharray="2 2" />}
              {!compact && (
                <>
                  <text x={lx} y={ly} textAnchor={anchor} fill={on ? p.color : "#8b98a8"} fontSize="13" letterSpacing="1.2">
                    {p.label.toUpperCase()}
                  </text>
                  <text x={lx} y={ly + 18} textAnchor={anchor} fill="#e6edf3" fontSize="17">
                    {p.score === null ? "n/d" : p.score}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
