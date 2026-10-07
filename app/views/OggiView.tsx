import Link from "next/link";
import { getLatestWeightKg } from "../../src/lib/health";
import { clock, dec, int, signed } from "../../src/lib/numfmt";
import { getDayBundle, getWeekStrip } from "../../src/lib/overview";
import { formatDayLong, localHourDecimal, todayKey } from "../../src/lib/time";
import { getNextRoutineToTrain } from "../../src/lib/workouts";
import { Icon } from "../components/Icon";
import { DayTimeline } from "../components/viz/DayTimeline";
import { Ring, Sparkline } from "../components/viz/small";

const PROTEIN_G_PER_KG_TARGET = 1.6; // soglia inferiore dell'intervallo 1,6–2,2 g/kg per chi si allena con i pesi

function greeting(): string {
  const h = localHourDecimal(new Date());
  return h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

const swatch = { studio: "var(--c-study)", lezione: "var(--c-lesson)" } as const;

export async function OggiView() {
  const today = todayKey();
  const [bundle, week, weight, routine] = await Promise.all([
    getDayBundle(today),
    getWeekStrip(today, 7),
    getLatestWeightKg().catch(() => null),
    getNextRoutineToTrain().catch(() => null),
  ]);

  const { nutrition, energy, steps, night, hr } = bundle;
  const proteinTarget = weight ? Math.round(weight.kg * PROTEIN_G_PER_KG_TARGET) : null;
  const stepsDays = week.filter((d) => d.steps > 0 && d.dayKey !== today);
  const stepsAvg = stepsDays.length ? stepsDays.reduce((a, d) => a + d.steps, 0) / stepsDays.length : null;
  const todaySessions = bundle.activities.filter((a) => a.movingTimeMin > 0);
  const nightSpark = night.points.map((p) => p.avg);

  return (
    <>
      <div className="eyebrow">{formatDayLong(today)}</div>
      <h2>{greeting()}, Daro</h2>
      <p className="page-sub">
        Tutto il tuo giorno su un unico asse: battito, passi, pasti, lezioni e allenamenti. I dati si aggiornano a ogni
        sincronizzazione dell&apos;iPhone.
      </p>

      <div className="grid grid-kpi">
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-nutrition)" }}>
          <div className="kpi-top">
            <span><Icon name="meal" /> Energia</span>
            <span className="pill warn">{bundle.isToday ? "finora" : "giorno"}</span>
          </div>
          <div className="kpi-value">
            {int(nutrition.kcalIn)}
            <small>kcal assunte</small>
          </div>
          <div className="kpi-sub">
            {energy.burnedKcal > 0 ? (
              <>
                Bruciate {int(energy.burnedKcal)} (basale + attività) · bilancio{" "}
                <b style={{ color: "var(--text)" }}>{signed(energy.balanceKcal)} kcal</b>
              </>
            ) : (
              "Nessun dato di dispendio ancora sincronizzato"
            )}
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "#ff8a5c" }}>
          <div className="kpi-top">
            <span><Icon name="protein" /> Proteine</span>
            {weight && <span className="pill">{dec(nutrition.proteinG / weight.kg, 2)} g/kg</span>}
          </div>
          <div className="kpi-ring" style={{ marginTop: 8 }}>
            <Ring
              value={nutrition.proteinG}
              max={proteinTarget ?? Math.max(nutrition.proteinG, 1)}
              color="#ff8a5c"
              label={`${int(nutrition.proteinG)} g`}
              sub={proteinTarget ? `/ ${proteinTarget}` : undefined}
            />
            <div className="kpi-sub" style={{ marginTop: 0 }}>
              {proteinTarget
                ? `Obiettivo minimo ${proteinTarget} g (1,6 g/kg × ${dec(weight!.kg)} kg${weight!.source === "knowledge_base" ? ", dalla tua nota profilo" : ""}).`
                : "Collega il peso (Apple Health) per vedere i grammi per kg."}
            </div>
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-steps)" }}>
          <div className="kpi-top">
            <span><Icon name="steps" /> Passi</span>
          </div>
          <div className="kpi-ring" style={{ marginTop: 8 }}>
            <Ring value={steps.total} max={10000} color="var(--c-steps)" label={int(steps.total)} sub="/ 10.000" />
            <div className="kpi-sub" style={{ marginTop: 0 }}>
              {stepsAvg !== null
                ? `Media ultimi giorni: ${int(stepsAvg)}`
                : "Lo storico dei giorni precedenti arriverà con la sincronizzazione completa."}
            </div>
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-heart)" }}>
          <div className="kpi-top">
            <span><Icon name="heart" /> FC a riposo (notte)</span>
          </div>
          <div className="kpi-value">
            {night.resting ? int(night.resting) : "—"}
            <small>bpm</small>
          </div>
          <div className="kpi-sub">
            {night.avg ? `Media notte ${int(night.avg)} bpm` : "Nessun dato notturno"}
            {hr.max ? ` · picco giornata ${int(hr.max)}` : ""}
          </div>
          {nightSpark.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <Sparkline values={nightSpark} color="var(--c-heart)" width={190} height={30} />
            </div>
          )}
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-weights)" }}>
          <div className="kpi-top">
            <span><Icon name="dumbbell" /> Allenamento</span>
            {bundle.gymLogs.length > 0 || todaySessions.length > 0 ? (
              <span className="pill good">fatto</span>
            ) : routine === "riposo" ? (
              <span className="pill">riposo</span>
            ) : (
              <span className="pill info">in programma</span>
            )}
          </div>
          <div className="kpi-value" style={{ fontSize: 24, textTransform: "capitalize" }}>
            {bundle.gymLogs.length > 0
              ? `${bundle.gymLogs.length} ${bundle.gymLogs.length === 1 ? "esercizio" : "esercizi"}`
              : todaySessions.length > 0
                ? `${todaySessions.reduce((a, s) => a + s.movingTimeMin, 0)} min`
                : (routine ?? "—")}
          </div>
          <div className="kpi-sub">
            {bundle.gymLogs.length > 0
              ? bundle.gymLogs.map((g) => `${g.exercise} ${g.weightKg} kg × ${g.reps}`).join(" · ")
              : todaySessions.length > 0
                ? todaySessions.map((s) => s.name).join(" · ")
                : "Prossima tappa del ciclo petto-schiena → braccia → gambe → riposo"}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>La tua giornata</h3>
          <span className="muted small">passa il mouse (o tocca) su blocchi e pasti per i dettagli</span>
        </div>
        <DayTimeline bundle={bundle} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="calendar" /> Agenda di oggi</h3>
          </div>
          {bundle.schedule.length === 0 && bundle.events.length === 0 && (
            <p className="muted small">Nessuna lezione, studio o evento in calendario per oggi.</p>
          )}
          {bundle.schedule.map((s, i) => (
            <div className="agenda-row" key={`s${i}`}>
              <span className="swatch" style={{ background: swatch[s.type as keyof typeof swatch] ?? "var(--c-event)" }} />
              <span className="time">
                {clock(s.startH)}–{clock(s.endH)}
              </span>
              <span>
                {s.subject} <span className="muted small">· {s.type === "studio" ? "studio" : "lezione"}</span>
              </span>
            </div>
          ))}
          {bundle.events.map((e, i) => (
            <div className="agenda-row" key={`e${i}`}>
              <span className="swatch" style={{ background: "var(--c-event)" }} />
              <span className="time">{e.allDay ? "tutto il giorno" : `${clock(e.startH)}–${clock(e.endH)}`}</span>
              <span>{e.summary}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h3><Icon name="meal" /> Pasti di oggi</h3>
            <Link href="/?p=salute" className="muted small">
              dettaglio →
            </Link>
          </div>
          {nutrition.meals.length === 0 ? (
            <p className="muted small">Nessun pasto sincronizzato da Yazio per oggi.</p>
          ) : (
            nutrition.meals.map((m, i) => (
              <div className="agenda-row" key={i}>
                <span className="swatch" style={{ background: "var(--c-nutrition)" }} />
                <span className="time">{clock(localHourDecimal(m.at))}</span>
                <span>
                  <b>{int(m.kcal)} kcal</b>{" "}
                  <span className="muted small">
                    · P {int(m.proteinG)} g · C {int(m.carbsG)} g · G {int(m.fatG)} g
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
