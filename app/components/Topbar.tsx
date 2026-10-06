"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

/** Navigazione unica dell'header: panoramica, i cinque pilastri e gli strumenti. Il colore è quello del pilastro; la voce attiva segue ?p=. */
const NAV: { key: string; label: string; color: string; group: "home" | "pillar" | "tool" }[] = [
  { key: "", label: "Panoramica", color: "#8b98a8", group: "home" },
  { key: "studio", label: "Studio", color: "#5eead4", group: "pillar" },
  { key: "salute", label: "Salute", color: "#3ecf8e", group: "pillar" },
  { key: "allenamento", label: "Allenamento", color: "#4de1ff", group: "pillar" },
  { key: "umore", label: "Umore", color: "#b78cff", group: "pillar" },
  { key: "lavoro", label: "Lavoro", color: "#f5a524", group: "pillar" },
  { key: "oggi", label: "Oggi", color: "#8b98a8", group: "tool" },
  { key: "aira", label: "Aira", color: "#3ecf8e", group: "tool" },
  { key: "incroci", label: "Statistiche", color: "#ff7ad9", group: "tool" },
  { key: "spesa", label: "Spesa", color: "#f2a07b", group: "tool" },
  { key: "passaggi", label: "Trasferisci", color: "#4de1ff", group: "tool" },
];

const CONTEXT_TITLES: Record<string, string> = { studio: "studio", salute: "salute", allenamento: "allenamento", umore: "umore", lavoro: "lavoro", aira: "aira", incroci: "statistiche", passaggi: "trasferisci", spesa: "spesa" };

/** Il progetto è nato il 3 ottobre 2026: il contatore "DAY" parte da lì. */
const BORN = Date.UTC(2026, 9, 3);

function weekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

function Ruler() {
  // tacche ogni 8px, numerate ogni 128: il righello dei visori da hangar
  const ticks = [];
  for (let i = 0; i < 260; i++) {
    const x = i * 8;
    const long = i % 16 === 0;
    const mid = i % 4 === 0;
    ticks.push(<line key={i} x1={x} x2={x} y1={14} y2={long ? 3 : mid ? 8 : 11} stroke="rgba(120,170,220,0.4)" strokeWidth="1" />);
    if (long) {
      ticks.push(
        <text key={`t${i}`} x={x + 3} y={9}>
          {String(i / 16).padStart(2, "0")}
        </text>,
      );
    }
  }
  return (
    <div className="ruler" aria-hidden>
      <svg preserveAspectRatio="xMinYMid slice" viewBox="0 0 2080 14">
        {ticks}
      </svg>
    </div>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const ctx = sp.get("console") === "1" ? "aira" : sp.get("p");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.querySelector(".topnav .tab.on")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [sp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/?console=1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (pathname.startsWith("/login")) return null;

  const time = now?.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour12: false }) ?? "--:--:--";
  const day = now ? Math.floor((now.getTime() - BORN) / 86400000) + 1 : 0;

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="crumbs">
          <span className="owner">daro-hub</span>
          <span className="sep">/</span>
          <Link href="/" className="repo">
            second-brain
          </Link>
          <span className="tag">Pubblico</span>
          <span className="sep">/</span>
          <span className="here">{(ctx && CONTEXT_TITLES[ctx]) || "panoramica"}</span>
          <span className="tag live">
            <i /> online
          </span>
        </div>
        <div className="readouts" suppressHydrationWarning>
          <span>
            <span className="lbl">T</span>
            <b>{time}</b>
          </span>
          <span>
            <span className="lbl">DAY</span>
            <b>{String(day).padStart(3, "0")}</b>
          </span>
          <button
            type="button"
            className="logout"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Esci
          </button>
          <span>
            <span className="lbl">WK</span>
            <b>{now ? String(weekNumber(now)).padStart(2, "0") : "--"}</b>
          </span>
        </div>
      </div>
      <nav className="topnav" aria-label="Sezioni">
          {NAV.map((n, i) => {
            const active = (sp.get("p") ?? "") === n.key && (pathname === "/" || !n.key);
            return (
              <Fragment key={n.key || "home"}>
                {i > 0 && NAV[i - 1].group !== n.group && <span className="tab-sep" aria-hidden />}
                <Link href={n.key ? `/?p=${n.key}` : "/"} className={`tab${active ? " on" : ""}`} style={{ ["--tc" as string]: n.color }} aria-current={active ? "page" : undefined}>
                  <i />
                  {n.label}
                </Link>
              </Fragment>
            );
          })}
      </nav>
      <Ruler />
    </header>
  );
}
