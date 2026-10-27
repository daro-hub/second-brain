import { getStrengthLeaderboard } from "../../src/lib/insights";
import { muscleProgress } from "../../src/lib/muscleProgress";
import { getActivityCalendar } from "../../src/lib/overview";
import { ActivityHeatmap } from "../components/viz/charts";
import { MuscleProgress } from "./MuscleProgress";

/** Allenamento in due colpi d'occhio: il calendario degli ultimi mesi e i miglioramenti per gruppo muscolare. */
export async function AllenamentoView() {
  const [cal, strength] = await Promise.all([getActivityCalendar(20), getStrengthLeaderboard().catch(() => [])]);
  const active = cal.days.filter((d) => d.weights + d.run + d.walk + d.other > 0 || (d.steps ?? 0) >= 8000).length;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Calendario — ultimi 5 mesi</h3>
          <span className="muted small">{active} giorni attivi su {cal.days.length}</span>
        </div>
        <ActivityHeatmap days={cal.days} />
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Miglioramenti per gruppo muscolare</h3>
        </div>
        <MuscleProgress rows={muscleProgress(strength)} />
      </div>
    </>
  );
}
