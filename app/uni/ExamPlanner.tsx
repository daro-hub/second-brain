"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { courseMeta } from "../../src/lib/courseMeta";

export interface CourseOpt {
  code: string;
  name: string;
  year: number;
  status: "passed" | "attending" | "todo";
  cfu: number;
  semesters?: number | null;
  hours?: number | null;
}
export interface ExamRow {
  id: number;
  courseCode: string;
  examDate: string;
  topics: string;
}

const fmtDate = (k: string) => `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

function daysLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  return diff > 0 ? `tra ${diff} giorni` : `${-diff} giorni fa`;
}

/** Esami che voglio dare in questa sessione: materia, data e argomenti. */
export function ExamPlanner({ courses, exams, today }: { courses: CourseOpt[]; exams: ExamRow[]; today: string }) {
  const router = useRouter();
  const names = new Map(courses.map((c) => [c.code, c.name]));
  const selectable = courses.filter((c) => c.status !== "passed");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [course, setCourse] = useState("");
  const [date, setDate] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setEditingId(null);
    setCourse("");
    setDate("");
    setTopics("");
    setError("");
  }

  function edit(e: ExamRow) {
    setEditingId(e.id);
    setCourse(e.courseCode);
    setDate(e.examDate);
    setTopics(e.topics);
    setError("");
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!course || !date) {
      setError("Scegli la materia e la data.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/uni/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId ?? undefined, courseCode: course, examDate: date, topics }),
      });
      if (!res.ok) throw new Error(String(res.status));
      reset();
      router.refresh();
    } catch {
      setError("Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Eliminare questo esame?")) return;
    const res = await fetch(`/api/uni/exams?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) reset();
      router.refresh();
    } else setError("Eliminazione non riuscita.");
  }

  return (
    <section className="card uni-exams">
      <div className="card-head">
        <h3>Esami di questa sessione</h3>
        <span className="uni-week-range">{exams.length ? `${exams.length} in programma` : "nessuno in programma"}</span>
      </div>

      {exams.length > 0 && (
        <ul className="exam-list">
          {exams.map((e) => (
            <li key={e.id} className={e.examDate < today ? "past" : ""}>
              <div className="exam-when">
                <b>{fmtDate(e.examDate)}</b>
                <span>{daysLabel(e.examDate, today)}</span>
              </div>
              <div className="exam-what">
                <b>{names.get(e.courseCode) ?? e.courseCode}</b>
                {e.topics && <p>{e.topics}</p>}
              </div>
              <div className="exam-actions">
                <button type="button" onClick={() => edit(e)}>Modifica</button>
                <button type="button" onClick={() => void remove(e.id)}>Elimina</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="exam-form" onSubmit={submit}>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Materia" disabled={busy}>
          <option value="">Materia…</option>
          {[1, 2, 3].map((y) => {
            const list = selectable.filter((c) => c.year === y);
            return (
              list.length > 0 && (
                <optgroup key={y} label={`${y}° anno`}>
                  {list.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} · {courseMeta(c)}
                      {c.status === "attending" ? " · frequentato" : ""}
                    </option>
                  ))}
                </optgroup>
              )
            );
          })}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data dell'esame" disabled={busy} />
        <textarea value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Argomenti (es. limiti, derivate, integrali)…" rows={2} aria-label="Argomenti" disabled={busy} />
        <div className="exam-form-row">
          <button type="submit" disabled={busy}>{editingId ? "Salva modifiche" : "Aggiungi esame"}</button>
          {editingId && (
            <button type="button" onClick={reset} disabled={busy}>Annulla</button>
          )}
          {error && <span className="exam-error">{error}</span>}
        </div>
      </form>
    </section>
  );
}
