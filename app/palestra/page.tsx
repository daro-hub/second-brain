import Link from "next/link";
import { getProgressionSeries } from "../../src/lib/dashboard";
import { getStrengthLeaderboard } from "../../src/lib/insights";
import { dec, int, pace } from "../../src/lib/numfmt";
import { getActivityCalendar, isSeededLog } from "../../src/lib/overview";
import { getAllActivities } from "../../src/lib/strava";
import { supabase } from "../../src/lib/supabase";
import { addDays, formatDayShort, todayKey } from "../../src/lib/time";
import { ActivityHeatmap, AreaLine } from "../components/viz/charts";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { WeightTraining: "Pesi", Run: "Corsa", Walk: "Camminata" };
const TYPE_COLOR: Record<string, string> = { WeightTraining: "var(--c-weights)", Run: "var(--c-run)", Walk: "var(--c-walk)" };

export default async function PalestraPage({ searchParams }: { searchParams: Promise<{ exercise?: string }> }) {
  const { exercise: selected } = await searchParams;
  const today = todayKey();
  const since = addDays(today, -29);

  const [activities, strength, cal, recentLogsRaw] = await Promise.all([
    getAllActivities().catch(() => []),
    getStrengthLeaderboard().catch(() => []),
    getActivityCalendar(12),
    supabase
      .from("workout_logs")
      .select("exercise, weight_kg, reps, muscle_group, performed_at")
      .neq("exercise", "riposo")
      .order("performed_at", { ascending: false })
      .limit(40)
      .then((r) => r.data ?? []),
  ]);

  const last30 = activities.filter((a) => a.dateKey >= since && a.movingTimeMin > 0);
  const weights30 = last30.filter((a) => a.type === "WeightTraining");
  const runs30 = last30.filter((a) => a.type === "Run");
  const runKm = runs30.reduce((s, r) => s + r.distanceKm, 0);
  const runMin = runs30.reduce((s, r) => s + r.movingTimeMin, 0);
  const activeDays28 = cal.days.slice(-28).filter((d) => d.weights + d.run + d.walk + d.other > 0).length;

  const exercise = selected ?? strength.slice().sort((a, b) => b.logs - a.logs)[0]?.exercise ?? null;
  const series = exercise ? await getProgressionSeries(exercise) : [];
  let best = 0;
  const markers: { x: number; y: number; label: string }[] = [];
  const points = series.map((p, i) => {
    const rm = p.estimatedOneRm;
    if (rm > best && i > 0) markers.push({ x: i + 1, y: rm, label: `Nuovo massimale stimato: ${dec(rm)} kg (${p.weightKg} kg × ${p.reps})` });
    best = Math.max(best, rm);
    return { x: i + 1, y: rm, label: `${p.weightKg} kg × ${p.reps} → ` };
  });

  const runs = activities.filter((a) => a.type === "Run" && a.distanceKm > 0).slice(-12);
  const realLogs = recentLogsRaw.filter((l) => !isSeededLog(String(l.performed_at))).slice(0, 10);
  const sessions = activities.filter((a) => a.movingTimeMin > 0).slice(-12).reverse();

  return (
    <>
      <div className="eyebrow">Palestra e corsa</div>
      <h2>Allenamento</h2>
      <p className="page-sub">Sessioni e orari reali da Strava; pesi e ripetizioni dai log del bot.</p>

      <div className="grid grid-kpi">
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-weights)" }}>
          <div className="kpi-top"><span>🏋️ Pesi · 30 giorni</span></div>
          <div className="kpi-value">{weights30.length}<small>sessioni</small></div>
          <div className="kpi-sub">{int(weights30.reduce((s, a) => s + a.movingTimeMin, 0))} minuti totali</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-run)" }}>
          <div className="kpi-top"><span>🏃 Corsa · 30 giorni</span></div>
          <div className="kpi-value">{dec(runKm)}<small>km</small></div>
          <div className="kpi-sub">{runs30.length} {runs30.length === 1 ? "uscita" : "uscite"}{runKm > 0 ? ` · passo medio ${pace(runMin / runKm)} /km` : ""}</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-steps)" }}>
          <div className="kpi-top"><span>🗓 Costanza · 28 giorni</span></div>
          <div className="kpi-value">{activeDays28}<small>giorni attivi</small></div>
          <div className="kpi-sub">su 28 · almeno un&apos;attività su Strava</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "var(--c-nutrition)" }}>
          <div className="kpi-top"><span>📈 Miglior progresso</span></div>
          <div className="kpi-value" style={{ fontSize: 24, textTransform: "capitalize" }}>{strength[0]?.exercise ?? "—"}</div>
          <div className="kpi-sub">{strength[0] ? `+${int(strength[0].deltaPct)}% di massimale stimato in ${strength[0].logs} sessioni` : "Servono almeno 3 sessioni per esercizio"}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Costanza — ultime 12 settimane</h3><Link href="/insights" className="muted small">tutti gli incroci →</Link></div>
        <ActivityHeatmap days={cal.days} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Progressione — massimale stimato (Epley)</h3>
          <span className="muted small">per sessione · 🏆 = nuovo massimale</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {strength.map((s) => (
            <Link
              key={s.exercise}
              href={`/palestra?exercise=${encodeURIComponent(s.exercise)}`}
              className={`pill ${s.exercise === exercise ? "info" : ""}`}
              style={{ textDecoration: "none", textTransform: "capitalize" }}
            >
              {s.exercise}
            </Link>
          ))}
        </div>
        <AreaLine
          points={points}
          markers={markers}
          yFormat={(v) => `${Math.round(v)}`}
          xFormat={(v) => `#${Math.round(v)}`}
          xTicks={points.length ? [1, Math.ceil(points.length / 2), points.length] : []}
        />
        <div className="note">
          I log precedenti al 4 ottobre hanno date assegnate in sequenza all&apos;import: l&apos;ordine delle sessioni è reale, i giorni no. Per
          questo l&apos;asse è il numero di sessione, non il calendario.
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>🏃 Corse (Strava)</h3></div>
          {runs.length > 1 && (
            <AreaLine
              color="#b78cff"
              height={170}
              minWidth={260}
              points={runs.map((r, i) => ({ x: i + 1, y: r.movingTimeMin / r.distanceKm, label: `${formatDayShort(r.dateKey)} · ${r.distanceKm} km → ` }))}
              yFormat={pace}
              xFormat={(v) => `#${Math.round(v)}`}
              xTicks={[1, runs.length]}
            />
          )}
          <table>
            <thead><tr><th>Data</th><th>Distanza</th><th>Tempo</th><th>Passo</th></tr></thead>
            <tbody>
              {runs.slice().reverse().map((r) => (
                <tr key={r.id}>
                  <td>{formatDayShort(r.dateKey)}</td>
                  <td>{dec(r.distanceKm)} km</td>
                  <td>{r.movingTimeMin} min</td>
                  <td><b>{pace(r.movingTimeMin / r.distanceKm)}</b> /km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><h3>Ultime sessioni (Strava)</h3></div>
          {sessions.map((s) => (
            <div className="agenda-row" key={s.id}>
              <span className="swatch" style={{ background: TYPE_COLOR[s.type] ?? "var(--c-event)" }} />
              <span className="time">{formatDayShort(s.dateKey)}</span>
              <span>
                <b>{TYPE_LABEL[s.type] ?? s.type}</b> · {s.movingTimeMin} min
                {s.distanceKm > 0 ? ` · ${dec(s.distanceKm)} km` : ""}
                <div className="muted small">{s.name}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Serie registrate dal bot (tempo reale)</h3></div>
        {realLogs.length === 0 ? (
          <p className="muted small">Nessuna serie registrata in tempo reale finora.</p>
        ) : (
          <table>
            <thead><tr><th>Quando</th><th>Esercizio</th><th>Peso</th><th>Rip.</th></tr></thead>
            <tbody>
              {realLogs.map((l, i) => (
                <tr key={i}>
                  <td>{new Date(String(l.performed_at)).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={{ textTransform: "capitalize" }}>{l.exercise}</td>
                  <td>{l.weight_kg} kg</td>
                  <td>{l.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
