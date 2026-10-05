"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "ok"; text: string } | { kind: "err"; text: string };

export function UploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const files = data.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return;

    const done: string[] = [];
    try {
      for (const file of files) {
        setStatus({ kind: "busy", text: `Carico ${file.name}…` });
        const up = await fetch("/api/uni/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name }),
        });
        if (!up.ok) throw new Error((await up.json().catch(() => null))?.message ?? "Upload non riuscito");
        const { storagePath, signedUrl } = await up.json();

        const fd = new FormData();
        fd.append("cacheControl", "3600");
        fd.append("", file);
        const put = await fetch(signedUrl, { method: "PUT", body: fd });
        if (!put.ok) throw new Error(`Upload di ${file.name} non riuscito`);

        setStatus({ kind: "busy", text: `Salvo ${file.name} su GitHub…` });
        const commit = await fetch("/api/uni/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: Number(data.get("year")),
            subject: String(data.get("subject")),
            filename: file.name,
            storagePath,
          }),
        });
        if (!commit.ok) throw new Error(`Commit di ${file.name} non riuscito`);
        done.push((await commit.json()).path);
      }
      setStatus({ kind: "ok", text: `Caricati ${done.length} file in ${done[0].split("/").slice(0, -1).join("/")}` });
      form.reset();
      router.refresh();
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Errore" });
    }
  }

  return (
    <form className="card uni-upload" onSubmit={onSubmit}>
      <h3>Carica materiale grezzo</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="year" defaultValue="1" aria-label="Anno">
          <option value="1">Anno 1</option>
          <option value="2">Anno 2</option>
          <option value="3">Anno 3</option>
        </select>
        <input type="text" name="subject" placeholder="Materia (es. mathematical-analysis)" required autoComplete="off" />
        <input type="file" name="files" accept=".pdf,.png,.jpg,.jpeg" multiple required />
        <button type="submit" disabled={status.kind === "busy"}>
          Carica
        </button>
      </div>
      {status.kind !== "idle" && (
        <p style={{ marginTop: 8, color: status.kind === "err" ? "var(--c-bad)" : "var(--muted)" }}>{status.text}</p>
      )}
      <p style={{ marginTop: 8, color: "var(--faint)", fontSize: 12 }}>
        I file finiscono in <code>year-N/&lt;materia&gt;/raw/</code> con un commit su GitHub.
      </p>
    </form>
  );
}
