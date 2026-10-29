import { isEnabled } from "../../src/lib/modules";
import { getLatestWeightKg } from "../../src/lib/health";
import { clock, dec, int } from "../../src/lib/numfmt";
import { getDayBundle } from "../../src/lib/overview";
import { formatDayLong, todayKey } from "../../src/lib/time";
import { getNextRoutineToTrain, trainingCycleLabel } from "../../src/lib/workouts";
import { Icon } from "../components/Icon";
import { Ring } from "../components/viz/small";

const PROTEIN_G_PER_KG_TARGET = 1.6; // soglia inferiore dell'intervallo 1,6–2,2 g/kg per chi si allena con i pesi
const STEPS_TARGET = 10000;

const swatch = { studio: "var(--c-study)", lezione: "var(--c-lesson)" } as const;

/** Oggi: tre anelli (calorie, proteine, passi), l'allenamento e l'agenda. Niente altro. */
export async function OggiView() {
  const today = todayKey();
  const [bundle, weight, routine] = await Promise.all([
    getDayBundle(today),
    getLatestWeightKg().catch(() => null),
    getNextRoutineToTrain().catch(() => null),
  ]);

  const { nutrition, energy, steps } = bundle;
  const proteinTarget = weight ? Math.round(weight.kg * PROTEIN_G_PER_KG_TARGET) : null;
  const todaySessions = bundle.activities.filter((a) => a.movingTimeMin > 0);
  const trained = bundle.gymLogs.length > 0 || todaySessions.length > 0;

  return (
    <>
      <div className="eyebrow">{formatDayLong(today)}</div>

      <div className="grid grid-kpi">
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-nutrition)" }}>
          <div className="kpi-top">
            <span><Icon name="meal" /> Calorie</span>
          </div>
          <div className="kpi-ring" style={{ marginTop: 8 }}>
            <Ring value={nutrition.kcalIn} max={energy.burnedKcal > 0 ? energy.burnedKcal : Math.max(nutrition.kcalIn, 1)} color="var(--c-nutrition)" label={int(nutrition.kcalIn)} sub={energy.burnedKcal > 0 ? `/ ${int(energy.burnedKcal)}` : "kcal"} />
            <div className="kpi-sub" style={{ marginTop: 0 }}>
              {energy.burnedKcal > 0 ? "Mangiate finora contro bruciate (basale + attività)." : "Dato di dispendio non ancora sincronizzato."}
            </div>
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "#ff8a5c" }}>
          <div className="kpi-top">
            <span><Icon name="protein" /> Proteine</span>
            {weight && <span className="pill">{dec(nutrition.proteinG / weight.kg, 2)} g/kg</span>}
          </div>
          <div className="kpi-ring" style={{ marginTop: 8 }}>
            <Ring value={nutrition.proteinG} max={proteinTarget ?? Math.max(nutrition.proteinG, 1)} color="#ff8a5c" label={`${int(nutrition.proteinG)} g`} sub={proteinTarget ? `/ ${proteinTarget}` : undefined} />
            <div className="kpi-sub" style={{ marginTop: 0 }}>
              {proteinTarget ? `Obiettivo minimo ${proteinTarget} g (1,6 g/kg).` : "Collega il peso (Apple Health) per vedere l'obiettivo."}
            </div>
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-steps)" }}>
          <div className="kpi-top">
            <span><Icon name="steps" /> Passi</span>
          </div>
          <div className="kpi-ring" style={{ marginTop: 8 }}>
            <Ring value={steps.total} max={STEPS_TARGET} color="var(--c-steps)" label={int(steps.total)} sub={`/ ${int(STEPS_TARGET)}`} />
          </div>
        </div>

        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-weights)" }}>
          <div className="kpi-top">
            <span><Icon name="dumbbell" /> Allenamento</span>
            {trained ? <span className="pill good">fatto</span> : routine === "riposo" ? <span className="pill">riposo</span> : <span className="pill info">in programma</span>}
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
                : `Prossima tappa del ciclo ${trainingCycleLabel()}`}
          </div>
        </div>
      </div>

      {(isEnabled("calendar") || isEnabled("uni")) && (
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
      )}
    </>
  );
}
