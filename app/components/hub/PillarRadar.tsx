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
 * Radar dei cinque pilastri: i vertici sono la navigazione (al centro vive l'orb, posizionato dallo stage).
 * Passando sopra un pilastro si anima: il suo settore si illumina, l'asse si accende, il punto pulsa e
 * l'etichetta si ingrandisce; gli altri pilastri si attenuano (stili `.hub-vertex` in globals.css).
 */
export function PillarRadar({
  pillars,
  active,
  onSelect,
}: {
  pillars: RadarPillar[];
  active: string | null;
  onSelect: (key: string) => void;
}) {
  const real = pillars.map((p) => Math.min(1.08, (p.score ?? 0) / 100));
  return (
    <div className="hub-radar">
      <svg viewBox="-10 24 420 352" role="img" aria-label="Radar dei cinque pilastri">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={poly(pillars.map(() => f))} fill="none" stroke="rgba(120,170,220,0.16)" />
        ))}
        <polygon points={poly(pillars.map(() => 0.7))} fill="none" stroke="rgba(255,122,217,0.5)" strokeDasharray="4 4" />
        <polygon points={poly(real)} fill="rgba(77,225,255,0.14)" stroke="#4de1ff" strokeWidth="1.6" />
        {pillars.map((p, i) => {
          const [x, y] = pt(i, real[i]);
          const [hx, hy] = pt(i, 1);
          const [lx, ly] = pt(i, 1.3);
          const [ax, ay] = pt(i - 0.5, 1);
          const [bx, by] = pt(i + 0.5, 1);
          const [mx, my] = pt(i, 1.15);
          const anchor = lx < C - 8 ? "end" : lx > C + 8 ? "start" : "middle";
          // larghezza stimata dell'etichetta già ingrandita (×1.25): l'area sensibile la copre tutta anche da animata
          const labelW = p.label.length * 9.8 * 1.25;
          const labelX0 = anchor === "end" ? lx - labelW : anchor === "middle" ? lx - labelW / 2 : lx;
          return (
            <g
              key={p.key}
              className={`hub-vertex${active === p.key ? " on" : ""}`}
              style={{ ["--pc" as string]: p.color }}
              onClick={() => onSelect(p.key)}
              role="button"
              tabIndex={0}
              aria-label={`${p.label}${p.score === null ? ", nessun dato" : `, ${p.score} su 100`}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(p.key)}
            >
              <polygon className="v-wedge" points={`${C},${C} ${ax},${ay} ${hx},${hy} ${bx},${by}`} />
              <line className="v-line" x1={C} y1={C} x2={hx} y2={hy} />
              {/* Area sensibile FISSA (settore + cerchio su vertice ed etichetta): non si anima mai, altrimenti
                  ingrandire l'etichetta spostava i punti validi e l'hover si accendeva e spegneva a scatti. */}
              <polygon className="v-hit" points={`${C},${C} ${ax},${ay} ${hx},${hy} ${bx},${by}`} />
              <circle className="v-hit" cx={mx} cy={my} r="62" />
              <rect className="v-hit" x={labelX0 - 8} y={ly - 20} width={labelW + 16} height={50} />
              <circle className="v-ring" cx={p.score === null ? hx : x} cy={p.score === null ? hy : y} r="7" />
              {p.score !== null ? (
                <circle className="v-dot" cx={x} cy={y} r="5.5" />
              ) : (
                <circle className="v-dot empty" cx={hx} cy={hy} r="4" />
              )}
              <text className="v-label" x={lx} y={ly} textAnchor={anchor} fontSize="13" letterSpacing="1.2">
                {p.label.toUpperCase()}
              </text>
              <text className="v-score" x={lx} y={ly + 18} textAnchor={anchor} fontSize="17">
                {p.score === null ? "n/d" : p.score}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
