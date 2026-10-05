"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "./Orb";

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
  };
}

export type AiraVoice = ReturnType<typeof useAiraVoice>;
