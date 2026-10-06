import { KNOWLEDGE_AREAS, getKnowledgeStats, getReflection } from "../../../src/lib/knowledge";
import type { Pillar } from "../../../src/lib/pillars";
import { todayKey } from "../../../src/lib/time";
import { getBrainSnapshot } from "../../../src/lib/brain";
import { logKnowledgeAction, logSocialAction, saveReflectionAction } from "../../actions/hub";
import { BrainPanel } from "./BrainPanel";
import { AreaLine } from "../viz/charts";
import { WorkHeatmap } from "../viz/WorkHeatmap";
import { MOOD_ASPECTS, aspectScore, moodIndex } from "../../../src/lib/mood";
import { describeFactor, getMoodFactors } from "../../../src/lib/moodInsights";
import { getCultureScore } from "../../../src/lib/pills";
import { supabase } from "../../../src/lib/supabase";
import { addDays, formatDayShort } from "../../../src/lib/time";
import { crossWork, fmtHours, getOrgCommits, getWork, hourlyRate, minutesByDay, workStats } from "../../../src/lib/work";
import { addWorkAction, deleteWorkAction, saveMoodNoteAction } from "../../actions/hub";

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

export async function WorkTracker() {
  const today = todayKey();
  const from = addDays(today, -(26 * 7));
  const [entries, commits] = await Promise.all([getWork(from, today).catch(() => null), getOrgCommits(from, today)]);
  if (!entries) return <div className="card"><p className="muted small">Registro ore non disponibile: applica la migrazione <code>0016</code> su Supabase.</p></div>;
  const perDay = minutesByDay(entries);
  const within = (n: number) => entries.filter((e) => e.day > addDays(today, -n));
  const [w7, w28, w90] = [workStats(within(7)), workStats(within(28)), workStats(within(90))];
  const commitCounts = commits ? Object.fromEntries(Object.entries(commits.byDay).map(([d, c]) => [d, c.commits])) : undefined;
  const cross = commits ? crossWork(Object.fromEntries(Object.entries(perDay).filter(([d]) => d > addDays(today, -90))), Object.fromEntries(Object.entries(commits.byDay).filter(([d]) => d > addDays(today, -90)))) : null;
  const rate = hourlyRate();
  return (
    <>
      <div className="grid grid-kpi">
        {[["7 giorni", w7], ["28 giorni", w28], ["90 giorni", w90]].map(([label, st]) => {
          const x = st as ReturnType<typeof workStats>;
          return (
            <div key={label as string} className="card kpi" style={{ ["--kpi" as string]: "#f5a524" }}>
              <div className="kpi-top"><span>{label as string}</span></div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{fmtHours(x.totalMinutes)}</div>
              <div className="kpi-sub">{x.daysWorked} giorni lavorati{x.avgMinutesPerWorkedDay ? ` · ${fmtHours(x.avgMinutesPerWorkedDay)} al giorno` : ""}{rate ? ` · ≈ ${Math.round((x.totalMinutes / 60) * rate).toLocaleString("it-IT")} €` : ""}</div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <div className="card-head"><h3>Registra ore</h3><span className="muted small">come il Tasks Tracker di Notion</span></div>
        <form action={addWorkAction} className="hub-form">
          <input name="day" type="date" defaultValue={today} max={today} required style={{ width: 150 }} />
          <input name="hours" type="number" step="0.25" min="0.25" max="24" placeholder="ore" required />
          <input name="task" placeholder="cosa hai fatto" maxLength={200} required style={{ flex: 1, minWidth: 160 }} />
          <select name="type" defaultValue=""><option value="">tipo…</option><option>Feature request</option><option>Bug</option><option>Polish</option><option>Call</option><option>Assistenza</option></select>
          <button type="submit">Aggiungi</button>
        </form>
      </div>
      <div className="card">
        <div className="card-head"><h3>Giorni lavorati</h3><span className="muted small">ultime 26 settimane</span></div>
        <WorkHeatmap today={today} minutes={perDay} commits={commitCounts} />
        {cross ? (
          <p className="muted small">
            Incrocio con GitHub ({commits!.org} · {commits!.user}, ultimi 90 giorni): {cross.both} giorni con ore e commit, {cross.hoursOnly} con ore ma senza commit (call, assistenza, analisi…){cross.commitsOnly.length ? `, ${cross.commitsOnly.length} con commit ma senza ore registrate${cross.commitsOnly.length <= 6 ? ` (${cross.commitsOnly.map(formatDayShort).join(", ")})` : ""}` : ""}.
            {commits!.reposFailed ? ` ${commits!.reposFailed} repo non leggibili.` : ""}
          </p>
        ) : (
          <p className="muted small">Incrocio coi commit non disponibile: serve GITHUB_TOKEN con accesso all&apos;organizzazione.</p>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h3>Ultime registrazioni</h3>{w28.byType.length > 0 && <span className="muted small">28 gg: {w28.byType.slice(0, 3).map((t) => `${t.type} ${fmtHours(t.minutes)}`).join(" · ")}</span>}</div>
        {entries.slice(0, 15).map((e) => (
          <div className="agenda-row" key={e.id}>
            <span className="time">{formatDayShort(e.day)}</span>
            <span style={{ flex: 1 }}>{e.task}{e.taskType ? <span className="muted small"> · {e.taskType}</span> : null}</span>
            <span className="muted small">{e.minutes ? fmtHours(e.minutes) : e.extraEur !== null ? `${e.extraEur} €` : "—"}</span>
            <form action={deleteWorkAction}><input type="hidden" name="id" value={e.id} /><button type="submit" className="muted small" aria-label="Elimina" title="Elimina">✕</button></form>
          </div>
        ))}
      </div>
    </>
  );
}

export async function MoodPanel() {
  const { hist, factors } = await getMoodFactors(90).catch(() => ({ hist: null, factors: [] }));
  if (!hist) return <div className="card"><p className="muted small">Diario non disponibile: applica la migrazione <code>0016</code> su Supabase.</p></div>;
  const today = todayKey();
  const recent = hist.filter((d) => d.day > addDays(today, -30));
  const pts = recent.flatMap((d, i) => {
    const v = moodIndex(d.scores);
    return v === null ? [] : [{ x: i, y: v, label: d.day }];
  });
  const last7 = hist.filter((d) => d.day > addDays(today, -7));
  const todayRow = hist.find((d) => d.day === today);
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Umore · ultimi 30 giorni</h3><span className="muted small">{todayRow?.completed ? "check-in di oggi fatto" : "il check-in arriva alle 22 su Telegram"}</span></div>
        {pts.length >= 2 ? <AreaLine points={pts} color="#b78cff" height={180} xFormat={(v) => formatDayShort(recent[Math.round(v)]?.day ?? today)} /> : <p className="muted small">Servono almeno due sere di diario per disegnare l&apos;andamento.</p>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Aspetti</h3><span className="muted small">media ultimi 7 giorni</span></div>
        {MOOD_ASPECTS.map((a) => {
          const vals = last7.flatMap((d) => (typeof d.scores[a.key] === "number" ? [aspectScore(a.key, d.scores[a.key] as number)] : []));
          const avg = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
          return (
            <div className="agenda-row" key={a.key}>
              <span className="time">{a.label}</span>
              <div className="hub-bar" style={{ flex: 1, margin: 0 }}><i style={{ width: `${avg ?? 0}%`, background: "#b78cff" }} /></div>
              <span className="muted small">{avg === null ? "—" : avg}</span>
            </div>
          );
        })}
      </div>
      <div className="card">
        <div className="card-head"><h3>Cosa si muove con l&apos;umore</h3><span className="muted small">correlazioni, non cause</span></div>
        {factors.map((f) => <p key={f.key} className="muted small" style={{ margin: "4px 0" }}>{describeFactor(f)}</p>)}
      </div>
      <div className="card">
        <div className="card-head"><h3>Nota di oggi</h3></div>
        <form action={saveMoodNoteAction} className="hub-form col">
          <textarea name="note" rows={3} maxLength={1000} defaultValue={todayRow?.note ?? ""} placeholder="Cosa ha pesato sull'umore oggi? (facoltativo)" />
          <button type="submit">Salva</button>
        </form>
      </div>
    </>
  );
}

export async function PillsPanel() {
  const [culture, { data }] = await Promise.all([getCultureScore(), supabase.from("knowledge_pills").select("id, area, title, key_fact, status, sent_on").order("sent_on", { ascending: false }).limit(10)]);
  return (
    <div className="card">
      <div className="card-head"><h3>Pillole di cultura generale</h3><span className="muted small">{culture.score === null ? `${culture.pending} da verificare` : `punteggio ${culture.score}/100 · ${culture.known} assimilate · ${culture.review} da ripassare`}</span></div>
      {(data ?? []).length === 0 && <p className="muted small">Nessuna pillola ancora: scrivi /pillole al bot.</p>}
      {(data ?? []).map((p) => (
        <div className="agenda-row" key={String(p.id)}>
          <span className="time" style={{ textTransform: "capitalize" }}>{String(p.area)}</span>
          <span style={{ flex: 1 }}>{String(p.title)}<span className="muted small"> · {String(p.key_fact)}</span></span>
          <span className="muted small">{p.status === "known" ? "✓" : p.status === "review" ? "↻" : "·"}</span>
        </div>
      ))}
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
