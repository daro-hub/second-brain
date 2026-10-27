"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isEnabled } from "../../src/lib/modules";
import { ICONS } from "./navIcons";

type Tab = { key: string; label: string; href: string };

/** Tab bar in basso (solo telefono, come su iOS): tre voci. Spesa, Statistiche e Trasferisci stanno in "Altro" nella home. */
const TABS: Tab[] = [
  { key: "panoramica", label: "Progressi", href: "/?p=progressi" },
  { key: "oggi", label: "Oggi", href: "/?p=oggi" },
  { key: "aira", label: "Aira", href: "/?console=1" },
].filter((t) => t.key !== "aira" || isEnabled("webchat"));

/** Oggi e la chat hanno la loro voce; ogni altra schermata (Progressi, i pilastri, gli strumenti) appartiene a Progressi. */
function activeKey(p: string, console_: boolean): string {
  if (console_) return "aira";
  if (p === "oggi") return p;
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
