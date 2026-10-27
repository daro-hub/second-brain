import { KNOWLEDGE_AREAS, getKnowledgeStats, getSocialCount } from "../../../src/lib/knowledge";
import type { Pillar } from "../../../src/lib/pillars";
import { todayKey } from "../../../src/lib/time";
import { getBrainSnapshot } from "../../../src/lib/brain";
import { logKnowledgeAction, logSocialAction } from "../../actions/hub";
import { BrainPanel } from "./BrainPanel";
import { LiveModeCard } from "./LiveModeCard";
import { PushToggle } from "./PushToggle";
import { MoodDiary } from "./MoodDiary";
import { WidgetCard } from "./WidgetCard";
import { AreaLine } from "../viz/charts";
import { DayBars } from "../viz/DayBars";
import { MOOD_ASPECTS, getMoodHistory, moodIndex } from "../../../src/lib/mood";
import { listRepos } from "../../../src/lib/github";
import { getMyRecentActivity } from "../../../src/lib/linear";
import { getProfile } from "../../../src/lib/profile";
import { getCultureScore } from "../../../src/lib/pills";
import { supabase } from "../../../src/lib/supabase";
import { addDays, formatDayShort } from "../../../src/lib/time";
import { fmtHours, getHourlyRate, getPayments, getWork, minutesByDay, outstanding, workStats } from "../../../src/lib/work";
import { refreshTomorrowAction, addPaymentAction, addExtraAction, addWorkAction, decideProposalAction, setProfileFactAction, setRateAction } from "../../actions/hub";
import { getTomorrowBrief } from "../../../src/lib/tomorrow";
import { Icon } from "../Icon";

const MOOD_DAYS = 14;

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

