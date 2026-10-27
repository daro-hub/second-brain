import type { ReactNode } from "react";
import { getEnergyWeek, getRealGymLogDays, getStrengthLeaderboard, getWeekBudget, type Gate } from "../../src/lib/insights";
import { dec, int, signed } from "../../src/lib/numfmt";
import { getActivityCalendar } from "../../src/lib/overview";
import { todayKey, weekdayShort } from "../../src/lib/time";
import { ActivityHeatmap, GroupedBars } from "../components/viz/charts";
import { CollectProgress, Sparkline } from "../components/viz/small";
import { Icon, type IconName } from "../components/Icon";

function Insight({
  icon,
  title,
  status,
  gate,
  children,
  teaser,
  wide,
}: {
  icon: IconName;
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
          <Icon name={icon} size={17} /> {title}
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

export async function InsightsView() {
  const [energy, budget, strength, heat, realDays] = await Promise.all([
    getEnergyWeek(7),
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
  const activeDays = heat.days.filter((d) => d.weights + d.run + d.walk + d.other > 0 || (d.steps ?? 0) >= 8000).length;

  return (
    <>
      <div className="eyebrow">Incroci</div>
      <h2>Cosa dicono i tuoi dati, insieme</h2>

      <div className="card insight">
        <div className="insight-head">
          <h3><Icon name="calendar" size={17} /> Costanza — ultime 20 settimane</h3>
          <span className="pill good">pronto</span>
        </div>
        <p className="headline">
          <b>{activeDays}</b> giorni con almeno un&apos;attività su {heat.days.length}. Fonte: Strava e passi di Apple Health.
        </p>
        <ActivityHeatmap days={heat.days} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>

        <Insight icon="book" title="Budget della settimana" status="ready">
          <p className="headline">
            Questa settimana: <b>{dec(budget.totals.study)} h</b> di studio, <b>{dec(budget.totals.lesson)} h</b> di lezione e{" "}
            <b>{dec(budget.totals.training)} h</b> di allenamento finora.
          </p>
          <GroupedBars
            categories={budget.days.map((d) => ({ label: weekdayShort(d.dayKey), values: [d.study, d.lesson, d.training] }))}
            series={[
              { name: "Studio", color: "#64d2ff" },
              { name: "Lezioni", color: "#ff6482" },
              { name: "Allenamento", color: "#0a84ff" },
            ]}
            unit=" h"
            partialLabelIndex={todayIdx}
            height={200}
          />
        </Insight>

        <Insight
          icon="flame"
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
              { name: "Assunte", color: "#ff9f0a" },
              { name: "Bruciate", color: "#0a84ff" },
            ]}
            unit=" kcal"
            partialLabelIndex={energy.days.findIndex((d) => d.isToday)}
            height={200}
          />
        </Insight>




      </div>

      <div className="card insight">
        <div className="insight-head">
          <h3><Icon name="dumbbell" size={17} /> Progressione della forza</h3>
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
