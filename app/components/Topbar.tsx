"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { key: string; label: string; color: string };

/** Icone degli strumenti (solo mobile, al posto delle scritte): tratto 1.7, 20px, colore del testo. */
const ICONS: Record<string, React.ReactNode> = {
  oggi: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  aira: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  incroci: <path d="M5 20V11M12 20V4M19 20v-6" />,
  spesa: (
    <>
      <path d="M3 4h2.5l2.2 10.5h9.6L19.5 8H6.3" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </>
  ),
  passaggi: <path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4 4-4-4 4-4" />,
};


/** In alto, sempre: gli strumenti (la panoramica si raggiunge toccando l'orb). */
const TOOLS: NavItem[] = [
  { key: "oggi", label: "Oggi", color: "#8b98a8" },
  { key: "aira", label: "Aira", color: "#3ecf8e" },
  { key: "incroci", label: "Statistiche", color: "#ff7ad9" },
  { key: "spesa", label: "Spesa", color: "#f2a07b" },
  { key: "passaggi", label: "Trasferisci", color: "#4de1ff" },
];

/** I cinque pilastri: sotto l'header, centrati, solo quando non si è nella schermata iniziale. Colori come nel radar. */
const PILLARS: NavItem[] = [
  { key: "studio", label: "Studio", color: "#5eead4" },
  { key: "salute", label: "Salute", color: "#3ecf8e" },
  { key: "allenamento", label: "Allenamento", color: "#4de1ff" },
  { key: "umore", label: "Umore", color: "#b78cff" },
  { key: "lavoro", label: "Lavoro", color: "#f5a524" },
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
    document.querySelectorAll(".topnav .tab.on").forEach((el) => el.scrollIntoView({ inline: "center", block: "nearest" }));
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

  const p = sp.get("p") ?? "";
  const showPillars = !(pathname === "/" && !p && sp.get("console") !== "1");
  const renderTab = (n: NavItem) => {
    const active = pathname === "/" && p === n.key;
    return (
      <Link key={n.key || "home"} href={n.key ? `/?p=${n.key}` : "/"} className={`tab${active ? " on" : ""}`} style={{ ["--tc" as string]: n.color }} aria-current={active ? "page" : undefined} aria-label={n.label} title={n.label}>
        <i />
        {ICONS[n.key] && (
          <svg className="tab-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONS[n.key]}
          </svg>
        )}
        <span className="tab-lbl">{n.label}</span>
      </Link>
    );
  };

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
        <nav className="topnav" aria-label="Sezioni">
          {TOOLS.map((n) => renderTab(n))}
        </nav>
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
      {showPillars && (
        <nav className="topnav pillars" aria-label="Pilastri">
          {PILLARS.map((n) => renderTab(n))}
        </nav>
      )}
      <Ruler />
    </header>
  );
}