async function TomorrowCard({ today }: { today: string }) {
  const brief = await getTomorrowBrief().catch(() => null);
  // il brief vale finché il suo giorno non è passato: la sera è «domani», la mattina dopo è «oggi»
  const fresh = brief && brief.forDay >= today ? brief : null;
  const label = fresh ? (fresh.forDay === today ? "Da fare oggi" : "Da fare domani") : "Da fare domani";
  const missing = fresh ? (["linear", "slack", "calendar"] as const).filter((k) => !fresh.sources[k]) : [];
  return (
    <div className="card">
      <div className="card-head">
        <h3>{label}</h3>
        <form action={refreshTomorrowAction}><button type="submit" className="muted small">{fresh ? `aggiornato ${new Date(fresh.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })} · rigenera` : "genera ora"}</button></form>
      </div>
      {!fresh ? (
        <p className="muted small">Il brief si prepara da solo la sera (Linear, Slack e calendario). Tocca «genera ora» per averlo subito.</p>
      ) : fresh.items.length === 0 ? (
        <p className="muted small">Niente di urgente nelle fonti collegate.</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {fresh.items.map((i, n) => (
            <li key={n} style={{ marginBottom: 6 }}>
              {i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer">{i.action}</a> : i.action}
              {i.minutes ? <span className="muted small"> · {i.minutes >= 60 ? fmtHours(i.minutes) : `${i.minutes} min`}</span> : null}
              <span className="muted small" style={{ display: "block" }}>{i.source === "slack" ? "Slack" : i.source === "calendar" ? "Calendario" : "Linear"}{i.why ? ` · ${i.why}` : ""}</span>
            </li>
          ))}
        </ol>
      )}
      {fresh && fresh.other.length > 0 && (
        <details><summary className="muted small">Altro ({fresh.other.length})</summary>{fresh.other.map((o, n) => <p key={n} className="muted small" style={{ margin: "2px 0" }}>{o}</p>)}</details>
      )}
      {missing.length > 0 && <p className="muted small">Incompleto: {missing.map((k) => (k === "linear" ? "Linear" : k === "slack" ? "Slack" : "Calendario")).join(", ")} non {missing.length > 1 ? "hanno risposto" : "ha risposto"}.</p>}
    </div>
  );
}

export async function WorkTracker() {
  const today = todayKey();
  const from = addDays(today, -(26 * 7));
  const since = addDays(today, -27);
  const [entries, payments, rate, linear, repos] = await Promise.all([
    getWork(from, today).catch(() => null),
    getPayments().catch(() => []),
    getHourlyRate().catch(() => null),
    getMyRecentActivity(7).catch(() => null),
    listRepos().catch(() => null),
  ]);
  if (!entries) return <div className="card"><p className="muted small">Registro ore non disponibile: applica la migrazione <code>0016</code> su Supabase.</p></div>;
  const perDay = minutesByDay(entries);
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27)).map((dayKey) => ({ dayKey, minutes: perDay[dayKey] ?? 0 }));
  const w28 = workStats(entries.filter((e) => e.day > addDays(today, -28)));
  const due = outstanding(await getWork("2000-01-01", today).catch(() => entries), payments, rate);
  const activeRepos = repos ? repos.filter((r) => r.updatedAt.slice(0, 10) >= since).length : null;
  return (
    <>
      <div className="grid grid-kpi">
        <div className="card kpi" style={{ ["--kpi" as string]: "#ff9f0a" }}>
          <div className="kpi-top"><span>Da incassare</span></div>
          <div className="kpi-value">{due.dueEur === null ? fmtHours(due.minutes) : `≈ ${due.dueEur.toLocaleString("it-IT")} €`}</div>
          <div className="kpi-sub">{fmtHours(due.minutes)} dopo l&apos;ultimo pagamento{due.paidUntil ? ` (pagato fino al ${formatDayShort(due.paidUntil)})` : ""}</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "#30d158" }}>
          <div className="kpi-top"><span>Issue Linear</span></div>
          <div className="kpi-value">{linear ? linear.completed : "—"}<small>completate</small></div>
          <div className="kpi-sub">{linear ? `${linear.updated} toccate negli ultimi 7 giorni` : "Linear non raggiungibile"}</div>
        </div>
        <div className="card kpi" style={{ ["--kpi" as string]: "#0a84ff" }}>
          <div className="kpi-top"><span>Progetti GitHub attivi</span></div>
          <div className="kpi-value">{activeRepos ?? "—"}</div>
          <div className="kpi-sub">aggiornati negli ultimi 28 giorni</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Ore lavorate — ultime 4 settimane</h3><span className="muted small">{fmtHours(w28.totalMinutes)} in {w28.daysWorked} giorni</span></div>
        <DayBars days={last28} />
      </div>

      <details className="card">
        <summary className="muted small" style={{ cursor: "pointer" }}>Registra ore, pagamenti o trasferte</summary>
        <form action={addWorkAction} className="hub-form" style={{ marginTop: 10 }}>
          <input name="day" type="date" defaultValue={today} max={today} required style={{ width: 150 }} />
          <input name="hours" type="number" step="0.25" min="0.25" max="24" placeholder="ore" required />
          <input name="task" placeholder="cosa hai fatto" maxLength={200} required style={{ flex: 1, minWidth: 160 }} />
          <select name="type" defaultValue=""><option value="">tipo…</option><option>Feature request</option><option>Bug</option><option>Polish</option><option>Call</option><option>Assistenza</option></select>
          <button type="submit">Aggiungi ore</button>
        </form>
        <form action={addPaymentAction} className="hub-form" style={{ marginTop: 10 }}>
          <input name="paidOn" type="date" defaultValue={today} max={today} required style={{ width: 150 }} title="Data in cui è arrivato il pagamento" />
          <input name="amount" type="number" step="0.01" placeholder="quota €" style={{ width: 100 }} />
          <input name="coversUntil" type="date" defaultValue={today} max={today} required style={{ width: 150 }} title="Il pagamento copre le ore fino a questo giorno" />
          <input name="note" placeholder="nota (opzionale)" maxLength={200} />
          <button type="submit">Registra pagamento</button>
        </form>
        <form action={addExtraAction} className="hub-form" style={{ marginTop: 10 }}>
          <input name="day" type="date" defaultValue={today} max={today} required style={{ width: 150 }} />
          <select name="kind" defaultValue="Trasferta"><option>Trasferta</option><option>Detrazione</option><option>Extra</option></select>
          <input name="amount" type="number" step="0.01" min="0.01" defaultValue={50} required style={{ width: 100 }} title="Importo in € (sempre positivo: la detrazione viene sottratta da sola)" />
          <input name="note" placeholder="nota (es. telefono aziendale)" maxLength={150} style={{ flex: 1, minWidth: 160 }} />
          <button type="submit">Aggiungi extra</button>
        </form>
        <form action={setRateAction} className="hub-form" style={{ marginTop: 10 }}>
          <input name="rate" type="number" step="0.5" min="1" defaultValue={rate ?? ""} placeholder="€/h" style={{ width: 90 }} />
          <button type="submit">Aggiorna tariffa</button>
        </form>
      </details>
    </>
  );
}

