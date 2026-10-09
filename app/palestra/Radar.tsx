import type { MuscleStat } from "../../src/lib/training";

/** Bilanciamento del volume tra gruppi muscolari: area piena = quota reale, tratteggio = equilibrio ideale (1/N). */
export function Radar({ muscles }: { muscles: MuscleStat[] }) {
  const n = muscles.length;
  const c = 130;
  const R = 92;
  const ideal = 1 / n;
  const max = Math.max(ideal * 1.6, ...muscles.map((m) => m.share));
  const pt = (i: number, frac: number): [number, number] => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(a) * R * frac, c + Math.sin(a) * R * frac];
  };
  const poly = (fracs: number[]) => fracs.map((f, i) => pt(i, f).join(",")).join(" ");
  const real = muscles.map((m) => Math.min(1, m.share / max));
  const idealPoly = muscles.map(() => ideal / max);

  return (
    <svg className="radar" viewBox="-36 0 332 260" role="img" aria-label="Bilanciamento del volume tra gruppi muscolari">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={poly(muscles.map(() => f))} fill="none" stroke="rgb(var(--ov) / 0.18)" />
      ))}
      {muscles.map((m, i) => {
        const [x, y] = pt(i, 1);
        return <line key={m.group} x1={c} y1={c} x2={x} y2={y} stroke="rgb(var(--ov) / 0.18)" />;
      })}
      <polygon points={poly(idealPoly)} fill="none" stroke="rgba(255, 55, 95,0.7)" strokeDasharray="4 4" />
      <polygon points={poly(real)} fill="rgba(10, 132, 255,0.2)" stroke="#0a84ff" strokeWidth="1.6" style={{ filter: "drop-shadow(0 0 6px rgba(10, 132, 255,0.7))" }} />
      {muscles.map((m, i) => {
        const [x, y] = pt(i, real[i]);
        const [lx, ly] = pt(i, 1.2);
        const anchor = lx < c - 8 ? "end" : lx > c + 8 ? "start" : "middle";
        return (
          <g key={m.group}>
            <circle cx={x} cy={y} r="3" fill="#0a84ff" />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
              {m.label.toUpperCase()}
            </text>
            <text x={lx} y={ly + 11} textAnchor={anchor} dominantBaseline="middle" style={{ fill: "var(--text)", fontSize: 10 }}>
              {Math.round(m.share * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
