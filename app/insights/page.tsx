import type { ReactNode } from "react";
import {
  getEnergyWeek,
  getNightVsLastMeal,
  getNightVsTraining,
  getRealGymLogDays,
  getRunPaceVsRest,
  getStepsTrainingVsRest,
  getStrengthLeaderboard,
  getTrainingHours,
  getWeekBudget,
  type Gate,
  type ScatterInsight,
} from "../../src/lib/insights";
import { clock, dec, int, pace, signed } from "../../src/lib/numfmt";
import { getActivityCalendar } from "../../src/lib/overview";
import { describeCorrelation } from "../../src/lib/stats";
import { todayKey, weekdayShort } from "../../src/lib/time";
import { ActivityHeatmap, GroupedBars, HourHistogram, XYScatter } from "../components/viz/charts";
import { CollectProgress, Sparkline } from "../components/viz/small";

export const dynamic = "force-dynamic";

function Insight({
  icon,
  title,
  status,
  gate,
  children,
  teaser,
  wide,
}: {
  icon: string;
  title: string;
  status: "ready" | "collecting";
  gate?: Gate;
  children: ReactNode;
  teaser?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="card insight" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div className="insight-head">
        <h3>
          {icon} {title}
        </h3>
        <span className={`pill ${status === "ready" ? "good" : "info"}`}>{status === "ready" ? "pronto" : "in raccolta"}</span>
      </div>
      {children}
      {status === "collecting" && gate && (
        <div className="collecting-note">
          <CollectProgress have={gate.have} need={gate.need} unit={gate.unit} />
          {teaser && <div style={{ marginTop: 10 }}>{teaser}</div>}
        </div>
      )}
    </div>
  );
}

function scatterHeadline(s: ScatterInsight, what: string): ReactNode {
  if (!s.correlation) return null;
  return (
    <p className="headline">
      Su <b>{s.correlation.n}</b> {s.gate.unit}: <b>{describeCorrelation(s.correlation)}</b> (r = {dec(s.correlation.r, 2)}) tra {what}. Una
      correlazione non è una causa, ma è un buon punto da cui partire.
    </p>
  );
}

