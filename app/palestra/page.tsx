import Link from "next/link";
import {
  getDistinctExercises,
  getProgressionSeries,
  getRecentLogs,
  getRunningStats,
  getWeightTrainingCrossReference,
} from "../../src/lib/dashboard";
import { LineChart } from "../components/LineChart";

export default async function PalestraPage({
  searchParams,
}: {
  searchParams: Promise<{ exercise?: string }>;
}) {
  const { exercise: selected } = await searchParams;
  const [recentLogs, exercises, running, crossRef] = await Promise.all([
    getRecentLogs(15),
    getDistinctExercises(),
    getRunningStats(30),
    getWeightTrainingCrossReference(30),
  ]);
  const exercise = selected ?? exercises[0] ?? null;
  const series = exercise ? await getProgressionSeries(exercise) : [];

  const points = series.map((p) => ({
    x: new Date(p.performedAt).getTime(),
    y: Math.round(p.estimatedOneRm * 10) / 10,
    label: new Date(p.performedAt).toLocaleDateString("it-IT"),
  }));

  const runPoints = running.recentRuns
    .slice()
    .reverse()
    .map((r) => ({
      x: new Date(r.date).getTime(),
      y: r.distanceKm,
      label: new Date(r.date).toLocaleDateString("it-IT"),
    }));

  return (
    <>
      <h2>🏋️ Palestra</h2>

      <div className="card">
        <h3>Progressione — 1RM stimato (Epley)</h3>
        <div>
          {exercises.map((e) => (
            <Link
              key={e}
              href={`/palestra?exercise=${encodeURIComponent(e)}`}
              style={{
                marginRight: 8,
                fontSize: 12,
                color: e === exercise ? "#8ab4f8" : "#9aa0a6",
              }}
            >
              {e}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <LineChart points={points} />
        </div>
      </div>

      <div className="card">
        <h3>🏃 Corsa (Strava)</h3>
        <div className="stat-row">
          <div className="stat">
            <div className="value">{running.totalRuns}</div>
            <div className="label">Uscite registrate</div>
          </div>
          <div className="stat">
            <div className="value">{running.totalDistanceKm}km</div>
            <div className="label">Distanza totale</div>
          </div>
          <div className="stat">
            <div className="value">{running.avgPaceMinPerKm > 0 ? `${running.avgPaceMinPerKm}'` : "—"}</div>
            <div className="label">Passo medio (min/km)</div>
          </div>
        </div>
        {runPoints.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <LineChart points={runPoints} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>Allenamenti pesi — confronto con Strava</h3>
        <p style={{ color: "#9aa0a6", fontSize: 13, marginTop: -8 }}>
          Sessioni "Allenamento con i pesi" registrate su Strava, confrontate con gli esercizi
          loggati qui lo stesso giorno — conferma indipendente che l'allenamento è avvenuto.
        </p>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Strava</th>
              <th>Durata</th>
              <th>Esercizi loggati qui</th>
            </tr>
          </thead>
          <tbody>
            {crossRef.map((c, i) => (
              <tr key={i}>
                <td>{new Date(c.date).toLocaleDateString("it-IT")}</td>
                <td>{c.stravaName}</td>
                <td>{c.stravaMovingTimeMin}min</td>
                <td>
                  {c.loggedExercises > 0 ? (
                    <span className="badge">{c.loggedExercises} ✓</span>
                  ) : (
                    <span className="badge off">nessuno</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Ultimi allenamenti</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Esercizio</th>
              <th>Peso</th>
              <th>Reps</th>
              <th>Gruppo</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log, i) => (
              <tr key={i}>
                <td>{new Date(log.performed_at).toLocaleDateString("it-IT")}</td>
                <td>{log.exercise}</td>
                <td>{log.weight_kg}kg</td>
                <td>{log.reps}</td>
                <td>{log.muscle_group ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
