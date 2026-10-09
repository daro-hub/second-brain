export interface RadarAxis {
  label: string;
  /** 0-100; null = nessun dato (asse disegnato ma senza punto) */
  value: number | null;
  caption?: string;
}

/**
 * Radar generico a N assi (stesso linguaggio visivo del bilanciamento muscolare): area piena = valori
 * reali, tratteggio = obiettivo. Serve a vedere a colpo d'occhio se stai spingendo troppo da una parte.
 */
export function RadarChart({ axes, target = 70, size = 300 }: { axes: RadarAxis[]; target?: number; size?: number }) {
  const n = axes.length;
  const c = 130;
  const R = 88;
  const pt = (i: number, frac: number): [number, number] => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(a) * R * frac, c + Math.sin(a) * R * frac];
  };
  const poly = (fracs: number[]) => fracs.map((f, i) => pt(i, f).join(",")).join(" ");
  const real = axes.map((a) => Math.min(1.1, (a.value ?? 0) / 100));

  return (
    <svg className="radar" viewBox="-40 -6 340 272" style={{ maxWidth: size }} role="img" aria-label="Radar di equilibrio">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={poly(axes.map(() => f))} fill="none" stroke="rgba(120,170,220,0.18)" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1);
        return <line key={a.label} x1={c} y1={c} x2={x} y2={y} stroke="rgba(120,170,220,0.18)" />;
      })}
      <polygon points={poly(axes.map(() => target / 100))} fill="none" stroke="rgba(255, 55, 95,0.7)" strokeDasharray="4 4" />
      <polygon points={poly(real)} fill="rgba(10, 132, 255,0.2)" stroke="#0a84ff" strokeWidth="1.6" style={{ filter: "drop-shadow(0 0 6px rgba(10, 132, 255,0.7))" }} />
      {axes.map((a, i) => {
        const [x, y] = pt(i, real[i]);
        const [lx, ly] = pt(i, 1.2);
        const anchor = lx < c - 8 ? "end" : lx > c + 8 ? "start" : "middle";
        return (
          <g key={a.label}>
            {a.value !== null && <circle cx={x} cy={y} r="3" fill="#0a84ff" />}
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
              {a.label.toUpperCase()}
            </text>
            <text x={lx} y={ly + 11} textAnchor={anchor} dominantBaseline="middle" style={{ fill: a.value === null ? "#5a6677" : "#e6edf3", fontSize: 10 }}>
              {a.value === null ? "n/d" : a.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
