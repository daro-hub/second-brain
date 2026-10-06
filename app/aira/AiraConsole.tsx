"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Source, SourceId } from "../../src/lib/trace";
import type { Phase } from "./Orb";
import type { AiraVoice } from "./useAiraVoice";
import "./aira.css";

interface Msg {
  id: number;
  role: "user" | "aira";
  text?: string;
  html?: string;
  sources: Source[];
  intent?: string;
  sensitive?: boolean;
  pending?: boolean;
  error?: boolean;
  viaVoice?: boolean;
}

const ICONS: Record<SourceId, string> = {
  kb: "🧠",
  calendar: "📅",
  study: "📚",
  gym: "🏋️",
  strava: "🏃",
  health: "❤️",
  energy: "🔥",
  shopping: "🛒",
  github: "🐙",
  linear: "📐",
  gmail: "✉️",
  bitwarden: "🔐",
};

const INTENT_LABELS: Record<string, string> = {
  workout: "Registro allenamento",
  session_query: "Ultima sessione",
  password_request: "Richiesta password",
  github_query: "Progetto GitHub",
  linear_query: "Issue Linear",
  calendar_query: "Agenda",
  calendar_add: "Nuovo evento",
  strava_query: "Attività Strava",
  study_schedule_query: "Orario di studio",
  shopping_add: "Aggiunta alla spesa",
  shopping_done: "Spesa completata",
  shopping_query: "Lista della spesa",
  steps_query: "Passi",
  health_query: "Salute",
  energy_query: "Bilancio calorico",
  email_query: "Ricerca email",
  gym_plan: "Piano palestra",
  routine_preview: "Routine",
  none: "Conversazione",
};

const SUGGESTIONS = ["Cosa ho in agenda oggi?", "Quante calorie ho mangiato oggi?", "Cosa devo comprare?", "Come stanno andando le mie corse?"];

const STATUS: Record<Phase, string> = {
  idle: "PRONTA",
  listening: "IN ASCOLTO",
  thinking: "ELABORO",
  speaking: "STO PARLANDO",
};

/** La risposta arriva nel dialetto HTML di Telegram (b/i/u/s/code/pre/a): si lascia passare solo quello, con link http(s). */
function safeHtml(html: string): string {
  return html
    .replace(/<a href="([^"]*)">/g, (_m, href: string) =>
      /^https?:\/\//i.test(href) ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>",
    )
    .replace(/\n/g, "<br/>");
}

/**
 * Chat (a sinistra) e fonti dati (a destra) di Aira, dentro lo stage del hub. L'orb al centro è quello dello stage
 * e la voce è condivisa (`voice`): qui c'è solo la conversazione. Resta montata anche quando è nascosta, così la
 * cronologia non si perde tornando alla panoramica.
 */
