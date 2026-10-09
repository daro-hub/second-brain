import type { ReactNode } from "react";

/** Anello di progresso: value/max, con etichetta al centro. */
export function Ring({
  value,
  max,
  size = 84,
  stroke = 9,
  color = "var(--accent)",
  label,
  sub,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: ReactNode;
  sub?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ov) / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1.1,
        }}
      >
        <div style={{ fontWeight: 750, fontSize: size * 0.22 }}>{label}</div>
        {sub && <div style={{ fontSize: size * 0.13, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Mini-grafico a linea per i KPI. */
export function Sparkline({
  values,
  color = "var(--accent)",
  width = 120,
  height = 34,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={color} fillOpacity={0.14} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

/** Ripartizione calorica dei macronutrienti (proteine/carboidrati 4 kcal/g, grassi 9 kcal/g). */
export function MacroBar({ proteinG, carbsG, fatG }: { proteinG: number; carbsG: number; fatG: number }) {
  const p = proteinG * 4;
  const c = carbsG * 4;
  const f = fatG * 9;
  const tot = p + c + f;
  if (tot <= 0) return <p className="muted small">Nessun pasto registrato.</p>;
  const parts = [
    { name: "Proteine", g: proteinG, kcal: p, color: "#ff8a5c" },
    { name: "Carboidrati", g: carbsG, kcal: c, color: "#f5c542" },
    { name: "Grassi", g: fatG, kcal: f, color: "#0a84ff" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        {parts.map((x) => (
          <div key={x.name} title={`${x.name}: ${Math.round(x.g)} g`} style={{ width: `${(x.kcal / tot) * 100}%`, background: x.color }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
        {parts.map((x) => (
          <div key={x.name}>
            <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 9, height: 9, borderRadius: 3, background: x.color, display: "inline-block" }} />
              {x.name}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>
              {Math.round(x.g)}
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}> g · {Math.round((x.kcal / tot) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barra "dati in raccolta": quanti dati ci sono rispetto a quelli necessari per l'analisi. */
export function CollectProgress({ have, need, unit }: { have: number; need: number; unit: string }) {
  const frac = Math.min(1, need > 0 ? have / need : 0);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
        <span>
          {have} / {need} {unit}
        </span>
        <span>{Math.round(frac * 100)}%</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(frac * 100, have > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  );
}
