import type { Source } from "../../src/lib/trace";

export interface AiraReply {
  html: string;
  /** testo pulito da leggere a voce */
  speech: string;
  sensitive: boolean;
  sources: Source[];
}

/** Una domanda a /api/aira/chat: legge lo stream NDJSON e ritorna la risposta finale. Lancia con un messaggio leggibile. */
export async function askAira(text: string): Promise<AiraReply> {
  const res = await fetch("/api/aira/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 503
        ? "Aira sul web non è ancora abilitata: manca la password della dashboard sul server."
        : res.status === 401
          ? "Accesso negato: ricarica la pagina e inserisci la password."
          : "Non riesco a raggiungere il server.",
    );
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const sources: Source[] = [];
  let buf = "";
  let reply: AiraReply | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.t === "source") sources.push(ev.source as Source);
      else if (ev.t === "reply") reply = { html: ev.html, speech: ev.speech ?? "", sensitive: Boolean(ev.sensitive), sources };
      else if (ev.t === "error") throw new Error(ev.message);
    }
  }
  if (!reply) throw new Error("Risposta vuota.");
  return reply;
}
