import Link from "next/link";
import { getDistinctExercises, getProgressionSeries, getRecentLogs } from "../../src/lib/dashboard";
import { LineChart } from "../components/LineChart";

export default async function PalestraPage({
  searchParams,
}: {
  searchParams: Promise<{ exercise?: string }>;
}) {
  const { exercise: selected } = await searchParams;
  const [recentLogs, exercises] = await Promise.all([getRecentLogs(15), getDistinctExercises()]);
  const exercise = selected ?? exercises[0] ?? null;
  const series = exercise ? await getProgressionSeries(exercise) : [];

  const points = series.map((p) => ({
    x: new Date(p.performedAt).getTime(),
    y: Math.round(p.estimatedOneRm * 10) / 10,
    label: new Date(p.performedAt).toLocaleDateString("it-IT"),
  }));

  return (
    <>
      <h2>Palestra</h2>

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
