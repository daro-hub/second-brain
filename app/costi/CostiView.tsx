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
      
      <div className="hud-tiles">
        <div className="tile" style={{ ["--t" as string]: "#bf5af2" }}>
          <div className="t-lbl">Ultimi 30 giorni</div>
          <div className="t-val">{usd(u.totalCostUsd30d)}</div>
          <div className="t-sub">{tok(u.totalTokens30d)} token totali</div>
        </div>
        <CreditTile total={u.creditTotalUsd} />
        <div className="tile" style={{ ["--t" as string]: "#ff375f" }}>
          <div className="t-lbl">Credito residuo (stima)</div>
          <div className="t-val">{u.creditRemainingUsd === null ? "—" : usd(u.creditRemainingUsd)}</div>
          <div className="t-sub">{u.creditTotalUsd === null ? "imposta il totale caricato qui accanto" : `su ${usd(u.creditTotalUsd)} ricaricati`}</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Spesa giornaliera · 14 giorni</h3>
          </div>
          {last14.length ? <DailyCostBars days={last14} /> : <p className="muted small">Nessun dato ancora per questo periodo.</p>}
        </div>

      </div>

    </>
  );
}
