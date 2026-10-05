import { getOpenAiUsageSummary } from "../../src/lib/openaiUsage";
import { formatDayShort } from "../../src/lib/time";
import { CreditTile } from "./CreditTile";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tok = (n: number) => n.toLocaleString("it-IT");

function DailyCostBars({ days }: { days: { dayKey: string; costUsd: number }[] }) {
  const max = Math.max(0.01, ...days.map((d) => d.costUsd));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
      {days.map((d) => (
        <div key={d.dayKey} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${formatDayShort(d.dayKey)}: ${usd(d.costUsd)}`}>
          <div
            style={{
              width: "100%",
              height: Math.max(2, (d.costUsd / max) * 110),
              background: "var(--accent)",
              opacity: 0.75,
              borderRadius: 2,
            }}
          />
          <span className="muted small" style={{ fontSize: 8 }}>
            {formatDayShort(d.dayKey).slice(0, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export async function CostiView() {
  const u = await getOpenAiUsageSummary(30);

  if (!u.configured) {
    return (
      <>
        <div className="eyebrow">Costi e token</div>
        <h2>Utilizzo API OpenAI</h2>
        <div className="card">
          <div className="card-head">
            <h3>Non configurato</h3>
          </div>
          <p>
            Questa pagina legge le Usage/Costs API di OpenAI, che richiedono una <b>Admin API key</b> a livello di
            organizzazione — diversa da quella usata dal bot per rispondere (<code>OPENAI_API_KEY</code>).
          </p>
          <ol>
            <li>
              Vai su <code>platform.openai.com</code> → impostazioni dell&apos;organizzazione → <b>Admin keys</b> → crea
              una nuova chiave con permesso di lettura su Usage/Costs.
            </li>
            <li>
              Aggiungi <code>OPENAI_ADMIN_API_KEY</code> alle variabili d&apos;ambiente (locale e Vercel).
            </li>
            <li>
              Opzionale: per vedere anche una stima del credito residuo, imposta il <b>Totale caricato</b> (doppio click sul
              riquadro, una volta configurata la chiave) — non è un saldo live (OpenAI non lo espone via API), solo
              &quot;ricarica meno spesa degli ultimi 30 giorni&quot;.
            </li>
          </ol>
        </div>
      </>
    );
  }

  const last14 = u.days.slice(-14);

  return (
    <>
      <div className="eyebrow">Costi e token</div>
      <h2>Quanto consuma il bot</h2>
      <p className="page-sub">Spesa e token delle chiamate OpenAI (chat, trascrizione, voce, embeddings) negli ultimi 30 giorni.</p>

      <div className="hud-tiles">
        <div className="tile" style={{ ["--t" as string]: "#4de1ff" }}>
          <div className="t-lbl">Oggi</div>
          <div className="t-val">{usd(u.totalCostUsdToday)}</div>
          <div className="t-sub">spesa di oggi</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#3ecf8e" }}>
          <div className="t-lbl">Ultimi 7 giorni</div>
          <div className="t-val">{usd(u.totalCostUsd7d)}</div>
          <div className="t-sub">media {usd(u.totalCostUsd7d / 7)}/giorno</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#b78cff" }}>
          <div className="t-lbl">Ultimi 30 giorni</div>
          <div className="t-val">{usd(u.totalCostUsd30d)}</div>
          <div className="t-sub">{tok(u.totalTokens30d)} token totali</div>
        </div>
        <CreditTile total={u.creditTotalUsd} />
        <div className="tile" style={{ ["--t" as string]: "#ff7ad9" }}>
          <div className="t-lbl">Credito residuo (stima)</div>
          <div className="t-val">{u.creditRemainingUsd === null ? "—" : usd(u.creditRemainingUsd)}</div>
          <div className="t-sub">{u.creditTotalUsd === null ? "imposta il totale caricato qui accanto" : `su ${usd(u.creditTotalUsd)} ricaricati`}</div>
        </div>
      </div>

      <div className="grid grid-12" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Spesa giornaliera · 14 giorni</h3>
          </div>
          {last14.length ? <DailyCostBars days={last14} /> : <p className="muted small">Nessun dato ancora per questo periodo.</p>}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Per modello · 30 giorni</h3>
          </div>
          {u.byModel.length ? (
            <table>
              <thead>
                <tr>
                  <th>Modello</th>
                  <th>Richieste</th>
                  <th>Token in</th>
                  <th>Token out</th>
                </tr>
              </thead>
              <tbody>
                {u.byModel.map((m) => (
                  <tr key={m.model}>
                    <td>{m.model}</td>
                    <td>{tok(m.requests)}</td>
                    <td>{tok(m.inputTokens)}</td>
                    <td>{tok(m.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">Nessun dato per modello in questo periodo.</p>
          )}
        </div>
      </div>

      <div className="note">
        Il credito residuo è una stima (ricarica dichiarata meno spesa degli ultimi 30 giorni), non un saldo live: OpenAI
        non espone il saldo prepagato tramite API pubblica, solo tramite la dashboard.
      </div>
    </>
  );
}
