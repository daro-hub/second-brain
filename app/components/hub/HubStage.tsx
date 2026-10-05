"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AiraConsole } from "../../aira/AiraConsole";
import { Orb } from "../../aira/Orb";
import { useAiraVoice } from "../../aira/useAiraVoice";
import { PillarRadar } from "./PillarRadar";

interface Measure {
  key: string;
  label: string;
  value: string;
  detail: string;
  score: number | null;
}
interface HubPillar {
  key: string;
  label: string;
  color: string;
  score: number | null;
  trend: number | null;
  measures?: Measure[];
}
interface HubData {
  pillars: HubPillar[];
  index: number | null;
  weakest: HubPillar | null;
  nextExam: { name: string; daysLeft: number } | null;
}
interface AiraStatus {
  integrations: { id: string; label: string; ok: boolean; detail: string }[];
  docs: number;
  logs: number;
  webhook: { active: boolean; pending: number };
  cost: { today: number; d7: number; d30: number; tokens30: number; total: number | null; remaining: number | null } | null;
}
interface Card {
  key: string;
  label: string;
  value: string;
  detail: string;
  score?: number | null;
  color: string;
}

const TTL = 5 * 60_000;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fetch con cache di sessione: tornare alla panoramica non rifà i calcoli. */
function useCached<T>(url: string, enabled: boolean, ttl = TTL): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const key = `hub:${url}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const c = JSON.parse(raw) as { at: number; data: T };
        if (Date.now() - c.at < ttl) {
          setData(c.data);
          return;
        }
      }
    } catch {
      /* cache illeggibile: si ricarica */
    }
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
        try {
          sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: d }));
        } catch {
          /* quota piena: non è un problema */
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url, enabled, ttl]);
  return { data, failed };
}

function airaCards(a: AiraStatus): Card[] {
  const down = a.integrations.filter((i) => !i.ok);
  const cards: Card[] = [
    { key: "int", label: "Integrazioni", value: `${a.integrations.length - down.length}/${a.integrations.length}`, detail: down.length ? `da controllare: ${down.map((d) => d.label).join(", ")}` : "tutte attive", score: Math.round(((a.integrations.length - down.length) / a.integrations.length) * 100), color: down.length ? "#f5a524" : "#3ecf8e" },
    { key: "kb", label: "Rete neurale", value: `${a.docs}`, detail: `note nella base di conoscenza · ${a.logs} allenamenti`, color: "#b78cff" },
    { key: "bot", label: "Bot Telegram", value: a.webhook.active ? "attivo" : "spento", detail: `${a.webhook.pending} aggiornamenti in coda`, color: a.webhook.active ? "#3ecf8e" : "#ff5d73" },
  ];
  if (a.cost) {
    cards.push({ key: "cost", label: "Costi AI", value: usd(a.cost.d30), detail: `ultimi 30 giorni · oggi ${usd(a.cost.today)} · 7 giorni ${usd(a.cost.d7)}`, color: "#4de1ff" });
    cards.push({ key: "tok", label: "Utilizzo", value: a.cost.tokens30.toLocaleString("it-IT"), detail: "token negli ultimi 30 giorni", color: "#ff7ad9" });
    if (a.cost.total !== null && a.cost.remaining !== null && a.cost.total > 0) {
      cards.push({ key: "credit", label: "Credito residuo", value: usd(a.cost.remaining), detail: `su ${usd(a.cost.total)} caricati`, score: Math.round((a.cost.remaining / a.cost.total) * 100), color: "#f5a524" });
    }
  } else {
    cards.push({ key: "cost", label: "Costi AI", value: "—", detail: "chiave admin OpenAI non configurata", color: "#5a6677" });
  }
  return cards;
}

function Cards({ cards }: { cards: Card[] }) {
  return (
    <>
      {cards.map((c) => (
        <div key={c.key} className="card kpi hub-card" style={{ ["--kpi" as string]: c.color }}>
          <div className="kpi-top">
            <span>{c.label}</span>
            {c.score !== undefined && c.score !== null && <span className="pill">{c.score}</span>}
          </div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{c.value}</div>
          <div className="kpi-sub">{c.detail}</div>
          {c.score !== undefined && c.score !== null && (
            <div className="hub-bar">
              <i style={{ width: `${c.score}%`, background: c.color }} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Stage() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const voice = useAiraVoice();
  const { ensureAudio } = voice;
  const [consoleOpened, setConsoleOpened] = useState(false);

  const console_ = pathname === "/" && params.get("console") === "1";
  const p = pathname === "/" && !console_ ? params.get("p") : null;
  // Entrare in un pilastro mostra subito tutto: non c'è più un passaggio "Dettagli" (?detail=1 resta valido per i vecchi link)
  const inside = pathname === "/" && !console_ && (Boolean(p) || params.get("detail") === "1");
  const mode: "home" | "pillar" | "console" = console_ ? "console" : inside ? "pillar" : "home";

  // la chat resta montata una volta aperta: la cronologia non si perde tornando alla panoramica
  useEffect(() => {
    if (console_) setConsoleOpened(true);
  }, [console_]);
  useEffect(() => {
    if (!console_) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push("/");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [console_, router]);

  const hub = useCached<HubData>("/api/hub", true);
  const aira = useCached<AiraStatus>("/api/hub/aira", p === "aira", 2 * 60_000);
  const data = hub.data;

  const select = (key: string) => router.push(p === key && mode === "pillar" ? "/" : `/?p=${key}`);
  const onOrb = () => {
    if (mode === "home") router.push("/?console=1"); // dalla panoramica l'orb apre la console
    else if (mode === "console") {
      ensureAudio();
      voice.onOrbClick(); // nella console l'orb attiva/disattiva la voce
    } else router.push("/"); // dall'angolo, l'orb riporta alla schermata principale
  };

  if (pathname.startsWith("/login")) return null;

  const pillars: HubPillar[] = data?.pillars ?? ["studio", "salute", "allenamento", "conoscenza", "lavoro"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), color: "#5a6677", score: null, trend: null }));
  const current = pillars.find((x) => x.key === p);
  const title = p === "aira" ? "Status di Aira" : p === "incroci" ? "Incroci" : current ? current.label : "Oggi";
  const hasStrip = p === "aira" || Boolean(current);
  const cards: Card[] | null =
    p === "aira"
      ? aira.data
        ? airaCards(aira.data)
        : null
      : current?.measures
        ? current.measures.map((m) => ({ key: m.key, label: m.label, value: m.value, detail: m.detail, score: m.score, color: current.color }))
        : null;
  const loadFailed = p === "aira" ? aira.failed : hub.failed;

  return (
    <section className={`hub-stage ${mode}`} aria-label="Aira e pilastri">
      <div className="hub-home">
        <div className="hub-cc">
          <PillarRadar pillars={pillars} active={p} onSelect={select} />
          <div className="hub-text">
            <div className="hub-actions">
              <Link href="/?p=oggi" className="hub-chip">Oggi</Link>
              <Link href="/?p=aira" className="hub-chip aira">
                <i />
                Status
              </Link>
            </div>
            <p className="hub-hint">Tocca Aira per parlarci e scriverle</p>
          </div>
        </div>
      </div>

      {consoleOpened && <AiraConsole voice={voice} active={mode === "console"} onClose={() => router.push("/")} />}

      <div className="hub-orbwrap">
        <Orb phase={voice.phase} getLevel={() => voice.levelRef.current} getSpectrum={() => voice.specBuf.current} onClick={onOrb} />
      </div>

      <div className="hub-bar-top">
        <span className="hub-title">{title}</span>
        <div className="hub-chips">
          {pillars.map((x) => (
            <button key={x.key} type="button" className={`hub-chip${p === x.key ? " on" : ""}`} style={{ ["--pc" as string]: x.color }} onClick={() => select(x.key)}>
              <i />
              {x.label}
              <b>{x.score ?? "—"}</b>
              {x.trend !== null && x.trend !== 0 && <em className={x.trend > 0 ? "up" : "down"}>{x.trend > 0 ? "▲" : "▼"}{Math.abs(x.trend)}</em>}
            </button>
          ))}
          <Link href="/?p=aira" className={`hub-chip aira${p === "aira" ? " on" : ""}`}>
            <i />
            Status
          </Link>
          <Link href="/?p=oggi" className={`hub-chip${p === "oggi" || (inside && !p) ? " on" : ""}`}>
            <i style={{ background: "#8b98a8" }} />
            Oggi
          </Link>
          <Link href="/?p=incroci" className={`hub-chip${p === "incroci" ? " on" : ""}`}>
            <i style={{ background: "#ff7ad9" }} />
            Incroci
          </Link>
        </div>
      </div>

      {mode === "pillar" && hasStrip && (
        <div className="hub-body">
          {cards ? <Cards cards={cards} /> : <p className="muted small">{loadFailed ? "Non riesco a leggere i dati in questo momento." : "Calcolo…"}</p>}
        </div>
      )}
    </section>
  );
}

export function HubStage() {
  // useSearchParams richiede Suspense: lo stage non deve bloccare il render del resto
  return (
    <Suspense fallback={null}>
      <Stage />
    </Suspense>
  );
}
