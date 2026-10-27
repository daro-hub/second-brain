import Link from "next/link";
import { getHubData, PILLAR_ORDER, recordSnapshot } from "../../src/lib/pillars";
import { getScoreHistory, indexRows, pointsFor, progressOf, STABLE_BAND, type Progress } from "../../src/lib/progress";
import { todayKey } from "../../src/lib/time";
import { Sparkline } from "../components/viz/small";

const OTHER_LINKS = [
  { href: "/?p=incroci", label: "Statistiche" },
  { href: "/?p=spesa", label: "Spesa" },
  { href: "/?p=passaggi", label: "Trasferisci" },
  { href: "/?p=aira", label: "Stato di Aira" },
];

function Delta({ progress }: { progress: Progress }) {
  const { delta, spanDays } = progress;
  if (delta === null) return <span className="pill info">in raccolta</span>;
  const kind = delta >= STABLE_BAND ? "good" : delta <= -STABLE_BAND ? "bad" : "";
  const text = kind === "good" ? `▲ +${delta}` : kind === "bad" ? `▼ −${Math.abs(delta)}` : "= stabile";
  return (
    <span className={`pill ${kind}`} title={`rispetto a ${spanDays} giorni fa`}>
      {text} <small>in {spanDays} gg</small>
    </span>
  );
}

function names(labels: string[]) {
  return labels.join(", ");
}

/** La home: per ogni settore il punteggio di oggi e quanto è migliorato (o calato) nelle ultime settimane. */
export async function ProgressView() {
  const today = todayKey();
  const [hub, history] = await Promise.all([getHubData(), getScoreHistory()]);
  await recordSnapshot(Object.fromEntries(hub.pillars.map((p) => [p.key, p.score])));

  const cards = hub.pillars.map((p) => ({ p, progress: progressOf(pointsFor(history, p.key, p.score, today)) }));
  const total = progressOf(pointsFor(indexRows(history, PILLAR_ORDER), "index", hub.index, today));
  const up = cards.filter((c) => (c.progress.delta ?? 0) >= STABLE_BAND).map((c) => c.p.label);
  const down = cards.filter((c) => (c.progress.delta ?? 0) <= -STABLE_BAND).map((c) => c.p.label);

  return (
    <>
      <div className="card kpi" style={{ ["--kpi" as string]: "var(--accent)" }}>
        <div className="kpi-top">
          <span>Equilibrio generale</span>
          <Delta progress={total} />
        </div>
        <div className="kpi-value">
          {hub.index ?? "—"}
          <small>/ 100</small>
        </div>
        <div className="kpi-sub">
          {total.delta === null
            ? "Gli snapshot giornalieri si accumulano ogni volta che apri l'app: tra qualche giorno vedrai l'andamento."
            : [up.length ? `Migliorano: ${names(up)}.` : "", down.length ? `Calano: ${names(down)}.` : "", !up.length && !down.length ? "Tutto stabile." : ""]
                .filter(Boolean)
                .join(" ")}
        </div>
      </div>

      <div className="grid grid-2">
        {cards.map(({ p, progress }) => {
          const shown = p.measures.filter((m) => m.score !== null).slice(0, 3);
          return (
            <Link key={p.key} href={`/?p=${p.key}`} style={{ color: "inherit", textDecoration: "none" }}>
              <div className="card kpi" style={{ ["--kpi" as string]: p.color }}>
                <div className="kpi-top">
                  <span>{p.label}</span>
                  <Delta progress={progress} />
                </div>
                <div className="kpi-value">
                  {p.score ?? "—"}
                  <small>/ 100</small>
                </div>
                <Sparkline values={progress.series} color={p.color} width={220} height={34} />
                <div className="kpi-sub">{shown.length ? shown.map((m) => `${m.label} ${m.value}`).join(" · ") : "Nessun dato ancora"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="muted small" style={{ marginTop: 6 }}>
        Altro:{" "}
        {OTHER_LINKS.map((l, i) => (
          <span key={l.href}>
            {i > 0 && " · "}
            <Link href={l.href}>{l.label}</Link>
          </span>
        ))}
      </p>
    </>
  );
}
