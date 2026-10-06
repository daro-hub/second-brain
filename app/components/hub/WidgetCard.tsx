"use client";

import { useState } from "react";

/** Copia negli appunti la chiave del widget per Scriptable (da incollare quando lo script la chiede). */
export function WidgetCard() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/widget/key", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 503 ? "Il widget non è ancora configurato sul server." : "Chiave non disponibile.");
      const { key } = (await res.json()) as { key: string };
      await navigator.clipboard.writeText(key);
      setMsg("Chiave copiata: incollala in Scriptable quando lo script la chiede.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Copia non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Widget per la home</h3>
        <span className="muted small">punteggi dei pilastri, prossimo esame e agenda</span>
      </div>
      <p className="muted small">
        Serve l&apos;app gratuita Scriptable. Incolla lo script <code>docs/widget/aira-widget.js</code> (nel repo del sito) e, alla prima esecuzione, la chiave
        copiata qui sotto.
      </p>
      <div className="pass-row">
        <button type="button" onClick={() => void copy()} disabled={busy}>Copia la chiave del widget</button>
        <span className="pass-status">{msg}</span>
      </div>
    </div>
  );
}
