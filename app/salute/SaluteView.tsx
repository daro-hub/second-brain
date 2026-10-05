import Link from "next/link";
import { getLatestWeightKg } from "../../src/lib/health";
import { getEnergyWeek } from "../../src/lib/insights";
import { clock, dec, int, signed } from "../../src/lib/numfmt";
import { getDayBundle } from "../../src/lib/overview";
import { addDays, formatDayLong, localHourDecimal, todayKey, weekdayShort } from "../../src/lib/time";
import { AreaLine, GroupedBars } from "../components/viz/charts";
import { CollectProgress, MacroBar, Ring } from "../components/viz/small";

const PROTEIN_LOW = 1.6;
const PROTEIN_HIGH = 2.2;

export async function SaluteView({ date }: { date?: string }) {
  const today = todayKey();
  const dayKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;

  const [bundle, energyWeek, weight] = await Promise.all([
    getDayBundle(dayKey),
    getEnergyWeek(7),
    getLatestWeightKg().catch(() => null),
  ]);
  const { nutrition, energy, steps, hr, night } = bundle;

  const proteinPerKg = weight ? nutrition.proteinG / weight.kg : null;
  const lowT = weight ? Math.round(weight.kg * PROTEIN_LOW) : null;
  const highT = weight ? Math.round(weight.kg * PROTEIN_HIGH) : null;

  return (
    <>
      <div className="eyebrow">Salute</div>
      <h2>Alimentazione, energia, cuore</h2>
      <p className="page-sub">Dati da Apple Health (Yazio per i pasti, Zepp Life per battito e passi).</p>

      <div className="daynav">
        <Link href={`/?p=salute&detail=1&date=${addDays(dayKey, -1)}`}>← Ieri</Link>
        <div className="label">{formatDayLong(dayKey)}</div>
        <Link href="/?p=salute&detail=1" className={dayKey === today ? "disabled" : ""}>
          Oggi
        </Link>
        <Link href={`/?p=salute&detail=1&date=${addDays(dayKey, 1)}`} className={dayKey >= today ? "disabled" : ""}>
          Domani →
        </Link>
      </div>

      <div className="grid grid-kpi">
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-nutrition)" }}>
          <div className="kpi-top"><span>🍽 Assunte</span></div>
          <div className="kpi-value">{int(nutrition.kcalIn)}<small>kcal</small></div>
          <div className="kpi-sub">{nutrition.meals.length} {nutrition.meals.length === 1 ? "pasto" : "pasti"} registrati</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "#ff8a5c" }}>
          <div className="kpi-top"><span>🔥 Bruciate</span></div>
          <div className="kpi-value">{int(energy.burnedKcal)}<small>kcal</small></div>
          <div className="kpi-sub">basale {int(energy.basalKcal)} + attività {int(energy.activeKcal)}{bundle.isToday ? " · giornata in corso" : ""}</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: energy.balanceKcal > 0 ? "var(--c-warn)" : "var(--c-good)" }}>
          <div className="kpi-top"><span>⚖️ Bilancio</span></div>
          <div className="kpi-value">{signed(energy.balanceKcal)}<small>kcal</small></div>
          <div className="kpi-sub">{bundle.isToday ? "Provvisorio: il dispendio cresce fino a sera." : energy.balanceKcal > 0 ? "Surplus calorico" : "Deficit calorico"}</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-steps)" }}>
          <div className="kpi-top"><span>👟 Passi</span></div>
          <div className="kpi-value">{int(steps.total)}</div>
          <div className="kpi-sub">{hr.avg ? `FC media ${int(hr.avg)} bpm (min ${int(hr.min ?? 0)}, max ${int(hr.max ?? 0)})` : "Nessun dato di battito"}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Macronutrienti</h3><span className="muted small">ripartizione delle calorie</span></div>
          <MacroBar proteinG={nutrition.proteinG} carbsG={nutrition.carbsG} fatG={nutrition.fatG} />
          <hr className="sep" />
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <Ring
              value={nutrition.proteinG}
              max={lowT ?? Math.max(nutrition.proteinG, 1)}
              color="#ff8a5c"
              size={92}
              label={proteinPerKg ? dec(proteinPerKg, 2) : `${int(nutrition.proteinG)} g`}
              sub={proteinPerKg ? "g/kg" : undefined}
            />
            <div className="small" style={{ lineHeight: 1.55 }}>
              {lowT && highT ? (
                <>
                  <b>Proteine: {int(nutrition.proteinG)} g</b> su un obiettivo di <b>{lowT}–{highT} g</b> (1,6–2,2 g/kg × {dec(weight!.kg)} kg).
                  {nutrition.proteinG < lowT && bundle.isToday ? ` Mancano almeno ${int(lowT - nutrition.proteinG)} g.` : ""}
                  {weight!.source === "knowledge_base" && <span className="muted"> Peso preso dalla tua nota profilo: arriverà da Apple Health con lo storico.</span>}
                </>
              ) : (
                "Serve il peso corporeo (Apple Health) per rapportare le proteine ai kg."
              )}
            </div>
          </div>
          <hr className="sep" />
          <div className="small muted">
            Fibre <b style={{ color: "var(--text)" }}>{int(nutrition.fiberG)} g</b> · zuccheri <b style={{ color: "var(--text)" }}>{int(nutrition.sugarG)} g</b>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Pasti</h3></div>
          {nutrition.meals.length === 0 ? (
            <p className="muted small">Nessun pasto sincronizzato da Yazio per questo giorno.</p>
          ) : (
            nutrition.meals.map((m, i) => (
              <div className="agenda-row" key={i}>
                <span className="swatch" style={{ background: "var(--c-nutrition)" }} />
                <span className="time">{clock(localHourDecimal(m.at))}</span>
                <span>
                  <b>{int(m.kcal)} kcal</b>
                  <span className="muted small"> · P {int(m.proteinG)} g · C {int(m.carbsG)} g · G {int(m.fatG)} g</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>🌙 Notte</h3><span className="muted small">23:00 → 07:00</span></div>
          {night.points.length > 1 ? (
            <>
              <AreaLine
                points={night.points.map((p) => ({ x: p.hour, y: p.avg, label: clock((p.hour + 24) % 24) }))}
                color="#ff5d73"
                height={190}
                yFormat={(v) => `${Math.round(v)}`}
                xFormat={(v) => clock((v + 24) % 24)}
                xTicks={[-1, 1, 3, 5, 7]}
                baseline={night.resting ?? undefined}
              />
              <p className="small" style={{ margin: "10px 0 0", lineHeight: 1.55 }}>
                FC a riposo <b>{night.resting ? int(night.resting) : "—"} bpm</b> (media del 10% più basso dei valori, linea tratteggiata) · media notte{" "}
                <b>{night.avg ? int(night.avg) : "—"} bpm</b>.
              </p>
            </>
          ) : (
            <p className="muted small">Nessun dato di battito per la notte che precede questo giorno.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Bilancio energetico — ultimi 7 giorni</h3></div>
          <GroupedBars
            categories={energyWeek.days.map((d) => ({ label: weekdayShort(d.dayKey), values: [d.kcalIn, d.kcalOut] }))}
            series={[
              { name: "Assunte", color: "#f5a524" },
              { name: "Bruciate", color: "#7aa2ff" },
            ]}
            unit=" kcal"
            partialLabelIndex={energyWeek.days.findIndex((d) => d.isToday)}
            height={210}
          />
          {!energyWeek.gate.ready && (
            <div className="collecting-note">
              <CollectProgress have={energyWeek.gate.have} need={energyWeek.gate.need} unit={energyWeek.gate.unit} />
              <div style={{ marginTop: 8 }}>
                Il bilancio settimanale diventa significativo con almeno 3 giorni completi (assunte + bruciate). Oggi è ancora in corso (barre sfumate).
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
