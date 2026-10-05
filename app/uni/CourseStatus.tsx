"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Segna un insegnamento come superato (voto + data) oppure lo rimette tra quelli da dare. */
export function CourseStatus({ code, passed, grade, passedOn, today }: { code: string; passed: boolean; grade: string | null; passedOn: string | null; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(grade ?? "");
  const [d, setD] = useState(passedOn ?? today);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/uni/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...body }) });
      if (res.status === 400) throw new Error("Voto o data non validi (18–30, 30L, APP).");
      if (!res.ok) throw new Error("Salvataggio non riuscito.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore.");
    } finally {
      setBusy(false);
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    void send({ status: "passed", grade: g, passedOn: d });
  }

  if (!open) {
    return (
      <span className="course-status">
        <button type="button" onClick={() => setOpen(true)}>{passed ? "Modifica" : "Segna superato"}</button>
        {passed && (
          <button type="button" onClick={() => window.confirm("Rimettere tra gli esami da dare?") && void send({ status: "todo" })}>Annulla</button>
        )}
      </span>
    );
  }
  return (
    <form className="course-status open" onSubmit={submit}>
      <input value={g} onChange={(e) => setG(e.target.value)} placeholder="voto (es. 27, 30L)" size={9} aria-label="Voto" autoFocus disabled={busy} />
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} aria-label="Data" disabled={busy} />
      <button type="submit" disabled={busy}>Salva</button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>Annulla</button>
      {err && <span className="exam-error">{err}</span>}
    </form>
  );
}
