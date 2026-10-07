"use client";

import { useEffect, useRef, useState } from "react";
import { saveMoodNoteAction, saveMoodScoreAction } from "../../actions/hub";
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

/** Nota del giorno: il pulsante Salva compare solo se il testo è cambiato rispetto a quanto salvato. */
export function MoodNote({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const dirty = text.trim() !== saved.trim();

  useEffect(() => {
    setText(initial);
    setSaved(initial);
  }, [initial]);

  async function save() {
    setStatus("saving");
    const ok = await saveMoodNoteAction(text).catch(() => false);
    if (ok) setSaved(text);
    setStatus(ok ? "saved" : "error");
  }

  return (
    <div className="hub-form col">
      <textarea
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus("");
        }}
        placeholder="Cosa ha pesato sull'umore oggi? (facoltativo)"
      />
      <div className="pass-row">
        {dirty && <button type="button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Salvo…" : "Salva"}</button>}
        <span className="pass-status" role="status" aria-live="polite">{status === "saved" && !dirty ? "Salvato" : status === "error" ? "Non salvato: riprova." : ""}</span>
      </div>
    </div>
  );
}
