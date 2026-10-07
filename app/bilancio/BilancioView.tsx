import { getLifeBalance } from "../../src/lib/balance";
import { getEnergyOverview, PROFILE, type EnergyDay, type EnergyOverview } from "../../src/lib/energy";
import { addDays, formatDayShort, todayKey, weekdayShort } from "../../src/lib/time";
import { RadarChart } from "../components/viz/RadarChart";
import { InsightGlyph } from "../components/Icon";

const it = (n: number, d = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d });
const sgn = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${it(Math.abs(n))}`;

/** Barre divergenti: sopra la linea il deficit (hai mangiato meno di quanto consumi), sotto il surplus. */
function DeficitBars({ days }: { days: EnergyDay[] }) {
  const W = 760;
  const H = 230;
  const mid = 120;
  const bw = W / days.length;
  const maxAbs = Math.max(800, ...days.map((d) => Math.abs(d.deficit ?? 0)));
  const scale = 95 / maxAbs;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label="Deficit calorico giornaliero">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="rgba(120,170,220,0.4)" />
      {[500, 1000].filter((v) => v <= maxAbs).map((v) => (
        <g key={v}>
          <line x1="0" x2={W} y1={mid - v * scale} y2={mid - v * scale} stroke="rgba(120,170,220,0.1)" strokeDasharray="3 5" />
          <text x="2" y={mid - v * scale - 3} fontSize="9" fill="#5a6677" fontFamily="var(--mono)">+{v}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const def = d.deficit;
        const h = def === null ? 0 : Math.abs(def) * scale;
        const up = (def ?? 0) >= 0;
        const color = up ? "#3ecf8e" : "#f5a524";
        return (
          <g key={d.dayKey}>
            <title>
              {`${formatDayShort(d.dayKey)} — ${def === null ? "pasti non registrati" : `${up ? "deficit" : "surplus"} ${it(Math.abs(def))} kcal`}\nmangiate ${d.intake ? it(d.intake) : "—"} · fabbisogno ${it(d.expenditure)} (passi ${sgn(d.stepsAdj)}, allenamento ${sgn(d.trainingAdj)})`}
            </title>
            {def === null ? (
              <rect x={x} y={mid - 3} width={w} height={6} rx="2" fill="none" stroke="#5a6677" strokeDasharray="2 2" />
            ) : (
              <rect
                x={x}
                y={up ? mid - h : mid}
                width={w}
                height={Math.max(2, h)}
                rx="3"
                fill={color}
                fillOpacity={d.isToday ? 0.35 : 0.8}
                stroke={d.isToday ? color : "none"}
                strokeDasharray={d.isToday ? "3 3" : undefined}
                style={{ filter: d.isToday ? undefined : `drop-shadow(0 0 5px ${color}88)` }}
              />
            )}
            {def !== null && (
              <text x={x + w / 2} y={up ? mid - h - 5 : mid + h + 11} textAnchor="middle" fontSize="9.5" fontFamily="var(--mono)" fill="#e6edf3">
                {sgn(def)}
              </text>
            )}
            <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill={d.isToday ? "#4de1ff" : "#5a6677"}>
              {weekdayShort(d.dayKey).slice(0, 3)} {d.dayKey.slice(8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

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
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fontFamily="var(--mono)" fill="#5a6677">
              {it(v, 1)}
            </text>
          </g>
        );
      })}
      <line x1={todayX} x2={todayX} y1="10" y2={H - 30} stroke="#4de1ff" strokeDasharray="3 4" opacity="0.6" />
      <text x={todayX} y="8" textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="#4de1ff">
        OGGI
      </text>
      {proj && <polygon points={band} fill="rgba(255,122,217,0.14)" />}
      {hist.length > 1 && <polyline points={hLine} fill="none" stroke="#4de1ff" strokeWidth="2" style={{ filter: "drop-shadow(0 0 5px rgba(77,225,255,0.7))" }} />}
      {hist.map((h) => (
        <circle key={h.dayKey} cx={x(dayIdx(h.dayKey))} cy={y(h.kg)} r="3" fill="#4de1ff">
          <title>{`${formatDayShort(h.dayKey)}: ${it(h.kg, 1)} kg`}</title>
        </circle>
      ))}
      {proj && <polyline points={pLine} fill="none" stroke="#ff7ad9" strokeWidth="2" strokeDasharray="5 5" />}
      {proj &&
        proj.weeks.map((w) => (
          <g key={w.week}>
            <circle cx={x(60 + w.week * 7)} cy={y(w.kg)} r="3.4" fill="#ff7ad9" />
            {w.week > 0 && (
              <text x={x(60 + w.week * 7)} y={y(w.kg) - 9} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="#ffd2f2">
                {it(w.kg, 1)}
              </text>
            )}
          </g>
        ))}
      {[0, 7, 14, 21].map((d) => (
        <text key={d} x={x(60 + d)} y={H - 10} textAnchor="middle" fontSize="9" fontFamily="var(--mono)" fill="#5a6677">
          {d === 0 ? "oggi" : `+${d / 7} sett`}
        </text>
      ))}
      <text x={x(0)} y={H - 10} fontSize="9" fontFamily="var(--mono)" fill="#5a6677">
        {formatDayShort(histFrom)}
      </text>
    </svg>
  );
}

export async function BilancioView() {
  const [ov, balance] = await Promise.all([getEnergyOverview(30), getLifeBalance()]);
  const t = ov.today;
  const left = t.logged ? t.expenditure - (t.intake as number) : null;
  const last14 = ov.days.slice(-14);
  const rel = { bassa: "var(--c-warn)", media: "var(--accent)", buona: "var(--c-good)" }[ov.reliability];

  return (
    <>
      <div className="eyebrow">Bilancio energetico</div>
      <h2>Deficit, fabbisogno e proiezione</h2>
      <p className="page-sub">
        Fabbisogno = quanto consumi a zero attività ({it(PROFILE.restingKcal)} kcal, giornata in casa a lavorare e studiare) più, ogni giorno, i passi e
        l&apos;allenamento reali. Confrontato con le calorie registrate da Yazio. È una stima, non una misura.
      </p>

      <div className="hud-tiles">
        <div className="tile" style={{ ["--t" as string]: "#3ecf8e" }}>
          <div className="t-lbl">Oggi (finora)</div>
          <div className="t-val">{left === null ? "—" : sgn(left)}<small>kcal</small></div>
          <div className="t-sub">{left === null ? "nessun pasto registrato" : left >= 0 ? "margine rimasto prima del fabbisogno" : "oltre il fabbisogno"}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#4de1ff" }}>
          <div className="t-lbl">Ultimi 7 giorni</div>
          <div className="t-val">{ov.week.days ? sgn(ov.week.deficit) : "—"}<small>kcal</small></div>
          <div className="t-sub">{ov.week.days ? `${ov.week.deficit >= 0 ? "deficit" : "surplus"} su ${ov.week.days} giorni registrati` : "servono giorni completi"}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#b78cff" }}>
          <div className="t-lbl">Media giornaliera · 30 gg</div>
          <div className="t-val">{ov.month.avgDeficit === null ? "—" : sgn(ov.month.avgDeficit)}<small>kcal/giorno</small></div>
          <div className="t-sub">su {ov.month.days} giorni completi</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff7ad9" }}>
          <div className="t-lbl">Tra 3 settimane</div>
          <div className="t-val">{ov.projection ? it(ov.projection.endKg, 1) : "—"}<small>kg</small></div>
          <div className="t-sub">{ov.projection ? `${ov.projection.lossKg >= 0 ? "−" : "+"}${it(Math.abs(ov.projection.lossKg), 1)} kg dai ${it(ov.currentKg, 1)} attuali` : "senza dati sufficienti"}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: rel }}>
          <div className="t-lbl">Affidabilità stima</div>
          <div className="t-val" style={{ fontSize: 20, textTransform: "uppercase" }}>{ov.reliability}</div>
          <div className="t-sub">{ov.month.days} giorni di dati</div>
        </div>
      </div>

      <div className="grid grid-12" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Deficit giornaliero · 14 giorni</h3>
            <span className="muted small">verde = deficit · arancio = surplus · tratteggio = pasti non registrati</span>
          </div>
          <DeficitBars days={last14} />
        </div>

        <div className="card">
          <div className="card-head"><h3>Come ho calcolato oggi</h3></div>
          <table>
            <tbody>
              <tr><td>A zero attività</td><td style={{ textAlign: "right" }}><b>{it(PROFILE.restingKcal)}</b></td></tr>
              <tr><td>Passi ({it(t.steps)}, oltre {it(PROFILE.baselineSteps)} di base)</td><td style={{ textAlign: "right" }}><b>{sgn(t.stepsAdj)}</b></td></tr>
              <tr><td>Allenamento ({t.trainingMin} min)</td><td style={{ textAlign: "right" }}><b>{sgn(t.trainingAdj)}</b></td></tr>
              <tr><td><b>Fabbisogno stimato</b></td><td style={{ textAlign: "right" }}><b className="hud-num">{it(t.expenditure)}</b></td></tr>
              <tr><td>Calorie mangiate (Yazio)</td><td style={{ textAlign: "right" }}><b>{t.intake ? it(t.intake) : "—"}</b></td></tr>
              <tr><td><b>{t.deficit !== null && t.deficit < 0 ? "Surplus" : "Deficit"} se la giornata finisse ora</b></td><td style={{ textAlign: "right" }}><b className="hud-num" style={{ color: (t.deficit ?? 0) >= 0 ? "var(--c-good)" : "var(--c-warn)" }}>{t.deficit === null ? "—" : sgn(Math.abs(t.deficit))}</b></td></tr>
            </tbody>
          </table>
          <div className="note">Oggi non è finito: cena e spuntini non ancora registrati abbassano il deficit finale.</div>
        </div>
      </div>

      <div className="grid grid-12" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Peso e proiezione</h3>
            <span className="muted small">stessa media dell&apos;ultimo mese per 3 settimane · fascia = ±25% di incertezza</span>
          </div>
          <WeightChart ov={ov} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Insight</h3></div>
          <ul className="insight-list">
            {ov.insights.map((i, k) => (
              <li key={k} className={i.tone}><span className="ic"><InsightGlyph glyph={i.icon} /></span><span>{i.text}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="card">
          <div className="card-head">
            <h3>Equilibrio della settimana</h3>
            <span className="muted small">{balance.index !== null ? `indice ${balance.index}/100` : "dati insufficienti"} · tratteggio = 70</span>
          </div>
          <RadarChart axes={balance.axes.map((a) => ({ label: a.label, value: a.score }))} />
          <ul className="insight-list" style={{ marginTop: 12 }}>
            {balance.insights.map((i, k) => (
              <li key={k} className={i.tone}><span className="ic"><InsightGlyph glyph={i.icon} /></span><span>{i.text}</span></li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-head"><h3>Da dove vengono i punteggi</h3></div>
          <table>
            <thead><tr><th>Asse</th><th>Punti</th><th>Dettaglio</th></tr></thead>
            <tbody>
              {balance.axes.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  <td><b className="hud-num">{a.score ?? "n/d"}</b></td>
                  <td className="muted small">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            Ipotesi del modello (modificabili in <code>src/lib/energy.ts</code> e <code>src/lib/balance.ts</code>): {it(PROFILE.kcalPerStep, 3)} kcal per passo, {it(PROFILE.kcalPerKgFat)} kcal per kg di grasso,
            giorni con meno di {it(PROFILE.minLoggedKcal)} kcal registrate esclusi dal calcolo, camminate Strava non contate due volte.
          </div>
        </div>
      </div>
    </>
  );
}
