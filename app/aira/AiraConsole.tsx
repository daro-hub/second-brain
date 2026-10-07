"use client";

import Link from "next/link";
import { CloseIcon, MicIcon, PulseIcon, SendIcon, SourceIcon, StopIcon, TrashIcon, VolumeIcon, WaveIcon } from "./icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Source, SourceId } from "../../src/lib/trace";
import type { Phase } from "./Orb";
import type { AiraVoice } from "./useAiraVoice";
import { RestTimer } from "./RestTimer";
import "./aira.css";
import { Icon } from "../components/Icon";

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
  /** messaggio di una conversazione precedente (caricato dalla cronologia condivisa) e da dove arrivava */
  via?: string;
}


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

const WELCOME: Msg = {
  id: 0,
  role: "aira",
  html: "Ciao Daro, sono <b>Aira</b>. Scrivimi, oppure attiva la modalità live e parliamo: ti dico anche da quali dati prendo le risposte.",
  sources: [],
};

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
  channel?: string;
}

/** Intenti che parlano di allenamento: con questi compaiono i pulsanti del timer di recupero. */
const GYM_INTENTS = new Set(["workout", "exercise_query", "session_query", "gym_plan", "routine_preview", "clarify"]);

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
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
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
    rtHandlersRef,
    sendTextLive,
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

  // La conversazione è una sola, condivisa con Telegram: all'apertura (e ogni volta che si riapre la console) si ricaricano
  // gli ultimi messaggi. Se in questa sessione hai già scritto qui, si tiene quello che vedi (ha anche le fonti dati).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/aira/history", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { turns?: HistoryTurn[] } | null) => {
        if (cancelled || !data?.turns || sendingRef.current) return;
        const onlyHistory = messagesRef.current.every((m) => m.id === 0 || m.via);
        if (!onlyHistory) return;
        const past: Msg[] = data.turns.map((t) => {
          const id = idRef.current++;
          return t.role === "user"
            ? { id, role: "user", text: t.content, sources: [], via: t.channel }
            : { id, role: "aira", html: escapeHtml(t.content), sources: [], via: t.channel };
        });
        setMessages(past.length ? past : [WELCOME]);
      })
      .catch(() => undefined); // senza cronologia si riparte dal saluto: non è un errore da mostrare
    return () => {
      cancelled = true;
    };
  }, [active]);

  const clearChat = async () => {
    if (sendingRef.current) return;
    if (!window.confirm("Svuotare la chat? Aira dimentica la conversazione recente, anche su Telegram. I messaggi già inviati su Telegram restano lì.")) return;
    const res = await fetch("/api/aira/history", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setNotice("Non sono riuscita a svuotare la chat.");
      return;
    }
    setSelectedId(null);
    setMessages([WELCOME]);
  };

  // ───────── chat ─────────
  /** Una richiesta alla pipeline di Aira: aggiorna la bolla (intento, fonti, risposta) e restituisce cosa dire a voce. */
  const runChat = useCallback(async (text: string, patch: (fn: (m: Msg) => Msg) => void): Promise<{ speech: string; sensitive: boolean }> => {
    const res = await fetch("/api/aira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(58_000),
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
    let result = { speech: "", sensitive: false };
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
          result = { speech: String(ev.speech ?? ""), sensitive: Boolean(ev.sensitive) };
        } else if (ev.t === "error") throw new Error(ev.message);
      }
    }
    return result;
  }, []);

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
        const r = await runChat(text, patch);
        if (!r.sensitive && (viaVoice || voiceRepliesRef.current || liveRef.current)) {
          spoke = true;
          void speak(r.speech);
        }
      } catch (err) {
        patch((m) => ({ ...m, pending: false, error: true, html: (err as Error).message || "Errore." }));
      }
      sendingRef.current = false;
      if (!spoke) beginListeningIfLive();
    },
    [beginListeningIfLive, liveRef, runChat, voiceRepliesRef, setHeard, setNotice, setPhaseBoth, speak, stopSpeaking],
  );

  useEffect(() => {
    onHeardRef.current = (text) => send(text, true);
  }, [onHeardRef, send]);

  // Sessione live (realtime): il modello parla, qui compaiono le bolle. Le richieste sui dati passano dal tool e
  // riusano la stessa pipeline della chat, quindi la bolla ha intento e fonti come sempre.
  useEffect(() => {
    rtHandlersRef.current = {
      onUser: (text) => setMessages((m) => [...m, { id: idRef.current++, role: "user", text, sources: [], viaVoice: true }]),
      onAssistant: (text) => setMessages((m) => [...m, { id: idRef.current++, role: "aira", html: escapeHtml(text), sources: [] }]),
      onAsk: async (request) => {
        const airaId = idRef.current++;
        setMessages((m) => [...m, { id: airaId, role: "aira", sources: [], pending: true }]);
        setSelectedId(airaId);
        const patch = (fn: (m: Msg) => Msg) => setMessages((all) => all.map((x) => (x.id === airaId ? fn(x) : x)));
        try {
          return await runChat(request, patch);
        } catch (err) {
          patch((m) => ({ ...m, pending: false, error: true, html: (err as Error).message || "Errore." }));
          throw err;
        }
      },
    };
    return () => {
      rtHandlersRef.current = null;
    };
  }, [rtHandlersRef, runChat]);

  // Messaggio vocale (mobile): un tocco registra, il secondo trascrive e invia come se avessi parlato; Aira risponde a voce.
  const [recording, setRecording] = useState(false);
  const noteRef = useRef<{ rec: MediaRecorder; stream: MediaStream } | null>(null);
  const toggleVoiceNote = useCallback(async () => {
    if (noteRef.current) {
      noteRef.current.rec.stop();
      return;
    }
    if (liveRef.current || sendingRef.current) return;
    ensureAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        noteRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        setPhaseBoth("thinking");
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
          const res = await fetch("/api/aira/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
          if (!res.ok) throw new Error(String(res.status));
          const { text } = (await res.json()) as { text: string };
          if (!text) {
            setNotice("Non ho sentito niente: riprova.");
            setPhaseBoth("idle");
            return;
          }
          setHeard(text);
          await send(text, true);
        } catch {
          setNotice("Non sono riuscita a trascrivere il vocale.");
          setPhaseBoth("idle");
        }
      };
      rec.start();
      noteRef.current = { rec, stream };
      setRecording(true);
      setNotice(null);
    } catch {
      setNotice("Non riesco ad accedere al microfono: controlla i permessi del browser.");
    }
  }, [ensureAudio, liveRef, send, setHeard, setNotice, setPhaseBoth]);

  // chiudendo la chat con una registrazione aperta, il microfono si rilascia
  useEffect(
    () => () => {
      const n = noteRef.current;
      if (n) {
        n.rec.onstop = null;
        n.stream.getTracks().forEach((t) => t.stop());
        noteRef.current = null;
      }
    },
    [],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input;
    setInput("");
    ensureAudio();
    if (v.trim() && sendTextLive(v.trim())) {
      setMessages((m) => [...m, { id: idRef.current++, role: "user", text: v.trim(), sources: [] }]);
      return;
    }
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
            {m.via === "telegram" && <span className="via-tag"><Icon name="telegram" size={12} /> Telegram</span>}
            {m.role === "user" ? (
              <>
                {m.viaVoice && <span className="mic-tag"><MicIcon size={12} /></span>}
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
                    <SourceIcon id={id} size={14} />
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <RestTimer show={Boolean(lastAira?.intent && GYM_INTENTS.has(lastAira.intent))} />
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
        <div className="aira-dock" role="toolbar" aria-label="Azioni della chat">
          <Link href="/?p=aira" className="aira-state" aria-label="Stato di Aira" title="Stato di Aira">
            <span className="ico" aria-hidden><PulseIcon size={16} /></span>
            <span className="lbl">Stato</span>
          </Link>
          <button type="button" className="aira-clear" onClick={() => void clearChat()} aria-label="Svuota chat" title="Svuota chat">
            <span className="ico" aria-hidden><TrashIcon size={16} /></span>
            <span className="lbl">Svuota</span>
          </button>
          <button type="button" className="aira-close" onClick={onClose} aria-label="Chiudi" title="Chiudi">
            <span className="ico" aria-hidden><CloseIcon size={16} /></span>
            <span className="lbl">Chiudi</span>
          </button>
        </div>
        <div className="orb-wrap" aria-hidden />
        <Link href="/?p=aira" className="aira-head" aria-label="Stato di Aira">
          <div className="aira-name">Aira</div>
          <div className={`status status-${phase}`}>
            <span className="pulse" />
            {STATUS[phase]}
          </div>
        </Link>
        <div className="heard">{phase === "listening" ? "Parla pure, ti ascolto…" : heard ? `“${heard}”` : " "}</div>
        {notice && <div className="notice">{notice}</div>}
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
              <span className="src-ico"><SourceIcon id={s.id} size={22} /></span>
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
          <span aria-hidden className="ico">{live ? <StopIcon size={16} /> : <WaveIcon size={18} />}</span>
          <span className="lbl"> LIVE</span>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={live ? "Sto ascoltando… oppure scrivi qui" : "Scrivi ad Aira…"}
          name="aira-message"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          enterKeyHint="send"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          aria-label="Messaggio per Aira"
        />
        <button
          type="button"
          className={`btn-rec${recording ? " on" : ""}`}
          onClick={() => void toggleVoiceNote()}
          disabled={live}
          title={recording ? "Ferma e invia il vocale" : "Registra un vocale"}
          aria-label={recording ? "Ferma e invia il vocale" : "Registra un vocale"}
          aria-pressed={recording}
        >
          {recording ? <StopIcon size={16} /> : <MicIcon size={18} />}
        </button>
        <button
          type="button"
          className={`btn-vol${voiceReplies ? " on" : ""}`}
          onClick={() => setVoiceReplies((v) => !v)}
          title="Risposte vocali anche per i messaggi scritti"
          aria-label="Risposte vocali"
          aria-pressed={voiceReplies}
        >
          <VolumeIcon on={voiceReplies} size={18} />
        </button>
        <button type="submit" className="btn-send" aria-label="Invia" disabled={!input.trim() || phase === "thinking"}>
          <span className="lbl">Invia</span>
          <span className="arrow" aria-hidden><SendIcon size={18} /></span>
        </button>
      </form>
    </div>
  );
}