export function AiraConsole({ voice, active, onClose }: { voice: AiraVoice; active: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 0,
      role: "aira",
      html: "Ciao Daro, sono <b>Aira</b>. Scrivimi, oppure attiva la modalità live e parliamo: ti dico anche da quali dati prendo le risposte.",
      sources: [],
    },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [input, setInput] = useState("");

  const {
    phase,
    phaseRef,
    live,
    liveRef,
    voiceReplies,
    setVoiceReplies,
    voiceRepliesRef,
    notice,
    setNotice,
    heard,
    setHeard,
    onHeardRef,
    ensureAudio,
    speak,
    stopSpeaking,
    beginListeningIfLive,
    setPhaseBoth,
    startLive,
    stopLive,
  } = voice;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  // refs "vivi" letti dai loop audio (evitano closure stantie)
  const idRef = useRef(1);
  // Un solo invio alla volta. NON si usa la fase "elaboro" come guardia: la mette già la trascrizione del parlato
  // (transcribeAndSend) prima di chiamare send, e con quella guardia la modalità live restava bloccata per sempre.
  const sendingRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    // istantaneo (non "smooth"): l'animazione viene sospesa se la scheda non è in primo piano e l'ultimo messaggio restava fuori vista
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  // ───────── chat ─────────
  const send = useCallback(
    async (raw: string, viaVoice: boolean) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      stopSpeaking();
      setNotice(null);
      setHeard("");
      const userId = idRef.current++;
      const airaId = idRef.current++;
      setMessages((m) => [
        ...m,
        { id: userId, role: "user", text, sources: [], viaVoice },
        { id: airaId, role: "aira", sources: [], pending: true },
      ]);
      setSelectedId(airaId);
      setPhaseBoth("thinking");

      const patch = (fn: (m: Msg) => Msg) => setMessages((all) => all.map((x) => (x.id === airaId ? fn(x) : x)));
      let spoke = false;
      try {
        const res = await fetch("/api/aira/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok || !res.body) {
          const msg =
            res.status === 503
              ? "Aira sul web non è ancora abilitata: manca la password della dashboard sul server."
              : res.status === 401
                ? "Accesso negato: ricarica la pagina e inserisci la password."
                : "Non riesco a raggiungere il server.";
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
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
            if (ev.t === "intent") patch((m) => ({ ...m, intent: ev.type }));
            else if (ev.t === "source") patch((m) => ({ ...m, sources: [...m.sources, ev.source as Source] }));
            else if (ev.t === "reply") {
              patch((m) => ({ ...m, html: ev.html, pending: false, sensitive: ev.sensitive }));
              if (!ev.sensitive && (viaVoice || voiceRepliesRef.current || liveRef.current)) {
                spoke = true;
                void speak(ev.speech);
              }
            } else if (ev.t === "error") throw new Error(ev.message);
          }
        }
      } catch (err) {
        patch((m) => ({ ...m, pending: false, error: true, html: (err as Error).message || "Errore." }));
      }
      sendingRef.current = false;
      if (!spoke) beginListeningIfLive();
    },
    [beginListeningIfLive, liveRef, voiceRepliesRef, setHeard, setNotice, setPhaseBoth, speak, stopSpeaking],
  );

  useEffect(() => {
    onHeardRef.current = (text) => send(text, true);
  }, [onHeardRef, send]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input;
    setInput("");
    ensureAudio();
    void send(v, false);
  };

  const lastAira = [...messages].reverse().find((m) => m.role === "aira" && (m.sources.length || m.pending || m.intent));
  const shown = messages.find((m) => m.id === selectedId) ?? lastAira;
  const shownSources = shown?.sources ?? [];
  return (
    <div className={`aira-root embedded${active ? "" : " off"}`} aria-hidden={!active}>
      <section className="aira-log" ref={logRef} aria-live="polite">
        <div className="hud-label">CONVERSAZIONE</div>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.role}${m.error ? " error" : ""}${shown?.id === m.id ? " selected" : ""}`}
            onClick={() => m.role === "aira" && setSelectedId(m.id)}
          >
            {m.role === "user" ? (
              <>
                {m.viaVoice && <span className="mic-tag">🎙</span>}
                {m.text}
              </>
            ) : m.pending ? (
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
            ) : m.sensitive ? (
              <span className="secret">
                {revealed.has(m.id) ? (
                  <span dangerouslySetInnerHTML={{ __html: m.html ?? "" }} />
                ) : (
                  <span>••••••••••</span>
                )}
                <button
                  className="reveal"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevealed((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    });
                  }}
                >
                  {revealed.has(m.id) ? "Nascondi" : "Mostra"}
                </button>
              </span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: safeHtml(m.html ?? "") }} />
            )}
            {m.role === "aira" && m.sources.length > 0 && !m.pending && (
              <div className="chips">
                {Array.from(new Set(m.sources.map((s) => s.id))).map((id) => (
                  <span key={id} className="chip">
                    {ICONS[id]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {messages.length === 1 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  ensureAudio();
                  void send(s, false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="aira-core">
        <Link href="/?p=aira" className="aira-state" aria-label="Stato di Aira">
          <span className="dot" aria-hidden />
          Stato
        </Link>
        <div className="orb-wrap" aria-hidden />
        <div className="aira-name">Aira</div>
        <div className={`status status-${phase}`}>
          <span className="pulse" />
          {STATUS[phase]}
        </div>
        <div className="heard">{phase === "listening" ? "Parla pure, ti ascolto…" : heard ? `“${heard}”` : " "}</div>
        {notice && <div className="notice">{notice}</div>}
        <button type="button" className="aira-close" onClick={onClose} aria-label="Chiudi">
          <span className="arrow" aria-hidden>✕</span>
          <span className="lbl"> Chiudi</span>
        </button>
      </section>

      <aside className="aira-sources">
        <div className="hud-label">
          FONTI DATI
          {shown?.intent && <span className="intent-tag">{INTENT_LABELS[shown.intent] ?? shown.intent}</span>}
        </div>
        {shown?.pending && shownSources.length === 0 && <div className="scan">Interrogo le fonti…</div>}
        {!shown && <p className="empty">Le fonti da cui Aira prende i dati compariranno qui, con il link alla dashboard dedicata.</p>}
        {shown && !shown.pending && shownSources.length === 0 && (
          <p className="empty">Nessuna fonte esterna per questa risposta: è una risposta di conversazione.</p>
        )}
        {shownSources.map((s, i) => (
          <article key={`${shown?.id}-${i}`} className="src-card" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="src-head">
              <span className="src-ico">{ICONS[s.id]}</span>
              <div>
                <div className="src-label">{s.label}</div>
                <div className="src-sum">{s.summary}</div>
              </div>
            </div>
            {s.items && s.items.length > 0 && (
              <ul>
                {s.items.slice(0, 6).map((it, j) => (
                  <li key={j}>
                    {it.href ? (
                      <a href={it.href} target="_blank" rel="noopener noreferrer">
                        {it.text}
                      </a>
                    ) : (
                      <span>{it.text}</span>
                    )}
                    {it.meta && <em>{it.meta}</em>}
                  </li>
                ))}
                {s.items.length > 6 && <li className="more">+ altre {s.items.length - 6}</li>}
              </ul>
            )}
            {s.href &&
              (s.href.startsWith("http") ? (
                <a className="src-link" href={s.href} target="_blank" rel="noopener noreferrer">
                  Apri {s.label} →
                </a>
              ) : (
                <Link className="src-link" href={s.href}>
                  Apri nella dashboard →
                </Link>
              ))}
          </article>
        ))}
      </aside>

      <form className="aira-bar" onSubmit={submit}>
        <button
          type="button"
          className={`btn-mic${live ? " on" : ""}`}
          onClick={() => (live ? stopLive() : void startLive())}
          title={live ? "Termina la modalità live" : "Parla con Aira in diretta"}
          aria-label={live ? "Termina la modalità live" : "Parla con Aira in diretta"}
        >
          <span aria-hidden>{live ? "■" : "🎙"}</span>
          <span className="lbl"> LIVE</span>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={live ? "Sto ascoltando… oppure scrivi qui" : "Scrivi ad Aira…"}
          autoComplete="off"
          enterKeyHint="send"
          aria-label="Messaggio per Aira"
        />
        <button
          type="button"
          className={`btn-vol${voiceReplies ? " on" : ""}`}
          onClick={() => setVoiceReplies((v) => !v)}
          title="Risposte vocali anche per i messaggi scritti"
        >
          {voiceReplies ? "🔊" : "🔈"}
        </button>
        <button type="submit" className="btn-send" aria-label="Invia" disabled={!input.trim() || phase === "thinking"}>
          <span className="lbl">Invia</span>
          <span className="arrow" aria-hidden>↑</span>
        </button>
      </form>
    </div>
  );
}
