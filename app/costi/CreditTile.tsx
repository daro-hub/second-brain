"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Riquadro "Totale caricato": doppio click per modificarlo, Invio salva, Esc annulla. */
export function CreditTile({ total }: { total: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const done = useRef(false); // evita il doppio salvataggio Invio + blur

  function start() {
    done.current = false;
    setDraft(total === null ? "" : String(total));
    setError("");
    setEditing(true);
  }

  async function save() {
    if (done.current) return;
    done.current = true;
    const value = Number(draft.replace(",", "."));
    if (draft.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Importo non valido");
      done.current = false;
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(false);
      router.refresh();
    } catch {
      setError("Salvataggio non riuscito");
      done.current = false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tile credit-tile" style={{ ["--t" as string]: "#f5a524" }} onDoubleClick={() => !editing && start()} title="Doppio click per modificare">
      <div className="t-lbl">Totale caricato</div>
      {editing ? (
        <div className="t-val">
          <span className="credit-cur">$</span>
          <input
            className="credit-input"
            autoFocus
            inputMode="decimal"
            value={draft}
            disabled={busy}
            aria-label="Totale caricato in dollari"
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                done.current = true;
                setEditing(false);
              }
            }}
            onBlur={() => void save()}
          />
        </div>
      ) : (
        <div className="t-val">{total === null ? "—" : usd(total)}</div>
      )}
      <div className="t-sub">{error ? <span style={{ color: "var(--c-bad)" }}>{error}</span> : editing ? "Invio per salvare · Esc annulla" : "doppio click per modificare"}</div>
    </div>
  );
}
