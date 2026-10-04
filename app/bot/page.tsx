import { getDocumentPoints, getWebhookStatus, getWorkoutStats } from "../../src/lib/dashboard";
import { pca2d } from "../../src/lib/pca";
import { ScatterChart } from "../components/ScatterChart";

// Stato del webhook e contatori devono essere letti a ogni richiesta, non congelati al build.
export const dynamic = "force-dynamic";

export default async function BotPage() {
  const [docs, stats, webhook] = await Promise.all([
    getDocumentPoints(),
    getWorkoutStats(),
    getWebhookStatus(),
  ]);

  const coords = pca2d(docs.map((d) => d.embedding));
  const points = docs.map((d, i) => ({
    x: coords[i]?.[0] ?? 0,
    y: coords[i]?.[1] ?? 0,
    source: d.source,
    title: d.content.slice(0, 80),
  }));

  return (
    <>
      <h2>Bot</h2>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="value">
              <span className={`badge ${webhook.active ? "" : "off"}`}>
                {webhook.active ? "attivo" : "non attivo"}
              </span>
            </div>
            <div className="label">Stato webhook</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalDocuments}</div>
            <div className="label">Voci nella knowledge base</div>
          </div>
          <div className="stat">
            <div className="value">{stats.totalLogs}</div>
            <div className="label">Allenamenti registrati</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Mappa della knowledge base</h3>
        <p style={{ color: "#9aa0a6", fontSize: 13, marginTop: -8 }}>
          Ogni punto è una nota, posizionata per somiglianza semantica reale (PCA a 2 dimensioni
          sui vettori embedding a 1536 dimensioni) — note vicine nel grafico sono vicine nel
          significato, non solo decorative.
        </p>
        <ScatterChart points={points} />
      </div>
    </>
  );
}
