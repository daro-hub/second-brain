import type { MuscleProgress as Row } from "../../src/lib/muscleProgress";
import { STABLE_BAND } from "../../src/lib/progress";
import { Sparkline } from "../components/viz/small";

/** Una riga per gruppo muscolare: l'andamento della forza (base 100 sul primo log) e quanto è cambiata. */
export function MuscleProgress({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="muted small">Servono almeno 3 registrazioni di uno stesso esercizio per vedere i miglioramenti.</p>;
  return (
    <div>
      {rows.map((r) => {
        const kind = r.deltaPct >= STABLE_BAND ? "good" : r.deltaPct <= -STABLE_BAND ? "bad" : "";
        const color = kind === "bad" ? "var(--c-bad)" : kind === "good" ? "var(--c-good)" : "var(--muted)";
        return (
          <div className="agenda-row" key={r.group} style={{ alignItems: "center" }}>
            <span className="time" style={{ width: 90 }}>
              <b>{r.label}</b>
            </span>
            <span style={{ flex: 1, minWidth: 120 }}>
              <Sparkline values={r.series} color={color} width={200} height={30} />
            </span>
            <span className={`pill ${kind}`} title={`${r.exercises} ${r.exercises === 1 ? "esercizio" : "esercizi"}`}>
              {r.deltaPct > 0 ? "▲ +" : r.deltaPct < 0 ? "▼ −" : "= "}
              {Math.abs(r.deltaPct)}%
            </span>
          </div>
        );
      })}
      <p className="muted small" style={{ marginBottom: 0 }}>
        Variazione del massimale stimato (formula di Epley), media degli esercizi del gruppo, dal primo all&apos;ultimo allenamento registrato.
      </p>
    </div>
  );
}