export async function MoodPanel() {
  const [hist, social] = await Promise.all([getMoodHistory(MOOD_DAYS).catch(() => null), getSocialCount(14).catch(() => null)]);
  if (!hist) return <div className="card"><p className="muted small">Diario non disponibile: applica la migrazione <code>0016</code> su Supabase.</p></div>;
  const today = todayKey();
  const days = Array.from({ length: MOOD_DAYS }, (_, i) => addDays(today, i - (MOOD_DAYS - 1)));
  const byDay = new Map(hist.map((d) => [d.day, d]));
  const pts = days.flatMap((day, i) => {
    const v = moodIndex(byDay.get(day)?.scores ?? {});
    return v === null ? [] : [{ x: i, y: v, label: day }];
  });
  const todayRow = byDay.get(today);
  const done = days.filter((d) => byDay.get(d)?.completed).length;
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Umore · ultime 2 settimane</h3><span className="muted small">{todayRow?.completed ? "check-in di oggi fatto" : "il check-in arriva alle 22"}</span></div>
        {pts.length >= 2 ? <AreaLine points={pts} color="#bf5af2" height={180} yFormat={(v) => `${Math.round(v)}`} xFormat={(v) => formatDayShort(days[Math.round(v)] ?? today)} /> : <p className="muted small">Servono almeno due sere di diario per disegnare l&apos;andamento.</p>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Costanza</h3><span className="muted small">{done}/{MOOD_DAYS} check-in{social !== null ? ` · ${social} ${social === 1 ? "contatto sociale" : "contatti sociali"} in 14 giorni` : ""}</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {days.map((d) => {
            const ok = byDay.get(d)?.completed;
            return <span key={d} title={`${formatDayShort(d)}: ${ok ? "check-in fatto" : "nessun check-in"}`} style={{ width: 18, height: 18, borderRadius: 9, background: ok ? "#bf5af2" : "var(--faint)", opacity: ok ? 1 : 0.5, outline: d === today ? "2px solid var(--muted)" : undefined }} />;
          })}
        </div>
      </div>
      <details className="card" open={!todayRow?.completed}>
        <summary className="muted small" style={{ cursor: "pointer" }}>Diario di oggi · tocca un numero (1 male, 5 benissimo; stress: 5 = tantissimo)</summary>
        <div style={{ marginTop: 10 }}>
          <MoodDiary aspects={MOOD_ASPECTS.map((a) => ({ key: a.key, label: a.label, question: a.question }))} scores={todayRow?.scores ?? {}} />
        </div>
      </details>
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
          <span className="muted small">{p.status === "known" ? <Icon name="check" size={14} /> : p.status === "review" ? <Icon name="rotate" size={14} /> : "·"}</span>
        </div>
      ))}
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
      <LiveModeCard />
      <PushToggle />
      <WidgetCard />
      <ProposalsPanel />
      <BrainPanel brain={brain} />
    </>
  );
}

export async function ProfilePanel() {
  const facts = await getProfile().catch(() => null);
  if (!facts) return <div className="card"><p className="muted small">Dati formali non disponibili: applica la migrazione <code>profile_facts</code>.</p></div>;
  return (
    <div className="card">
      <div className="card-head"><h3>Dati formali</h3><span className="muted small">anagrafica e contatti, solo nel database</span></div>
      {facts.map((f) => (
        <form action={setProfileFactAction} className="hub-form" key={f.key} style={{ marginBottom: 6 }}>
          <input type="hidden" name="key" value={f.key} />
          <span className="time" style={{ width: 140 }}>{f.label}</span>
          <input name="value" defaultValue={f.value} placeholder="—" maxLength={500} style={{ flex: 1, minWidth: 160 }} />
          <button type="submit">Salva</button>
        </form>
      ))}
    </div>
  );
}

/** Note proposte da Aira in attesa di conferma (prima si confermavano con i bottoni su Telegram). */
export async function ProposalsPanel() {
  const { data } = await supabase.from("kb_proposals").select("id, content, replaces, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10);
  const pending = data ?? [];
  if (!pending.length) return null;
  const oldIds = [...new Set(pending.flatMap((p) => (p.replaces ?? []) as string[]))];
  const old = new Map<string, string>();
  if (oldIds.length) {
    const { data: docs } = await supabase.from("documents").select("id, content").in("id", oldIds);
    for (const d of docs ?? []) old.set(String(d.id), String(d.content));
  }
  return (
    <div className="card">
      <div className="card-head"><h3>Note da confermare</h3><span className="muted small">{pending.length} in attesa</span></div>
      {pending.map((p) => {
        const replaced = ((p.replaces ?? []) as string[]).map((id) => old.get(id)).filter(Boolean);
        return (
          <div className="agenda-row" key={String(p.id)} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>{String(p.content)}</b>
              {replaced.map((t, i) => <p key={i} className="muted small" style={{ margin: "4px 0 0" }}>Sostituirebbe: {t}</p>)}
            </div>
            <form action={decideProposalAction} style={{ display: "flex", gap: 6 }}>
              <input type="hidden" name="id" value={String(p.id)} />
              <button type="submit" name="accept" value="1">È vero, salva</button>
              <button type="submit" name="accept" value="0">Scarta</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
