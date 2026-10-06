"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

export interface BoardItem {
  id: string;
  kind: "text" | "file";
  content: string | null;
  fileName: string | null;
  fileSize: number | null;
  source: string;
  createdAt: string;
  expiresAt: string;
}

const MAX_MB = 50;
const fmtSize = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const URL_ONLY = /^https?:\/\/\S+$/;

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  if (min < 1440) return `${Math.round(min / 60)} h fa`;
  return `${Math.round(min / 1440)} g fa`;
}

function expiresIn(iso: string): string {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));
  return h >= 24 ? `scade tra ${Math.round(h / 24)} g` : `scade tra ${h} h`;
}

export function PassaggiBoard({ items, failed }: { items: BoardItem[]; failed: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "err"; text: string }>({ kind: "idle", text: "" });
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // le altre schermate vedono le novità: si ricarica ogni 15 secondi finché la scheda è visibile
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [router]);

  async function sendText(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus({ kind: "busy", text: "Invio…" });
    const res = await fetch("/api/passaggi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) }).catch(() => null);
    if (res?.ok) {
      setText("");
      setStatus({ kind: "ok", text: "Aggiunto." });
      router.refresh();
    } else setStatus({ kind: "err", text: "Invio non riuscito." });
  }

  async function sendFiles(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setStatus({ kind: "err", text: `${file.name} supera ${MAX_MB} MB.` });
        continue;
      }
      try {
        setStatus({ kind: "busy", text: `Carico ${file.name}…` });
        const slot = await fetch("/api/passaggi/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size }) });
        if (!slot.ok) throw new Error("slot");
        const { path, signedUrl } = await slot.json();
        const fd = new FormData();
        fd.append("cacheControl", "3600");
        fd.append("", file);
        const put = await fetch(signedUrl, { method: "PUT", body: fd });
        if (!put.ok) throw new Error("put");
        const done = await fetch("/api/passaggi/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, name: file.name, size: file.size, mime: file.type }) });
        if (!done.ok) throw new Error("register");
        setStatus({ kind: "ok", text: `${file.name} caricato.` });
        router.refresh();
      } catch {
        setStatus({ kind: "err", text: `Caricamento di ${file.name} non riuscito.` });
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void sendFiles([...e.dataTransfer.files]);
  }

  async function copy(item: BoardItem) {
    try {
      await navigator.clipboard.writeText(item.content ?? "");
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch {
      setStatus({ kind: "err", text: "Copia non riuscita: seleziona il testo a mano." });
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/passaggi?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.refresh();
    else setStatus({ kind: "err", text: "Eliminazione non riuscita." });
  }

  return (
    <section className="card passaggi" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop} data-over={over}>
      <div className="card-head">
        <h3>Passaggi</h3>
        <span className="uni-week-range">testi, link e file tra i tuoi dispositivi · scadono dopo 7 giorni</span>
      </div>

      <form className="pass-form" onSubmit={sendText}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Incolla un testo o un link…" rows={3} aria-label="Testo da passare" />
        <div className="pass-row">
          <button type="submit" disabled={!text.trim() || status.kind === "busy"}>Invia testo</button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={status.kind === "busy"}>Scegli file</button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void sendFiles([...(e.target.files ?? [])])} />
          <span className={`pass-status ${status.kind}`}>{status.text || `oppure trascina qui i file (max ${MAX_MB} MB)`}</span>
        </div>
      </form>

      {failed && <p className="exam-error">Non riesco a leggere l&apos;elenco in questo momento.</p>}
      {!failed && items.length === 0 && <p className="pass-empty">Niente in sospeso.</p>}

      <ul className="pass-list">
        {items.map((it) => (
          <li key={it.id}>
            <div className="pass-main">
              {it.kind === "text" ? (
                URL_ONLY.test(it.content ?? "") ? (
                  <a href={it.content!} target="_blank" rel="noopener noreferrer" className="pass-text">{it.content}</a>
                ) : (
                  <pre className="pass-text">{it.content}</pre>
                )
              ) : (
                <a href={`/api/passaggi/download?id=${it.id}`} className="pass-file">
                  <b>{it.fileName}</b>
                  {it.fileSize ? <span>{fmtSize(it.fileSize)}</span> : null}
                </a>
              )}
              <div className="pass-meta">
                {it.source === "telegram" ? "📨 Telegram" : "web"} · {ago(it.createdAt)} · {expiresIn(it.expiresAt)}
              </div>
            </div>
            <div className="exam-actions">
              {it.kind === "text" && <button type="button" onClick={() => void copy(it)}>{copied === it.id ? "Copiato ✓" : "Copia"}</button>}
              <button type="button" onClick={() => void remove(it.id)}>Elimina</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
