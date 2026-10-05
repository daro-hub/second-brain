import { KNOWLEDGE_AREAS, getKnowledgeStats, getReflection } from "../../../src/lib/knowledge";
import type { Pillar } from "../../../src/lib/pillars";
import { todayKey } from "../../../src/lib/time";
import { getBrainSnapshot } from "../../../src/lib/brain";
import { logKnowledgeAction, logSocialAction, saveReflectionAction } from "../../actions/hub";
import { BrainPanel } from "./BrainPanel";

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="card hub-skel" aria-busy>
      <span className="muted small">{label}…</span>
    </div>
  );
}

/** Le misure del pilastro come schede: punteggio, valore, dettaglio e barra. */
export function MeasureGrid({ pillar }: { pillar: Pillar }) {
  return (
    <>
      <div className="eyebrow">{pillar.label}{pillar.score !== null ? ` · ${pillar.score}/100` : " · nessun dato"}</div>
      <div className="grid grid-kpi">
        {pillar.measures.map((m) => (
          <div key={m.key} className="card kpi" style={{ ["--kpi" as string]: pillar.color }}>
            <div className="kpi-top">
              <span>{m.label}</span>
              {m.score !== null && <span className="pill">{m.score}</span>}
            </div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{m.value}</div>
            <div className="kpi-sub">{m.detail}</div>
            {m.score !== null && (
              <div className="hub-bar">
                <i style={{ width: `${m.score}%`, background: pillar.color }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export async function KnowledgePanel() {
  const k = await getKnowledgeStats(28);
  return (
    <div className="grid grid-2" style={{ marginBottom: 18 }}>
      <div className="card">
        <div className="card-head"><h3>Registra una sessione</h3></div>
        <form action={logKnowledgeAction} className="hub-form">
          <select name="area" required defaultValue="">
            <option value="" disabled>Area…</option>
            {KNOWLEDGE_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input name="minutes" type="number" min={1} max={600} placeholder="minuti" required />
          <select name="kind" defaultValue="lettura">
            <option>lettura</option><option>documentario</option><option>podcast</option><option>corso</option><option>pratica</option>
          </select>
          <input name="note" placeholder="cosa (opzionale)" maxLength={500} />
          <button type="submit">Aggiungi</button>
        </form>
        {k === null && <p className="muted small">La tabella non esiste ancora: applica la migrazione <code>0013_life_stats.sql</code> su Supabase.</p>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Aree</h3><span className="muted small">ultimi 28 giorni</span></div>
        {KNOWLEDGE_AREAS.map((a) => (
          <div className="agenda-row" key={a}>
            <span className="swatch" style={{ background: (k?.minutesByArea[a] ?? 0) > 0 ? "var(--c-good)" : "var(--faint)" }} />
            <span className="time" style={{ textTransform: "capitalize" }}>{a}</span>
            <span className="muted small">
              {k === null ? "—" : `${k.minutesByArea[a] ?? 0} min · ${k.daysSince[a] === null ? "mai" : k.daysSince[a] === 0 ? "oggi" : `${k.daysSince[a]} g fa`}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function WorkPanel() {
  const month = todayKey().slice(0, 7);
  const r = await getReflection(month);
  return (
    <div className="card">
      <div className="card-head"><h3>Direzione · {month}</h3><span className="muted small">dove voglio andare, in poche righe</span></div>
      {r === undefined ? (
        <p className="muted small">La tabella non esiste ancora: applica la migrazione <code>0013_life_stats.sql</code> su Supabase.</p>
      ) : (
        <form action={saveReflectionAction} className="hub-form col">
          <textarea name="body" rows={5} maxLength={5000} defaultValue={r ?? ""} placeholder="Che responsabilità mi sto prendendo? Come sta cambiando il mio lavoro con l'AI? In che direzione voglio muovermi?" required />
          <button type="submit">Salva</button>
        </form>
      )}
    </div>
  );
}

export function SocialQuickLog() {
  return (
    <div className="card">
      <div className="card-head"><h3>Relazioni</h3><span className="muted small">un contatto con amici o famiglia</span></div>
      <form action={logSocialAction} className="hub-form">
        <select name="kind" defaultValue="uscita">
          <option>uscita</option><option>chiamata</option><option>cena</option><option>sport insieme</option>
        </select>
        <input name="note" placeholder="con chi (opzionale)" maxLength={500} />
        <button type="submit">Aggiungi</button>
      </form>
    </div>
  );
}

export async function AiraPanel() {
  const brain = await getBrainSnapshot();
  return (
    <>
      <BrainPanel brain={brain} />
    </>
  );
}
