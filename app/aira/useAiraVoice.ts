"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASK_TOOL_NAME, IDLE_TIMEOUT_MS, MAX_SESSION_MS, summarizeSession, type SessionStats } from "../../src/lib/realtimeSession";
import { END_GAP_MS, joinParts, PHRASE_GAP_MS, readLiveMode, splitSentences, type LiveMode } from "../../src/lib/liveTurns";
import type { Phase } from "./Orb";

/** Cosa fa la console quando la sessione live produce testo o chiede dati: la voce resta qui, la chat resta lì. */
export interface RealtimeHandlers {
  onUser: (text: string) => void;
  onAssistant: (text: string) => void;
  onAsk: (request: string) => Promise<{ speech: string; sensitive: boolean }>;
}

interface RtEvent {
  type: string;
  transcript?: string;
  error?: { message?: string; code?: string };
  response?: { usage?: { output_token_details?: { audio_tokens?: number } }; status?: string; output?: { type: string; name?: string; call_id?: string; arguments?: string; content?: { transcript?: string }[] }[] };
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Tutta la parte vocale di Aira (microfono + rilevamento del parlato, trascrizione, sintesi) separata dalla chat,
 * così la usano sia la console /aira sia il dock del hub. Chi la usa registra in `onHeardRef` cosa fare
 * con il testo trascritto e chiama `speak` quando ha una risposta da leggere.
 */
export function useAiraVoice() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [heard, setHeard] = useState("");

