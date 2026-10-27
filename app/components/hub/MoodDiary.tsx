"use client";

import { useEffect, useRef, useState } from "react";
import { saveMoodScoreAction } from "../../actions/hub";
import type { MoodKey } from "../../../src/lib/mood";

interface Aspect {
  key: MoodKey;
  label: string;
  question: string;
}

/** Diario di oggi: la selezione cambia subito al tocco (stato locale), il salvataggio avviene in background. */
export function MoodDiary({ aspects, scores }: { aspects: Aspect[]; scores: Partial<Record<MoodKey, number>> }) {
  const [local, setLocal] = useState(scores);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  // le risposte partono in ordine: l'ultima toccata per ogni aspetto è quella che resta
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (status !== "saving") setLocal(scores);
  }, [scores]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(key: MoodKey, value: number) {
    const prev = local[key];
    if (prev === value) return;
    setLocal((s) => ({ ...s, [key]: value }));
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      const ok = await saveMoodScoreAction(key, value).catch(() => false);
      if (!ok) setLocal((s) => ({ ...s, [key]: prev }));
      setStatus(ok ? "saved" : "error");
    });
  }

  return (
    <>
      {aspects.map((a) => (
        <div className="mood-row" key={a.key}>
          <span className="time" title={a.question}>{a.label}</span>
          <span className="mood-scale">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" onClick={() => pick(a.key, v)} className={local[a.key] === v ? "on" : ""} aria-pressed={local[a.key] === v} aria-label={`${a.label} ${v}`}>{v}</button>
            ))}
          </span>
        </div>
      ))}
      <p className="muted small" role="status" aria-live="polite" style={{ margin: "6px 0 0", minHeight: 18 }}>
        {status === "saving" ? "Salvo…" : status === "saved" ? "Salvato" : status === "error" ? "Non salvato: riprova." : ""}
      </p>
    </>
  );
}
