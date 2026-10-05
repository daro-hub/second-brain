"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Selezione dei PDF raw di una stessa lezione e conversione in un unico Markdown. */
export function RawActions({ files, enabled }: { files: string[]; enabled: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/uni/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selected, name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "Conversione non riuscita");
      setMsg(`Creato ${body.path}`);
      router.push(`/uni?path=${encodeURIComponent(body.path)}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Converti in Markdown</h3>
      {!enabled && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Parsing automatico non attivo (manca <code>ANTHROPIC_API_KEY</code>): per ora convertili con Claude Code.
        </p>
      )}
      <ul className="uni-list">
        {files.map((f) => (
          <li key={f}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(f)}
                disabled={!enabled}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f] : s.filter((x) => x !== f)))}
              />{" "}
              {f.split("/").pop()}
            </label>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome output (es. lecture-01-2026-09-29)" disabled={!enabled} />
        <button type="button" onClick={run} disabled={!enabled || busy || selected.length === 0 || !name.trim()}>
          {busy ? "Converto…" : "Converti"}
        </button>
      </div>
      {msg && <p style={{ marginTop: 8, color: "var(--muted)" }}>{msg}</p>}
    </div>
  );
}
