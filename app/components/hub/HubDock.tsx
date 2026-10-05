"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { askAira } from "../../aira/askAira";
import { Orb } from "../../aira/Orb";
import { useAiraVoice } from "../../aira/useAiraVoice";
import { PillarRadar } from "./PillarRadar";

interface HubPillar {
  key: string;
  label: string;
  color: string;
  score: number | null;
  trend: number | null;
}
interface HubData {
  pillars: HubPillar[];
  index: number | null;
  weakest: HubPillar | null;
  nextExam: { name: string; daysLeft: number } | null;
}

const CACHE_KEY = "hub:v1";
const CACHE_MS = 5 * 60_000;

function brief(d: HubData): string {
  const parts: string[] = [];
  if (d.index !== null) parts.push(`Indice di equilibrio ${d.index}/100.`);
  if (d.nextExam) parts.push(`${d.nextExam.name} ${d.nextExam.daysLeft === 0 ? "è oggi" : `è fra ${d.nextExam.daysLeft} giorni`}.`);
  if (d.weakest && d.weakest.score !== null) parts.push(`${d.weakest.label} è l'asse più basso (${d.weakest.score}).`);
  return parts.join(" ") || "Nessun dato ancora: collega le fonti per vedere i punteggi.";
}

function Dock() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<HubData | null>(null);
  const [failed, setFailed] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const voice = useAiraVoice();
  const { onHeardRef, speak, ensureAudio, setPhaseBoth, beginListeningIfLive } = voice;

  const p = params.get("p");
  const overview = pathname === "/" && !p;
  const active = pathname === "/" ? p : null;

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { at: number; data: HubData };
        if (Date.now() - c.at < CACHE_MS) {
          setData(c.data);
          return;
        }
      }
    } catch {
      /* cache illeggibile: si ricarica */
    }
    fetch("/api/hub")
      .then((r) => (r.ok ? (r.json() as Promise<HubData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: d }));
        } catch {
          /* quota piena: non è un problema */
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = useCallback(
    async (text: string) => {
      setPhaseBoth("thinking");
      setSaid(null);
      try {
        const r = await askAira(text);
        setSaid(r.html.replace(/<[^>]+>/g, ""));
        if (!r.sensitive) await speak(r.speech);
        else beginListeningIfLive();
      } catch (err) {
        setSaid((err as Error).message);
        beginListeningIfLive();
      }
    },
    [beginListeningIfLive, setPhaseBoth, speak],
  );

  useEffect(() => {
    onHeardRef.current = (t) => ask(t);
  }, [ask, onHeardRef]);

  const select = (key: string) => router.push(active === key && pathname === "/" ? "/" : `/?p=${key}`);

  if (pathname.startsWith("/aira") || pathname.startsWith("/login")) return null;

  const pillars: HubPillar[] = data?.pillars ?? ["studio", "salute", "allenamento", "conoscenza", "lavoro"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), color: "#5a6677", score: null, trend: null }));

  return (
    <section className={`hub-dock ${overview ? "overview" : "strip"}`} aria-label="Pilastri e Aira">
      <PillarRadar pillars={pillars} active={active} compact={!overview} onSelect={select}>
        <Orb
          phase={voice.phase}
          getLevel={() => voice.levelRef.current}
          getSpectrum={() => voice.specBuf.current}
          onClick={() => {
            ensureAudio();
            voice.onOrbClick();
          }}
        />
      </PillarRadar>
      <div className="hub-side">
        {overview ? (
          <p className="hub-brief">{failed ? "Non riesco a leggere i punteggi in questo momento." : data ? brief(data) : "Calcolo i punteggi…"}</p>
        ) : (
          <div className="hub-chips">
            {pillars.map((x) => (
              <button key={x.key} type="button" className={`hub-chip${active === x.key ? " on" : ""}`} style={{ ["--pc" as string]: x.color }} onClick={() => select(x.key)}>
                <i />
                {x.label}
                <b>{x.score ?? "—"}</b>
                {x.trend !== null && x.trend !== 0 && <em className={x.trend > 0 ? "up" : "down"}>{x.trend > 0 ? "▲" : "▼"}{Math.abs(x.trend)}</em>}
              </button>
            ))}
            <Link href="/?p=aira" className={`hub-chip aira${active === "aira" ? " on" : ""}`}>
              <i />
              Aira
            </Link>
            <Link href="/?p=incroci" className={`hub-chip${active === "incroci" ? " on" : ""}`}>
              <i style={{ background: "#ff7ad9" }} />
              Incroci
            </Link>
            <Link href="/" className="hub-chip home">← Panoramica</Link>
          </div>
        )}
        {(voice.phase !== "idle" || voice.heard) && (
          <p className="hub-say">
            {voice.phase === "listening" ? "In ascolto…" : voice.phase === "thinking" ? "Elaboro…" : voice.phase === "speaking" ? "Sto parlando…" : ""}
          </p>
        )}
        {voice.heard && <p className="hub-heard">“{voice.heard}”</p>}
        {said && <p className="hub-answer">{said}</p>}
        {voice.notice && <p className="hub-notice">{voice.notice}</p>}
        <p className="hub-hint">{overview ? "Tocca un vertice per aprirlo · tocca l’orb per parlare con Aira" : "Tocca l’orb per parlare"}</p>
      </div>
    </section>
  );
}

export function HubDock() {
  // useSearchParams richiede Suspense: il dock non deve bloccare il render delle pagine
  return (
    <Suspense fallback={null}>
      <Dock />
    </Suspense>
  );
}
