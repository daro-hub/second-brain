"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ICONS } from "./navIcons";

type Tab = { key: string; label: string; href: string };

/** Tab bar in basso (solo telefono, come su iOS): al massimo cinque voci. Trasferisci sta nella barra in alto. */
const TABS: Tab[] = [
  { key: "panoramica", label: "Home", href: "/" },
  { key: "oggi", label: "Oggi", href: "/?p=oggi" },
  { key: "aira", label: "Aira", href: "/?console=1" },
  { key: "spesa", label: "Spesa", href: "/?p=spesa" },
  { key: "incroci", label: "Statistiche", href: "/?p=incroci" },
];

/** Gli strumenti hanno la loro voce; ogni altra schermata (la panoramica e i cinque pilastri) appartiene a Panoramica. */
function activeKey(p: string, console_: boolean): string {
  if (console_) return "aira";
  if (p === "oggi" || p === "spesa" || p === "incroci") return p;
  return "panoramica";
}

export function TabBar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (pathname.startsWith("/login")) return null;
  const current = pathname === "/" ? activeKey(sp.get("p") ?? "", sp.get("console") === "1") : "";
  return (
    <nav className="tabbar" aria-label="Navigazione principale">
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link key={t.key} href={t.href} className={`tabbar-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[t.key]}
            </svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
