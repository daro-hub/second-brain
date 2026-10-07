"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";

const PRESETS = [
  { seconds: 120, label: "2 min" },
  { seconds: 180, label: "3 min" },
] as const;
const STORAGE_KEY = "aira-rest-timer";

interface Stored {
  endsAt: number;
  seconds: number;
}

const read = (): Stored | null => {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
    return v && typeof v.endsAt === "number" ? v : null;
  } catch {
    return null;
  }
};
const write = (v: Stored | null) => {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // senza storage il timer funziona lo stesso, ma non sopravvive a un ricaricamento
  }
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Notifica locale (a pagina viva); quella del server, con lo stesso tag, la sostituisce: niente doppioni. */
async function notifyLocal(): Promise<void> {
  try {
    navigator.vibrate?.([200, 100, 200]);
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
    await reg?.showNotification("⏱ Recupero finito", { body: "Prossima serie!", tag: "rest-timer", icon: "/apple-icon", data: { url: "/?console=1" } });
  } catch {
    // la notifica è un di più: lo stato "scaduto" resta comunque visibile qui
  }
}

/**
 * Due pulsanti (2 e 3 minuti) per il recupero tra le serie. Parte dal tocco, mostra il tempo rimasto e a scadenza
 * notifica: il server manda la push anche a telefono bloccato, la pagina vibra e notifica se è ancora viva.
 * Si vede quando la conversazione parla di allenamento (`show`) e finché c'è un timer in corso o appena scaduto.
 */
export function RestTimer({ show }: { show: boolean }) {
  const [timer, setTimer] = useState<Stored | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const t = read();
    if (t && t.endsAt > Date.now()) setTimer(t);
    else write(null);
  }, []);

  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= timer.endsAt && !firedRef.current) {
        firedRef.current = true;
        setExpired(true);
        write(null);
        void notifyLocal();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [timer]);

  const start = useCallback(async (seconds: number) => {
    const t = { endsAt: Date.now() + seconds * 1000, seconds };
    firedRef.current = false;
    setExpired(false);
    setTimer(t);
    setNow(Date.now());
    write(t);
    // serve il permesso per la notifica locale; senza, resta la push del server
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
    await fetch("/api/aira/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds }) }).catch(() => undefined);
  }, []);

  const stop = useCallback(async () => {
    firedRef.current = true;
    setTimer(null);
    setExpired(false);
    write(null);
    await fetch("/api/aira/timer", { method: "DELETE" }).catch(() => undefined);
  }, []);

  const running = timer !== null && !expired;
  if (!show && !running && !expired) return null;

  return (
    <div className={`rest-timer${running ? " running" : ""}${expired ? " done" : ""}`} role="group" aria-label="Timer di recupero">
      {running && timer ? (
        <>
          <span className="rt-left" aria-live="off">
            <Icon name="timer" size={14} /> <b>{fmt(timer.endsAt - now)}</b>
          </span>
          <button type="button" onClick={() => void stop()}>
            Stop
          </button>
        </>
      ) : expired ? (
        <>
          <span className="rt-left"><Icon name="bell" size={14} /> Recupero finito!</span>
          <button type="button" onClick={() => setExpired(false)}>
            Ok
          </button>
        </>
      ) : (
        PRESETS.map((p) => (
          <button key={p.seconds} type="button" onClick={() => void start(p.seconds)}>
            <Icon name="timer" size={14} /> {p.label}
          </button>
        ))
      )}
    </div>
  );
}
