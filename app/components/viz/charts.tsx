import { formatDayShort } from "../../../src/lib/time";
import type { ActivityDay } from "../../../src/lib/overview";

/* ───────────────────────── Heatmap attività (stile "contributi") ───────────────────────── */

const CAT = {
  weights: { color: "#0a84ff", label: "Pesi" },
  run: { color: "#bf5af2", label: "Corsa" },
  walk: { color: "#3cc7e0", label: "Camminata" },
  other: { color: "#8e8e93", label: "Altro" },
} as const;

type CatKey = keyof typeof CAT;
const MANY_STEPS = 8000;

export function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const CELL = 15;
  const GAP = 4;
  const LEFT = 22;
  const TOP = 20;
  const weeks = Math.ceil(days.length / 7);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);

  const monthLabels: { col: number; text: string }[] = [];
  let lastMonth = "";
  days.forEach((d, i) => {
    if (i % 7 !== 0) return;
    const month = d.dayKey.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      const [y, m] = d.dayKey.split("-").map(Number);
      monthLabels.push({
        col: i / 7,
        text: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("it-IT", { month: "short", timeZone: "UTC" }),
      });
    }
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <svg className="viz" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 560), maxWidth: width * 1.9 }}>
        {["L", "", "M", "", "V", "", "D"].map((t, i) => (
          <text key={i} x={0} y={TOP + i * (CELL + GAP) + CELL - 3} fontSize={9.5} fill="var(--muted)">
            {t}
          </text>
        ))}
        {monthLabels.map((m) => (
          <text key={m.col} x={LEFT + m.col * (CELL + GAP)} y={11} fontSize={10} fill="var(--muted)">
            {m.text}
          </text>
        ))}
        {days.map((d, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          // una giornata di molti passi conta come camminata anche senza uscite registrate (100 passi ≈ 1 minuto)
          const stepMin = d.steps && d.steps >= MANY_STEPS ? Math.round(d.steps / 100) : 0;
          const mins: Record<CatKey, number> = { weights: d.weights, run: d.run, walk: Math.max(d.walk, stepMin), other: d.other };
          const present = (Object.keys(mins) as CatKey[]).filter((k) => mins[k] > 0).sort((a, b) => mins[b] - mins[a]);
          const total = present.reduce((s, k) => s + mins[k], 0);
          const cx = LEFT + col * (CELL + GAP);
          const cy = TOP + row * (CELL + GAP);
          const stepsTip = d.steps ? ` · ${Math.round(d.steps).toLocaleString("it-IT")} passi` : "";
          const tip = present.length
            ? `${formatDayShort(d.dayKey)} · ${present.map((k) => (k === "walk" && stepMin > d.walk ? "Passi" : `${CAT[k].label} ${mins[k]} min`)).join(", ")}${stepsTip}`
            : `${formatDayShort(d.dayKey)} · nessuna attività registrata${stepsTip}`;
          if (!present.length) {
            return (
              <g key={d.dayKey}>
                <title>{tip}</title>
                <rect x={cx} y={cy} width={CELL} height={CELL} rx={4} fill="rgb(var(--ov) / 0.045)" />
              </g>
            );
          }
          const op = 0.38 + Math.min(total, 120) / 120 * 0.62;
          const main = CAT[present[0]].color;
          return (
            <g key={d.dayKey}>
              <title>{tip}</title>
              <rect x={cx} y={cy} width={CELL} height={CELL} rx={4} fill={main} fillOpacity={op} />
              {present[1] && (
                <rect x={cx + CELL / 2} y={cy + CELL / 2} width={CELL / 2} height={CELL / 2} rx={2} fill={CAT[present[1]].color} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {(Object.keys(CAT) as CatKey[]).slice(0, 3).map((k) => (
          <span key={k}>
            <i style={{ background: CAT[k].color }} />
            {CAT[k].label}
          </span>
        ))}
        <span className="muted">più il colore è pieno più ti sei mosso · casella vuota = nessun allenamento · azzurro anche per i giorni da oltre 8.000 passi · l&apos;angolino indica una seconda attività</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Linea/area generica ───────────────────────── */

export function AreaLine({
  points,
  color = "#0a84ff",
  height = 200,
  yFormat = (v) => String(Math.round(v)),
  xFormat = (v) => String(v),
  xTicks,
  markers = [],
  baseline,
  minWidth = 480,
}: {
  points: { x: number; y: number; label?: string }[];
  color?: string;
  height?: number;
  minWidth?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  xTicks?: number[];
  markers?: { x: number; y: number; label: string }[];
  baseline?: number;
}) {
  if (points.length < 2) return <p className="muted small">Servono almeno due punti per disegnare l&apos;andamento.</p>;
  const W = 720;
  const H = height;
  const L = 46;
  const R = 14;
  const T = 14;
  const B = 28;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const pad = (Math.max(...ys) - Math.min(...ys) || 1) * 0.12;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const sx = (v: number) => L + ((v - minX) / (maxX - minX || 1)) * (W - L - R);
  const sy = (v: number) => H - B - ((v - minY) / (maxY - minY || 1)) * (H - B - T);
  const line = points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
  const ticks = xTicks ?? [minX, (minX + maxX) / 2, maxX];
  const gid = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} style={{ minWidth }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[minY + pad, (minY + maxY) / 2, maxY - pad].map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="rgb(var(--ov) / 0.1)" />
            <text x={L - 8} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {baseline !== undefined && baseline > minY && baseline < maxY && (
          <line x1={L} x2={W - R} y1={sy(baseline)} y2={sy(baseline)} stroke={color} strokeOpacity={0.5} strokeDasharray="4 4" />
        )}
        {ticks.map((t, i) => (
          <text key={i} x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {xFormat(t)}
          </text>
        ))}
        <polygon points={`${sx(minX)},${H - B} ${line} ${sx(maxX)},${H - B}`} fill={`url(#${gid})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 60 &&
          points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={color}>
              <title>{`${p.label ?? ""} ${yFormat(p.y)}`}</title>
            </circle>
          ))}
        {markers.map((m, i) => (
          <g key={`m${i}`}>
            <title>{m.label}</title>
            <circle cx={sx(m.x)} cy={sy(m.y)} r={7} fill="none" stroke="#f5c542" strokeWidth={2} />
            <path transform={`translate(${sx(m.x) - 7} ${sy(m.y) - 28}) scale(0.58)`} d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v1.500A3 3 0 0 0 7.500 11M16 6h4v1.500A3 3 0 0 1 16.500 11M12 13v4M8.500 20h7M10 17h4" fill="none" stroke="#f5c542" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ───────────────────────── Barre raggruppate ───────────────────────── */

export function GroupedBars({
  categories,
  series,
  height = 220,
  unit = "",
  partialLabelIndex,
}: {
  categories: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  unit?: string;
  partialLabelIndex?: number;
}) {
  const W = 720;
  const H = height;
  const L = 44;
  const R = 10;
  const T = 14;
  const B = 28;
  const max = Math.max(...categories.flatMap((c) => c.values), 1) * 1.1;
  const gw = (W - L - R) / categories.length;
  const bw = Math.min(34, (gw - 14) / series.length);
  const sy = (v: number) => H - B - (v / max) * (H - B - T);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 420 }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={sy(max * f)} y2={sy(max * f)} stroke="rgb(var(--ov) / 0.1)" />
            <text x={L - 8} y={sy(max * f) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {categories.map((c, ci) => (
          <g key={ci}>
            {c.values.map((v, si) => {
              const bx = L + ci * gw + (gw - bw * series.length) / 2 + si * bw;
              return (
                <g key={si}>
                  <title>{`${c.label} · ${series[si].name}: ${Math.round(v)}${unit}${ci === partialLabelIndex ? " (giornata in corso)" : ""}`}</title>
                  <rect x={bx + 1} y={sy(v)} width={bw - 2} height={Math.max(H - B - sy(v), 0)} rx={5} fill={series[si].color} fillOpacity={ci === partialLabelIndex ? 0.5 : 0.9} />
                </g>
              );
            })}
            <text x={L + ci * gw + gw / 2} y={H - 9} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
              {c.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