export default async function InsightsPage() {
  const [energy, nightTrain, nightMeal, steps, runs, hours, budget, strength, heat, realDays] = await Promise.all([
    getEnergyWeek(7),
    getNightVsTraining(),
    getNightVsLastMeal(),
    getStepsTrainingVsRest(),
    getRunPaceVsRest(),
    getTrainingHours(),
    getWeekBudget(),
    getStrengthLeaderboard(),
    getActivityCalendar(20),
    getRealGymLogDays(),
  ]);

  const completeDays = energy.days.filter((d) => d.complete);
  const avgBalance = completeDays.length
    ? completeDays.reduce((a, d) => a + (d.kcalIn - d.kcalOut), 0) / completeDays.length
    : null;
  const todayIdx = budget.days.findIndex((d) => d.dayKey === todayKey());
  const activeDays = heat.days.filter((d) => d.weights + d.run + d.walk + d.other > 0).length;

  return (
    <>
      <div className="eyebrow">Incroci</div>
      <h2>Cosa dicono i tuoi dati, insieme</h2>
      <p className="page-sub">
        Ogni analisi dichiara quanti dati servono prima di parlare. Finché non bastano vedi lo stato della raccolta, non numeri che
        sembrano risposte ma sono rumore: con pochi punti un coefficiente di correlazione non significa nulla.
      </p>

      <div className="card insight">
        <div className="insight-head">
          <h3>🗓 Costanza — ultime 20 settimane</h3>
          <span className="pill good">pronto</span>
        </div>
        <p className="headline">
          <b>{activeDays}</b> giorni con almeno un&apos;attività su {heat.days.length}. Fonte: Strava (orari reali).
        </p>
        <ActivityHeatmap days={heat.days} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <Insight icon="⏰" title="Quando ti alleni vs quando sei occupato" status="ready">
          <p className="headline">
            {hours.peakHour !== null ? (
              <>
                Il picco è alle <b>{clock(hours.peakHour)}</b>. <b>{hours.clash}</b> sessioni su <b>{hours.total}</b> sono iniziate mentre avevi
                studio o lezioni in programma.
              </>
            ) : (
              "Servono sessioni su Strava."
            )}
          </p>
          <HourHistogram counts={hours.counts} busy={hours.busy} />
        </Insight>

        <Insight icon="📚" title="Budget della settimana" status="ready">
          <p className="headline">
            Questa settimana: <b>{dec(budget.totals.study)} h</b> di studio, <b>{dec(budget.totals.lesson)} h</b> di lezione e{" "}
            <b>{dec(budget.totals.training)} h</b> di allenamento finora.
          </p>
          <GroupedBars
            categories={budget.days.map((d) => ({ label: weekdayShort(d.dayKey), values: [d.study, d.lesson, d.training] }))}
            series={[
              { name: "Studio", color: "#5eead4" },
              { name: "Lezioni", color: "#f9a8d4" },
              { name: "Allenamento", color: "#7aa2ff" },
            ]}
            unit=" h"
            partialLabelIndex={todayIdx}
            height={200}
          />
        </Insight>

        <Insight
          icon="🔥"
          title="Bilancio energetico"
          status={energy.gate.ready ? "ready" : "collecting"}
          gate={energy.gate}
          teaser="Calorie assunte (Yazio) contro calorie bruciate (basale + attività da Apple Health), giorno per giorno. Servono almeno 3 giorni completi per un quadro affidabile."
        >
          {avgBalance !== null && (
            <p className="headline">
              Bilancio medio sui giorni completi: <b>{signed(avgBalance)} kcal/giorno</b>.
            </p>
          )}
          <GroupedBars
            categories={energy.days.map((d) => ({ label: weekdayShort(d.dayKey), values: [d.kcalIn, d.kcalOut] }))}
            series={[
              { name: "Assunte", color: "#f5a524" },
              { name: "Bruciate", color: "#7aa2ff" },
            ]}
            unit=" kcal"
            partialLabelIndex={energy.days.findIndex((d) => d.isToday)}
            height={200}
          />
        </Insight>

        <Insight
          icon="👟"
          title="Passi: giorni di allenamento vs riposo"
          status={steps.gate.ready ? "ready" : "collecting"}
          gate={steps.gate}
          teaser="Cammini meno nei giorni in cui ti alleni? Il confronto parte con 14 giorni completi di passi (almeno 3 di allenamento e 3 di riposo)."
        >
          {steps.gate.ready && steps.trainingAvg !== null && steps.restAvg !== null ? (
            <GroupedBars
              categories={[
                { label: `Allenamento (${steps.trainingDays} gg)`, values: [steps.trainingAvg] },
                { label: `Riposo (${steps.restDays} gg)`, values: [steps.restAvg] },
              ]}
              series={[{ name: "Passi medi", color: "#34d399" }]}
              height={180}
            />
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Nessun confronto possibile ancora.</p>
          )}
        </Insight>

        <Insight
          icon="🌙"
          title="Recupero notturno × allenamento del giorno prima"
          status={nightTrain.gate.ready ? "ready" : "collecting"}
          gate={nightTrain.gate}
          teaser="La FC a riposo della notte sale dopo i giorni più pesanti? Ogni punto è una notte: minuti di allenamento del giorno prima contro battito a riposo. Si sblocca con 8 notti di battito."
        >
          {scatterHeadline(nightTrain, "allenamento e battito notturno")}
          <XYScatter
            points={nightTrain.points}
            xLabel="Minuti di allenamento (giorno prima)"
            yLabel="FC a riposo (bpm)"
            yFormat={(v) => `${Math.round(v)}`}
            xFormat={(v) => `${Math.round(v)}`}
            color="#ff5d73"
            trend={nightTrain.fit}
          />
        </Insight>

        <Insight
          icon="🍽"
          title="Cena tardi → battito notturno"
          status={nightMeal.gate.ready ? "ready" : "collecting"}
          gate={nightMeal.gate}
          teaser="Mangiare più tardi si lega a un battito notturno più alto? Orario dell'ultimo pasto contro FC a riposo della notte seguente. Si sblocca con 8 notti."
        >
          {scatterHeadline(nightMeal, "orario dell'ultimo pasto e battito notturno")}
          <XYScatter
            points={nightMeal.points}
            xLabel="Orario ultimo pasto"
            yLabel="FC a riposo (bpm)"
            yFormat={(v) => `${Math.round(v)}`}
            xFormat={clock}
            color="#f5a524"
            trend={nightMeal.fit}
          />
        </Insight>

        <Insight
          icon="🏃"
          title="Corsa: passo × giorni dall'ultimo allenamento coi pesi"
          status={runs.gate.ready ? "ready" : "collecting"}
          gate={runs.gate}
          teaser="Corri più piano dopo una seduta di gambe? Passo di ogni corsa (≥3 km) contro i giorni passati dall'ultimo allenamento coi pesi su Strava. Servono 8 corse con uno storico dei pesi precedente."
          wide
        >
          {scatterHeadline(runs, "riposo dai pesi e passo di corsa")}
          <XYScatter
            points={runs.points}
            xLabel="Giorni dall'ultimo allenamento coi pesi"
            yLabel="Passo (min/km)"
            yFormat={pace}
            xFormat={(v) => `${Math.round(v)}`}
            color="#b78cff"
            trend={runs.fit}
          />
        </Insight>
      </div>

      <div className="card insight">
        <div className="insight-head">
          <h3>💪 Progressione della forza</h3>
          <span className="pill good">pronto</span>
        </div>
        <p className="headline">
          Variazione del massimale stimato (formula di Epley) dal primo all&apos;ultimo log, per gli esercizi con almeno 3 registrazioni.
        </p>
        <table>
          <thead>
            <tr>
              <th>Esercizio</th>
              <th>Gruppo</th>
              <th>Log</th>
              <th>Massimale stimato</th>
              <th>Variazione</th>
              <th>Andamento</th>
            </tr>
          </thead>
          <tbody>
            {strength.slice(0, 12).map((s) => (
              <tr key={s.exercise}>
                <td style={{ textTransform: "capitalize" }}>{s.exercise}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{s.muscleGroup ?? "—"}</td>
                <td>{s.logs}</td>
                <td>
                  {dec(s.firstRm)} → <b>{dec(s.lastRm)}</b> kg
                </td>
                <td>
                  <span className={`pill ${s.deltaPct >= 0 ? "good" : "bad"}`}>
                    {s.deltaPct >= 0 ? "+" : "−"}
                    {int(Math.abs(s.deltaPct))}%
                  </span>
                </td>
                <td>
                  <Sparkline values={s.series} color={s.deltaPct >= 0 ? "var(--c-good)" : "var(--c-bad)"} width={110} height={26} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">
          <b>Una cosa da sapere sui dati:</b> i log di palestra precedenti al 4 ottobre hanno date assegnate in sequenza all&apos;import
          (una al giorno, sempre alla stessa ora), quindi l&apos;<b>ordine</b> delle serie è reale ma i <b>giorni</b> no. Per questo la
          progressione è per sessione, e tutti gli incroci basati su <i>quando</i> ti sei allenato usano Strava. Da ora i log sono
          registrati in tempo reale ({realDays} {realDays === 1 ? "giorno" : "giorni"} finora).
        </div>
      </div>
    </>
  );
}
