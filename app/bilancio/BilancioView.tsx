import { getEnergyOverview, type EnergyOverview } from "../../src/lib/energy";
import { addDays, formatDayShort, todayKey } from "../../src/lib/time";

const it = (n: number, d = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d });
const sgn = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${it(Math.abs(n))}`;

/** Peso reale (ultimi 60 giorni) e proiezione a 3 settimane con fascia d'incertezza. */
function WeightChart({ ov }: { ov: EnergyOverview }) {
  const today = todayKey();
  const W = 760;
  const H = 240;
  const padL = 44;
  const padR = 18;
  const histFrom = addDays(today, -60);
  const hist = ov.weights.filter((w) => w.dayKey >= histFrom);
  const span = 60 + 21;
  const dayIdx = (key: string) => Math.round((Date.parse(key) - Date.parse(histFrom)) / 86400000);
  const x = (idx: number) => padL + (idx / span) * (W - padL - padR);

  const proj = ov.projection;
  const vals = [...hist.map((h) => h.kg), ...(proj ? proj.weeks.flatMap((w) => [w.low, w.high]) : [ov.currentKg])];
  const min = Math.min(...vals) - 0.5;
  const max = Math.max(...vals) + 0.5;
  const y = (kg: number) => 20 + (1 - (kg - min) / (max - min)) * (H - 56);
  const todayX = x(60);

  const hLine = hist.map((h) => `${x(dayIdx(h.dayKey))},${y(h.kg)}`).join(" ");
  const band = proj
    ? [...proj.weeks.map((w) => `${x(60 + w.week * 7)},${y(w.high)}`), ...proj.weeks.slice().reverse().map((w) => `${x(60 + w.week * 7)},${y(w.low)}`)].join(" ")
    : "";
  const pLine = proj ? proj.weeks.map((w) => `${x(60 + w.week * 7)},${y(w.kg)}`).join(" ") : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label="Peso e proiezione">
      {[0, 0.5, 1].map((f) => {
        const v = min + (max - min) * f;
        return (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(120,170,220,0.1)" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fontFamily="var(--mono)" fill="var(--muted)">
              {it(v, 1)}
            </text>
          </g>
        );
      })}
      <line x1={todayX} x2={todayX} y1="10" y2={H - 30} stroke="#0a84ff" strokeDasharray="3 4" opacity="0.6" />
      <text x={todayX} y="8" textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="#0a84ff">
        OGGI
      </text>
      {proj && <polygon points={band} fill="rgba(255, 55, 95,0.14)" />}
      {hist.length > 1 && <polyline points={hLine} fill="none" stroke="#0a84ff" strokeWidth="2" style={{ filter: "drop-shadow(0 0 5px rgba(10, 132, 255,0.7))" }} />}
      {hist.map((h) => (
        <circle key={h.dayKey} cx={x(dayIdx(h.dayKey))} cy={y(h.kg)} r="3" fill="#0a84ff">
          <title>{`${formatDayShort(h.dayKey)}: ${it(h.kg, 1)} kg`}</title>
        </circle>
      ))}
      {proj && <polyline points={pLine} fill="none" stroke="#ff375f" strokeWidth="2" strokeDasharray="5 5" />}
      {proj &&
        proj.weeks.map((w) => (
          <g key={w.week}>
            <circle cx={x(60 + w.week * 7)} cy={y(w.kg)} r="3.4" fill="#ff375f" />
            {w.week > 0 && (
              <text x={x(60 + w.week * 7)} y={y(w.kg) - 9} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="#ffd2f2">
                {it(w.kg, 1)}
              </text>
            )}
          </g>
        ))}
      {[0, 7, 14, 21].map((d) => (
        <text key={d} x={x(60 + d)} y={H - 10} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="var(--muted)">
          {d === 0 ? "oggi" : `+${d / 7} sett`}
        </text>
      ))}
      <text x={x(0)} y={H - 10} fontSize="9" fontFamily="var(--mono)" fill="var(--muted)">
        {formatDayShort(histFrom)}
      </text>
    </svg>
  );
}

export async function BilancioView() {
  const ov = await getEnergyOverview(30);
  const today = todayKey();

  const recent = ov.weights.filter((w) => w.dayKey >= addDays(today, -30));
  const change = recent.length >= 2 ? ov.currentKg - recent[0].kg : null;
  const complete = ov.days.filter((d) => d.logged && !d.isToday && d.intake !== null);
  const avg = (f: (d: (typeof complete)[number]) => number) => (complete.length ? complete.reduce((a, d) => a + f(d), 0) / complete.length : null);
  const eaten = avg((d) => d.intake as number);
  const burned = avg((d) => d.expenditure);

  return (
    <>
      <div className="hud-tiles">
        <div className="tile" style={{ ["--t" as string]: "#0a84ff" }}>
          <div className="t-lbl">Peso attuale</div>
          <div className="t-val">{it(ov.currentKg, 1)}<small>kg</small></div>
          <div className="t-sub">{change === null ? "servono due pesate nell'ultimo mese" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${it(Math.abs(change), 1)} kg negli ultimi 30 giorni`}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff9f0a" }}>
          <div className="t-lbl">Calorie · media 30 gg</div>
          <div className="t-val">{eaten === null ? "—" : it(eaten)}<small>mangiate</small></div>
          <div className="t-sub">{burned === null ? "nessun giorno completo" : `${it(burned)} bruciate (basale + passi + allenamento) su ${complete.length} giorni`}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#bf5af2" }}>
          <div className="t-lbl">Bilancio medio</div>
          <div className="t-val">{ov.month.avgDeficit === null ? "—" : sgn(ov.month.avgDeficit)}<small>kcal/giorno</small></div>
          <div className="t-sub">{ov.month.avgDeficit === null ? "senza dati" : ov.month.avgDeficit >= 0 ? "deficit: consumi più di quanto mangi" : "surplus: mangi più di quanto consumi"}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff375f" }}>
          <div className="t-lbl">Tra 3 settimane</div>
          <div className="t-val">{ov.projection ? it(ov.projection.endKg, 1) : "—"}<small>kg</small></div>
          <div className="t-sub">{ov.projection ? `${ov.projection.lossKg >= 0 ? "−" : "+"}${it(Math.abs(ov.projection.lossKg), 1)} kg se continui così` : "senza dati sufficienti"}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Peso e proiezione</h3>
          <span className="muted small">blu = pesate · rosa tratteggiato = proiezione con la media calorica dell&apos;ultimo mese (fascia ±25%)</span>
        </div>
        <WeightChart ov={ov} />
      </div>
    </>
  );
}