  // refs "vivi" letti dai loop audio (evitano closure stantie)
  const phaseRef = useRef<Phase>("idle");
  const liveRef = useRef(false);
  const voiceRepliesRef = useRef(false);
  const onHeardRef = useRef<((text: string) => Promise<void>) | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outElRef = useRef<HTMLAudioElement | null>(null);
  const specBuf = useRef<Uint8Array | null>(null);
  const levelRef = useRef(0);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; startedAt: number; send: boolean } | null>(null);
  const vadRef = useRef({ floor: 0.01, speaking: false, speechStart: 0, lastVoice: 0 });
  // modalità a frasi: trascrizioni delle frasi del turno in corso, nell'ordine in cui sono state dette (null = in corso)
  const partsRef = useRef<{ text: string | null }[]>([]);
  const liveModeRef = useRef<LiveMode>("realtime");
  // lettura a pezzi: il "gettone" cambia a ogni risposta/interruzione e ferma il ciclo di riproduzione precedente
  const speakTokenRef = useRef(0);
  const playCancelRef = useRef<(() => void) | null>(null);

  // sessione live realtime (WebRTC verso OpenAI)
  const rtRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const rtAudioRef = useRef<HTMLAudioElement | null>(null);
  const rtOutAnalyserRef = useRef<AnalyserNode | null>(null);
  const rtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtIdleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rtStatsRef = useRef<SessionStats | null>(null);
  const rtLastUserRef = useRef(0);
  const afterToolRef = useRef(false);
  const rtHandlersRef = useRef<RealtimeHandlers | null>(null);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

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

  const rtSend = useCallback((ev: Record<string, unknown>): boolean => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return false;
    dc.send(JSON.stringify(ev));
    return true;
  }, []);

  const stopSpeaking = useCallback(() => {
    speakTokenRef.current++;
    playCancelRef.current?.();
    playCancelRef.current = null;
    if (rtRef.current) {
      // interruzione a tocco: ferma la risposta in corso e svuota l'audio già in coda
      if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
        rtSend({ type: "response.cancel" });
        rtSend({ type: "output_audio_buffer.clear" });
      }
      return;
    }
    const el = outElRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
  }, [rtSend]);

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

  /** Legge la risposta a pezzi (una frase o due alla volta): la sintesi del primo parte subito, mentre quella dei successivi si prepara. */
  const speak = useCallback(
    async (text: string) => {
      if (!text) {
        beginListeningIfLive();
        return;
      }
      ensureAudio();
      const token = ++speakTokenRef.current;
      setPhaseBoth("speaking");
      const chunks = splitSentences(text);
      const fetched: Promise<Blob>[] = [];
      // al massimo due sintesi in preparazione contemporaneamente (i servizi di voce limitano le richieste parallele)
      const prepare = (i: number) => {
        if (i < chunks.length && !fetched[i]) {
          const p = fetch("/api/aira/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: chunks[i] }),
          }).then((res) => {
            if (!res.ok) throw new Error(String(res.status));
            return res.blob();
          });
          p.catch(() => undefined); // l'errore lo gestisce il ciclo di riproduzione, qui niente "unhandled rejection"
          fetched[i] = p;
        }
      };
      prepare(0);
      prepare(1);
      try {
        for (let i = 0; i < chunks.length; i++) {
          const blob = await fetched[i];
          // se nel frattempo l'utente ha interrotto, non si parte
          if (speakTokenRef.current !== token) return;
          prepare(i + 2);
          const url = URL.createObjectURL(blob);
          const el = outElRef.current!;
          await new Promise<void>((resolve, reject) => {
            playCancelRef.current = resolve;
            el.src = url;
            el.onended = () => resolve();
            el.onerror = () => reject(new Error("playback"));
            el.play().catch(reject);
          });
          playCancelRef.current = null;
          URL.revokeObjectURL(url);
          if (speakTokenRef.current !== token) return;
        }
        if (phaseRef.current === "speaking") beginListeningIfLive();
      } catch {
        if (speakTokenRef.current !== token) return;
        setNotice("Non riesco a usare la voce in questo momento: ti rispondo solo per iscritto.");
        if (phaseRef.current === "speaking") beginListeningIfLive();
      }
    },
    [beginListeningIfLive, ensureAudio, setPhaseBoth],
  );

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
        await onHeardRef.current?.(text);
      } catch {
        setNotice("Non sono riuscita a trascrivere l'audio.");
        beginListeningIfLive();
      }
    },
    [beginListeningIfLive, setPhaseBoth],
  );

  /** Trascrive una frase del turno mentre si continua ad ascoltare: il testo si accoda in `partsRef` nell'ordine giusto. */
  const transcribePart = useCallback(async (blob: Blob) => {
    const part: { text: string | null } = { text: null };
    partsRef.current.push(part);
    try {
      const res = await fetch("/api/aira/transcribe", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
      if (!res.ok) throw new Error(String(res.status));
      part.text = ((await res.json()) as { text: string }).text ?? "";
    } catch {
      part.text = ""; // una frase persa non blocca il turno: si manda quello che si è capito
    }
  }, []);

  /** Fine turno: il testo di tutte le frasi va ad Aira. */
  const flushParts = useCallback(() => {
    const text = joinParts(partsRef.current.map((p) => p.text));
    partsRef.current = [];
    if (!text) {
      beginListeningIfLive();
      return;
    }
    setPhaseBoth("thinking");
    setHeard(text);
    void onHeardRef.current?.(text);
  }, [beginListeningIfLive, setPhaseBoth]);

  const startSegment = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream || recRef.current) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const seg = { rec, chunks: [] as Blob[], startedAt: performance.now(), send: false };
    rec.ondataavailable = (e) => e.data.size && seg.chunks.push(e.data);
    rec.onstop = () => {
      if (recRef.current === seg) recRef.current = null;
      if (seg.send && seg.chunks.length) {
        const blob = new Blob(seg.chunks, { type: rec.mimeType || mime || "audio/webm" });
        if (liveModeRef.current === "turns") void transcribePart(blob);
        else void transcribeAndSend(blob);
      }
    };
    rec.start(250);
    recRef.current = seg;
  }, [transcribeAndSend, transcribePart]);

  // un solo loop per frame: livello per l'orb + rilevamento del parlato
  useEffect(() => {
    let raf = 0;
    const td = new Uint8Array(1024);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const ph = phaseRef.current;
      const now = performance.now();

      const speakAnalyser = rtRef.current ? rtOutAnalyserRef.current : outAnalyserRef.current;
      if (ph === "speaking" && speakAnalyser) {
        const a = speakAnalyser;
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
      // in sessione realtime il rilevamento del parlato lo fa il server: qui serve solo il livello per l'orb
      if (rtRef.current) return;

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
      const turns = liveModeRef.current === "turns";
      if (turns && !vad.speaking && partsRef.current.length && now - vad.lastVoice > END_GAP_MS && partsRef.current.every((p) => p.text !== null)) {
        flushParts(); // silenzio abbastanza lungo e tutte le frasi già trascritte: il turno è finito
      }
      if (vad.speaking && now - vad.lastVoice > (turns ? PHRASE_GAP_MS : 1100)) {
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
  }, [endSegment, flushParts, startSegment]);

  const closeRealtime = useCallback(() => {
    if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
    rtTimerRef.current = null;
    if (rtIdleRef.current) clearInterval(rtIdleRef.current);
    rtIdleRef.current = null;
    rtRef.current = false;
    afterToolRef.current = false;
    const dc = dcRef.current;
    const pc = pcRef.current;
    dcRef.current = null;
    pcRef.current = null;
    if (dc) {
      dc.onmessage = null;
      dc.onclose = null;
      dc.close();
    }
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
    }
    const el = rtAudioRef.current;
    if (el) {
      el.pause();
      el.srcObject = null;
    }
    rtAudioRef.current = null;
    rtOutAnalyserRef.current = null;
  }, []);

  const stopLive = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    const stats = rtStatsRef.current;
    rtStatsRef.current = null;
    if (stats && stats.responses > 0) setNotice(summarizeSession(stats, Date.now()));
    closeRealtime();
    endSegment(false);
    partsRef.current = [];
    vadRef.current.speaking = false;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    if (phaseRef.current !== "idle") setPhaseBoth("idle");
  }, [closeRealtime, endSegment, setNotice, setPhaseBoth]);
  const stopLiveRef = useRef(stopLive);
  stopLiveRef.current = stopLive;

  /** Esegue le chiamate al tool ask_aira di una risposta e restituisce i risultati al modello, che li dirà a voce. */
  const runToolCalls = useCallback(
    async (calls: { call_id?: string; arguments?: string }[]) => {
      setPhaseBoth("thinking");
      await Promise.all(
        calls.map(async (c) => {
          let output = "Non sono riuscita a completare la richiesta: dillo a Francesco in modo breve.";
          try {
            const request = String((JSON.parse(c.arguments || "{}") as { request?: unknown }).request ?? "").trim();
            const r = await rtHandlersRef.current!.onAsk(request);
            output = r.sensitive ? "Il contenuto è sensibile ed è stato mostrato a schermo: non leggerlo ad alta voce, di' solo che è sullo schermo." : r.speech || "Fatto.";
          } catch {
            /* resta il messaggio di errore: il modello lo comunica a voce */
          }
          if (!rtRef.current) return;
          rtSend({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output } });
        }),
      );
      if (!rtRef.current) return;
      afterToolRef.current = true;
      rtSend({ type: "response.create" });
    },
    [rtSend, setPhaseBoth],
  );

  const handleRealtimeEvent = useCallback(
    (raw: string) => {
      let ev: RtEvent;
      try {
        ev = JSON.parse(raw) as RtEvent;
      } catch {
        return;
      }
      const h = rtHandlersRef.current;
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          rtLastUserRef.current = Date.now();
          setPhaseBoth("listening"); // anche durante la voce di Aira: il server interrompe da solo la risposta
          break;
        case "input_audio_buffer.speech_stopped":
          if (phaseRef.current === "listening") setPhaseBoth("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const t = (ev.transcript ?? "").trim();
          if (t) {
            setHeard(t);
            h?.onUser(t);
          }
          break;
        }
        case "output_audio_buffer.started":
          setPhaseBoth("speaking");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          if (phaseRef.current === "speaking") setPhaseBoth("listening");
          break;
        case "response.done": {
          if (rtStatsRef.current) {
            rtStatsRef.current.responses += 1;
            rtStatsRef.current.outputAudioTokens += ev.response?.usage?.output_token_details?.audio_tokens ?? 0;
          }
          const out = ev.response?.output ?? [];
          const calls = out.filter((o) => o.type === "function_call" && o.name === ASK_TOOL_NAME);
          if (ev.response?.status === "failed") setNotice("La risposta vocale non è riuscita: riprova.");
          if (calls.length) {
            void runToolCalls(calls);
            break;
          }
          // risposta data a voce senza tool: nella chat appare il testo; dopo un tool la bolla c'è già (con le fonti)
          if (ev.response?.status === "completed") {
            const text = out.flatMap((o) => o.content ?? []).map((c) => c.transcript ?? "").join(" ").trim();
            if (text && !afterToolRef.current) h?.onAssistant(text);
          }
          afterToolRef.current = false;
          if (phaseRef.current === "thinking") setPhaseBoth("listening");
          break;
        }
        case "error":
          // «nessuna risposta da annullare» capita di continuo con le interruzioni: non è un errore per l'utente
          if (ev.error?.code !== "response_cancel_not_active") setNotice(ev.error?.message ? `Voce live: ${ev.error.message}` : "Errore nella voce live.");
          break;
      }
    },
    [runToolCalls, setHeard, setNotice, setPhaseBoth],
  );

  /** Sessione realtime: l'audio va direttamente tra il browser e OpenAI, il server fa solo da tramite per la chiave. */
  const startRealtime = useCallback(
    async (stream: MediaStream, ctx: AudioContext) => {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const el = new Audio();
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      rtAudioRef.current = el;
      pc.ontrack = (e) => {
        el.srcObject = e.streams[0];
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.7;
        ctx.createMediaStreamSource(e.streams[0]).connect(an); // solo per l'orb: la riproduzione la fa l'elemento audio
        rtOutAnalyserRef.current = an;
        void el.play().catch(() => undefined);
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleRealtimeEvent(String(e.data));
      const opened = new Promise<void>((resolve, reject) => {
        dc.onopen = () => resolve();
        setTimeout(() => reject(new Error("timeout")), 12_000);
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch("/api/aira/realtime", { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!res.ok) throw new Error(`realtime ${res.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      await opened;
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setNotice("Connessione live interrotta.");
          stopLiveRef.current();
        }
      };
      dc.onclose = () => {
        if (dcRef.current === dc) {
          setNotice("Connessione live interrotta.");
          stopLiveRef.current();
        }
      };
      rtRef.current = true;
      rtStatsRef.current = { responses: 0, outputAudioTokens: 0, startedAt: Date.now() };
      rtLastUserRef.current = Date.now();
      // se Francesco non parla per un po (chat dimenticata aperta, o Aira che risponde a se stessa) si chiude da sola
      rtIdleRef.current = setInterval(() => {
        if (Date.now() - rtLastUserRef.current < IDLE_TIMEOUT_MS) return;
        setNotice("Sessione live chiusa: nessuno parlava da un minuto.");
        stopLiveRef.current();
      }, 5_000);
      rtTimerRef.current = setTimeout(() => {
        setNotice("Sessione live terminata dopo 5 minuti: riavviala quando vuoi.");
        stopLiveRef.current();
      }, MAX_SESSION_MS);
    },
    [handleRealtimeEvent, setNotice],
  );

  const startLive = useCallback(async () => {
    setNotice(null);
    let stream: MediaStream;
    let ctx: AudioContext;
    try {
      ctx = ensureAudio();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setNotice("Non riesco ad accedere al microfono: controlla i permessi del browser.");
      return;
    }
    micStreamRef.current = stream;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    micAnalyserRef.current = analyser;
    vadRef.current = { floor: 0.01, speaking: false, speechStart: 0, lastVoice: 0 };
    setPhaseBoth("thinking"); // connessione in corso
    liveRef.current = true;
    setLive(true);
    liveModeRef.current = readLiveMode();
    partsRef.current = [];
    if (liveModeRef.current === "turns") {
      // modalità a frasi (economica): niente sessione realtime, si ascolta e si trascrive frase per frase
      setPhaseBoth("listening");
      return;
    }
    try {
      await startRealtime(stream, ctx);
      setPhaseBoth("listening");
    } catch (err) {
      // ripiego: la modalità a turni (registra, trascrive, risponde, legge) funziona anche senza realtime
      console.warn("[aira] voce realtime non disponibile, uso la modalità a turni:", err);
      closeRealtime();
      liveModeRef.current = "turns";
      setNotice("Voce live non disponibile ora: uso la modalità a frasi.");
      setPhaseBoth("listening");
    }
  }, [closeRealtime, ensureAudio, setNotice, setPhaseBoth, startRealtime]);

  /** Testo scritto durante una sessione live: lo gestisce il modello (ed eventualmente il tool). false = nessuna sessione. */
  const sendTextLive = useCallback(
    (text: string): boolean => {
      if (!rtRef.current) return false;
      const ok = rtSend({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
      if (ok) {
        rtSend({ type: "response.create" });
        setPhaseBoth("thinking");
      }
      return ok;
    },
    [rtSend, setPhaseBoth],
  );

  useEffect(() => {
    voiceRepliesRef.current = voiceReplies;
  }, [voiceReplies]);

  useEffect(() => () => {
    liveRef.current = false;
    closeRealtime();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    outElRef.current?.pause();
    void audioCtxRef.current?.close();
  }, []);

  const onOrbClick = useCallback(() => {
    if (phaseRef.current === "speaking") {
      stopSpeaking();
      beginListeningIfLive();
    } else if (liveRef.current) stopLive();
    else void startLive();
  }, [beginListeningIfLive, startLive, stopLive, stopSpeaking]);

  return {
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
    levelRef,
    specBuf,
    onHeardRef,
    ensureAudio,
    speak,
    stopSpeaking,
    beginListeningIfLive,
    setPhaseBoth,
    startLive,
    stopLive,
    onOrbClick,
    rtHandlersRef,
    sendTextLive,
  };
}

export type AiraVoice = ReturnType<typeof useAiraVoice>;
