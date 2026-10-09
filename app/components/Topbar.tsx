"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

type NavItem = { key: string; label: string; color: string };

/** Icone degli strumenti (solo mobile, al posto delle scritte): tratto 1.7, 20px, colore del testo. */
const ICONS: Record<string, React.ReactNode> = {
  oggi: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
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
  studio: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />,
  salute: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  allenamento: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  umore: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.01M15 9.5v.01" />
    </>
  ),
  lavoro: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17" />
    </>
  ),
};


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
        {ICONS[n.key] && (
          <svg className="tab-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONS[n.key]}
          </svg>
        )}
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
      {showPillars && (
        <nav className="topnav pillars" aria-label="Pilastri">
          {PILLARS.map((n) => renderTab(n))}
        </nav>
      )}
    </header>
  );
}
