import Link from "next/link";
import { getProgressionSeries } from "../../src/lib/dashboard";
import { getStrengthLeaderboard } from "../../src/lib/insights";
import { dec, int, pace } from "../../src/lib/numfmt";
import { getActivityCalendar, isSeededLog } from "../../src/lib/overview";
import { getAllActivities } from "../../src/lib/strava";
import { supabase } from "../../src/lib/supabase";
import { addDays, formatDayShort, todayKey } from "../../src/lib/time";
import { getTrainingOverview } from "../../src/lib/training";
import { ActivityHeatmap, AreaLine } from "../components/viz/charts";
import { BodyStage } from "./BodyStage";
import { Radar } from "./Radar";
import { Icon, InsightGlyph } from "../components/Icon";

const TYPE_LABEL: Record<string, string> = { WeightTraining: "Pesi", Run: "Corsa", Walk: "Camminata" };
const TYPE_COLOR: Record<string, string> = { WeightTraining: "var(--c-weights)", Run: "var(--c-run)", Walk: "var(--c-walk)" };

export async function PalestraView({ exercise: selected }: { exercise?: string }) {
  const today = todayKey();
  const since = addDays(today, -29);

  const [overview, activities, strength, cal, recentLogsRaw] = await Promise.all([
    getTrainingOverview(),
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
      <div className="eyebrow">Allenamento</div>
      <h2>Centro prestazioni</h2>
      <p className="page-sub">
        Il tuo corpo, gruppo per gruppo: massimali stimati e progressione dai log del bot, battito da Apple Health, sessioni e orari reali da Strava.
        Passa sopra una zona o una scheda per il dettaglio; tocca FRONTE/RETRO per girare l&apos;avatar.
      </p>

      <BodyStage muscles={overview.muscles} heart={overview.heart} />

      <div className="hud-tiles">
        <div className="tile" style={{ ["--t" as string]: "#0a84ff" }}>
          <div className="t-lbl">Pesi · 30 giorni</div>
          <div className="t-val">{weights30.length}<small>sessioni</small></div>
          <div className="t-sub">{int(weights30.reduce((s, a) => s + a.movingTimeMin, 0))} minuti totali</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#bf5af2" }}>
          <div className="t-lbl">Corsa · 30 giorni</div>
          <div className="t-val">{dec(runKm)}<small>km</small></div>
          <div className="t-sub">{runs30.length} {runs30.length === 1 ? "uscita" : "uscite"}{runKm > 0 ? ` · ${pace(runMin / runKm)} /km` : ""}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#30d158" }}>
          <div className="t-lbl">Costanza · 28 giorni</div>
          <div className="t-val">{activeDays28}<small>/ 28 giorni</small></div>
          <div className="t-sub">almeno un&apos;attività su Strava</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff9f0a" }}>
          <div className="t-lbl">Volume sollevato</div>
          <div className="t-val">{dec(overview.totalVolumeKg / 1000)}<small>tonnellate</small></div>
          <div className="t-sub">{int(overview.totalSets)} serie · {int(overview.totalLogs)} log</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff453a" }}>
          <div className="t-lbl">Battito in allenamento</div>
          <div className="t-val">{overview.heart.sessionAvg !== null ? int(overview.heart.sessionAvg) : "—"}<small>bpm medi</small></div>
          <div className="t-sub">{overview.heart.sessionMax ? `picco ${int(overview.heart.sessionMax)} bpm` : "nessun dato nelle sessioni"}</div>
        </div>
        <div className="tile" style={{ ["--t" as string]: "#ff375f" }}>
          <div className="t-lbl">Miglior progresso</div>
          <div className="t-val" style={{ fontSize: 18, textTransform: "capitalize" }}>{strength[0]?.exercise ?? "—"}</div>
          <div className="t-sub">{strength[0] ? `+${int(strength[0].deltaPct)}% di massimale stimato` : "servono 3 sessioni per esercizio"}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Bilanciamento muscolare</h3></div>
          <Radar muscles={overview.muscles} />
          <p className="muted small" style={{ textAlign: "center", marginBottom: 0 }}>quota di volume per gruppo · tratteggio = equilibrio ideale</p>
        </div>
        <div className="card">
          <div className="card-head"><h3>Insight</h3><span className="muted small">calcolati sui tuoi dati</span></div>
          <ul className="insight-list">
            {overview.insights.map((i, k) => (
              <li key={k} className={i.tone}><span className="ic"><InsightGlyph glyph={i.icon} /></span><span>{i.text}</span></li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-head"><h3>Carico settimanale</h3><span className="muted small">minuti · 8 settimane</span></div>
          <div className="load-bars">
            {(() => {
              const peak = Math.max(1, ...overview.weekly.map((w) => w.minutes));
              return overview.weekly.map((w, i) => (
                <div key={w.weekStart} className={`bar${i === overview.weekly.length - 1 ? " now" : ""}`}>
                  <span className="v">{w.minutes}</span>
                  <div className="fill" style={{ height: `${Math.max(2, (w.minutes / peak) * 100)}%` }} title={`${w.sessions} sessioni`} />
                  <span className="d">{formatDayShort(w.weekStart).split(" ").slice(0, 2).join(" ")}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Rating di potenza per gruppo</h3>
          <span className="muted small">massimale stimato ÷ peso corporeo · la tacca è il livello intermedio</span>
        </div>
        {(() => {
          const rated = overview.muscles.filter((m) => m.rating !== null).sort((a, b) => (b.rating as number) - (a.rating as number));
          const weakest = rated.length >= 3 ? rated[rated.length - 1].group : null;
          return (
            <>
              {rated.map((m) => (
                <div key={m.group} className={`power-row${m.group === weakest ? " weak" : ""}`}>
                  <b>{m.label}{m.rank === 1 && <> <Icon name="star" size={13} /></>}{m.group === weakest && <> <Icon name="alert" size={13} /></>}</b>
                  <div className="bar"><i style={{ width: `${m.rating}%` }} /></div>
                  <span className="val"><b>{m.rating}</b> · {m.level}<br />{m.ratingExercise} · {dec(m.ratio ?? 0, 2)}× peso{/machine|macchina|pulley|cable|cavi|pushdown|extension|fly|pec deck|leg press|lat /i.test(m.ratingExercise ?? "") ? " (macchina ×0,6)" : ""}</span>
                </div>
              ))}
              {overview.muscles.filter((m) => m.rating === null).length > 0 && (
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Senza rating (servono almeno 3 serie): {overview.muscles.filter((m) => m.rating === null).map((m) => m.label).join(", ")}.
                </p>
              )}
              <div className="note">
                Indicativo: i riferimenti sono tabelle di forza generiche e le macchine non sono confrontabili con i pesi liberi (e hai cambiato palestra). Serve a confrontare i tuoi gruppi tra loro, non a misurarti contro altri.
              </div>
            </>
          );
        })()}
      </div>

      <div className="card">
        <div className="card-head"><h3>Costanza — ultime 12 settimane</h3><Link href="/?p=incroci" className="muted small">tutti gli incroci →</Link></div>
        <ActivityHeatmap days={cal.days} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Progressione — massimale stimato (Epley)</h3>
          <span className="muted small">per sessione · <Icon name="trophy" size={13} /> = nuovo massimale</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {strength.map((s) => (
            <Link
              key={s.exercise}
              href={`/?p=allenamento&detail=1&exercise=${encodeURIComponent(s.exercise)}`}
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
          <div className="card-head"><h3><Icon name="run" size={17} /> Corse (Strava)</h3></div>
          {runs.length > 1 && (
            <AreaLine
              color="#bf5af2"
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
