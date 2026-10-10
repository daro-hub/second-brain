"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ICONS } from "./navIcons";

type NavItem = { key: string; label: string; color: string };

/** In alto, sempre: gli strumenti (la panoramica si raggiunge toccando l'orb; lo stato di Aira dalla chat con Aira). */
const TOOLS: NavItem[] = [
  { key: "oggi", label: "Oggi", color: "#8b98a8" },
  { key: "incroci", label: "Statistiche", color: "#ff375f" },
  { key: "spesa", label: "Spesa", color: "#f2a07b" },
  { key: "passaggi", label: "Trasferisci", color: "#0a84ff" },
];

/** I cinque pilastri: sotto l'header, centrati, solo quando non si è nella schermata iniziale. Colori come nel radar. */
const PILLARS: NavItem[] = [
  { key: "studio", label: "Studio", color: "#64d2ff" },
  { key: "salute", label: "Salute", color: "#30d158" },
  { key: "allenamento", label: "Allenamento", color: "#0a84ff" },
  { key: "umore", label: "Umore", color: "#bf5af2" },
  { key: "lavoro", label: "Lavoro", color: "#ff9f0a" },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
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
        <span className="tab-lbl">{n.label}</span>
      </Link>
    );
  };

  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link href="/" className="brand-mark">
          Aira
        </Link>
        <nav className="topnav" aria-label="Sezioni">
          {TOOLS.map((n) => renderTab(n))}
        </nav>
        <div className="topbar-actions">
          {/* Trasferisci su telefono non sta nella tab bar (max 5 voci): è un'azione nella barra in alto */}
          <Link href="/?p=passaggi" className="hdr-btn" aria-label="Trasferisci" title="Trasferisci">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS.passaggi}
            </svg>
          </Link>
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
        </div>
      </div>
      {showPillars && (
        <nav className={`topnav pillars${PILLARS.some((n) => n.key === p) ? " in-pillar" : ""}`} aria-label="Pilastri">
          {PILLARS.map((n) => renderTab(n))}
        </nav>
      )}
    </header>
  );
}
