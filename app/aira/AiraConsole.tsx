"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Source, SourceId } from "../../src/lib/trace";
import type { BrainSnapshot } from "../../src/lib/brain";
import { BrainView } from "./BrainView";
import { Orb, type Phase } from "./Orb";
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

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
}

export function AiraConsole({ brain, initialView = "console" }: { brain: BrainSnapshot; initialView?: "console" | "brain" }) {
  const [view, setView] = useState<"console" | "brain">(initialView);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 0,
      role: "aira",
      html: "Ciao Daro, sono <b>Aira</b>. Scrivimi, oppure attiva la modalità live e parliamo: ti dico anche da quali dati prendo le risposte.",
      sources: [],
    },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [clock, setClock] = useState("");

  // refs "vivi" letti dai loop audio (evitano closure stantie)
  const phaseRef = useRef<Phase>("idle");
  const liveRef = useRef(false);
  const voiceRepliesRef = useRef(false);
  const idRef = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outElRef = useRef<HTMLAudioElement | null>(null);
  const specBuf = useRef<Uint8Array | null>(null);
  const levelRef = useRef(0);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; startedAt: number; send: boolean } | null>(null);
  const vadRef = useRef({ floor: 0.01, speaking: false, speechStart: 0, lastVoice: 0 });

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ───────── audio ─────────
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const el = new Audio();
      el.preload = "auto";
      outElRef.current = el;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      ctx.createMediaElementSource(el).connect(analyser);
      analyser.connect(ctx.destination);
      outAnalyserRef.current = analyser;
    }
    void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const endSegment = useCallback((sendIt: boolean) => {
    const seg = recRef.current;
    if (!seg) return;
    seg.send = sendIt;
    if (seg.rec.state !== "inactive") seg.rec.stop();
    else recRef.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    const el = outElRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
  }, []);

  const beginListeningIfLive = useCallback(() => {
    // ripartenza pulita: niente audio residuo (compresa la voce di Aira) nel prossimo segmento
    vadRef.current.speaking = false;
    endSegment(false);
    if (liveRef.current) {
      setPhaseBoth("listening");
    } else {
      setPhaseBoth("idle");
    }
  }, [endSegment, setPhaseBoth]);

  const speak = useCallback(
    async (text: string) => {
      if (!text) {
        beginListeningIfLive();
        return;
      }
      ensureAudio();
      setPhaseBoth("speaking");
      try {
        const res = await fetch("/api/aira/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        const el = outElRef.current!;
        // se nel frattempo l'utente ha interrotto, non si parte
        if (phaseRef.current !== "speaking") {
          URL.revokeObjectURL(url);
          return;
        }
        el.src = url;
        el.onended = () => {
          URL.revokeObjectURL(url);
          if (phaseRef.current === "speaking") beginListeningIfLive();
        };
        el.onerror = () => {
          URL.revokeObjectURL(url);
          if (phaseRef.current === "speaking") beginListeningIfLive();
        };
        await el.play();
      } catch {
        setNotice("Non riesco a usare la voce in questo momento: ti rispondo solo per iscritto.");
        if (phaseRef.current === "speaking") beginListeningIfLive();
      }
    },
    [beginListeningIfLive, ensureAudio, setPhaseBoth],
  );

  // ───────── chat ─────────
  const send = useCallback(
    async (raw: string, viaVoice: boolean) => {
      const text = raw.trim();
      if (!text || phaseRef.current === "thinking") return;
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
      if (!spoke) beginListeningIfLive();
    },
    [beginListeningIfLive, setPhaseBoth, speak, stopSpeaking],
  );

  // ───────── microfono / VAD ─────────
  const transcribeAndSend = useCallback(
    async (blob: Blob) => {
      setPhaseBoth("thinking");
      try {
        const res = await fetch("/api/aira/transcribe", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
        if (!res.ok) throw new Error(String(res.status));
        const { text } = (await res.json()) as { text: string };
        if (!text) {
          beginListeningIfLive();
          return;
        }
        setHeard(text);
        await send(text, true);
      } catch {
        setNotice("Non sono riuscita a trascrivere l'audio.");
        beginListeningIfLive();
      }
    },
    [beginListeningIfLive, send, setPhaseBoth],
  );

  const startSegment = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream || recRef.current) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const seg = { rec, chunks: [] as Blob[], startedAt: performance.now(), send: false };
    rec.ondataavailable = (e) => e.data.size && seg.chunks.push(e.data);
    rec.onstop = () => {
      if (recRef.current === seg) recRef.current = null;
      if (seg.send && seg.chunks.length) void transcribeAndSend(new Blob(seg.chunks, { type: rec.mimeType || mime || "audio/webm" }));
    };
    rec.start(250);
    recRef.current = seg;
  }, [transcribeAndSend]);


  // un solo loop per frame: livello per l'orb + rilevamento del parlato
  useEffect(() => {
    let raf = 0;
    const td = new Uint8Array(1024);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const ph = phaseRef.current;
      const now = performance.now();

      if (ph === "speaking" && outAnalyserRef.current) {
        const a = outAnalyserRef.current;
        if (!specBuf.current || specBuf.current.length !== a.frequencyBinCount) specBuf.current = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(specBuf.current as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < 40; i++) sum += specBuf.current[i];
        levelRef.current = Math.min(1, sum / 40 / 160);
        return;
      }

      const a = micAnalyserRef.current;
      if (!a || !liveRef.current || ph !== "listening") {
        levelRef.current *= 0.9;
        specBuf.current = null;
        return;
      }

      if (!specBuf.current || specBuf.current.length !== a.frequencyBinCount) specBuf.current = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(specBuf.current as Uint8Array<ArrayBuffer>);
      a.getByteTimeDomainData(td.subarray(0, a.fftSize) as Uint8Array<ArrayBuffer>);
      let acc = 0;
      for (let i = 0; i < a.fftSize; i++) {
        const v = (td[i] - 128) / 128;
        acc += v * v;
      }
      const rms = Math.sqrt(acc / a.fftSize);
      levelRef.current = Math.min(1, rms * 6);

      const vad = vadRef.current;
      if (!vad.speaking) vad.floor = Math.max(0.004, vad.floor * 0.97 + rms * 0.03);
      const threshold = Math.max(0.03, vad.floor * 3.2);

      startSegment();
      const seg = recRef.current;

      if (rms > threshold) {
        vad.lastVoice = now;
        if (!vad.speaking) {
          vad.speaking = true;
          vad.speechStart = now;
        }
      }
      if (vad.speaking && now - vad.lastVoice > 1100) {
        const spoke = vad.lastVoice - vad.speechStart;
        vad.speaking = false;
        if (spoke > 350) endSegment(true);
        else endSegment(false);
      } else if (vad.speaking && now - vad.speechStart > 30000) {
        vad.speaking = false;
        endSegment(true);
      } else if (!vad.speaking && seg && now - seg.startedAt > 6000) {
        // segmento di solo silenzio: si butta e se ne riparte uno nuovo (niente audio accumulato)
        endSegment(false);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endSegment, startSegment]);

  const stopLive = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    endSegment(false);
    vadRef.current.speaking = false;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    if (phaseRef.current === "listening") setPhaseBoth("idle");
  }, [endSegment, setPhaseBoth]);

  const startLive = useCallback(async () => {
    setNotice(null);
    try {
      const ctx = ensureAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      micAnalyserRef.current = analyser;
      vadRef.current = { floor: 0.01, speaking: false, speechStart: 0, lastVoice: 0 };
      liveRef.current = true;
      setLive(true);
      if (phaseRef.current === "idle") setPhaseBoth("listening");
    } catch {
      setNotice("Non riesco ad accedere al microfono: controlla i permessi del browser.");
    }
  }, [ensureAudio, setPhaseBoth]);

  useEffect(() => {
    voiceRepliesRef.current = voiceReplies;
  }, [voiceReplies]);

  useEffect(() => () => {
    liveRef.current = false;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    outElRef.current?.pause();
    void audioCtxRef.current?.close();
  }, []);

  const onOrbClick = () => {
    if (phase === "speaking") {
      stopSpeaking();
      beginListeningIfLive();
    } else if (live) void stopLive();
    else void startLive();
  };

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
  // note della KB usate dalla risposta selezionata: la mappa del cervello le illumina
  const litDocs = new Set(shownSources.filter((x) => x.id === "kb").flatMap((x) => (x.items ?? []).map((i) => i.id).filter((v): v is string => Boolean(v))));

  return (
    <div className="aira-root">
      <div className="aira-grid" aria-hidden />
      <header className="aira-top">
        <Link href="/" className="aira-back">
          ← Dashboard
        </Link>
        <nav className="aira-tabs" role="tablist">
          <button role="tab" aria-selected={view === "console"} className={view === "console" ? "on" : ""} onClick={() => setView("console")}>
            Console
          </button>
          <button role="tab" aria-selected={view === "brain"} className={view === "brain" ? "on" : ""} onClick={() => setView("brain")}>
            Cervello <span className="count">{brain.totalDocuments}</span>
          </button>
        </nav>
        <div className="aira-title">
          <span className="aira-title-mark" />
          A·I·R·A
        </div>
        <div className="aira-clock">{clock}</div>
      </header>

      {view === "brain" && (
        <section className="aira-brain">
          <BrainView brain={brain} lit={litDocs} />
        </section>
      )}

      <section className="aira-log" ref={logRef} aria-live="polite" hidden={view === "brain"}>
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

      <section className="aira-core" hidden={view === "brain"}>
        <div className="orb-wrap">
          <Orb
            phase={phase}
            getLevel={() => levelRef.current}
            getSpectrum={() => specBuf.current}
            onClick={onOrbClick}
          />
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
        </div>
        <div className={`status status-${phase}`}>
          <span className="pulse" />
          {STATUS[phase]}
        </div>
        <div className="heard">{phase === "listening" ? "Parla pure, ti ascolto…" : heard ? `“${heard}”` : " "}</div>
        {notice && <div className="notice">{notice}</div>}
      </section>

      <aside className="aira-sources" hidden={view === "brain"}>
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
        >
          {live ? "■ LIVE" : "🎙 LIVE"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={live ? "Sto ascoltando… oppure scrivi qui" : "Scrivi ad Aira…"}
          autoComplete="off"
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
        <button type="submit" className="btn-send" disabled={!input.trim() || phase === "thinking"}>
          Invia
        </button>
      </form>
    </div>
  );
}
