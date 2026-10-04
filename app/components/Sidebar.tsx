"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    {d}
  </svg>
);

const ICONS = {
  aira: I(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>,
  ),
  today: I(
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>,
  ),
  health: I(<path d="M3 12h4l2-6 4 12 2-6h6" />),
  balance: I(
    <>
      <path d="M12 3v18M5 7h14" />
      <path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" />
    </>,
  ),
  gym: I(<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />),
  insights: I(
    <>
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M7.8 15.7l8.4-7M8.2 17.2h7.6" />
    </>,
  ),
  shop: I(
    <>
      <path d="M4 5h2l2.2 10h9.6L20 8H7" />
      <circle cx="9.5" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </>,
  ),
  costs: I(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M14.5 9.5c0-1.4-1.2-2-2.5-2s-2.5.7-2.5 2 1.2 1.8 2.5 2 2.5.6 2.5 2-1.2 2-2.5 2-2.5-.6-2.5-2" />
    </>,
  ),
};

const GROUPS = [
  {
    label: "CERVELLO",
    items: [{ href: "/aira", label: "Aira", icon: ICONS.aira, cls: "aira" }],
  },
  {
    label: "DATI",
    items: [
      { href: "/", label: "Oggi", icon: ICONS.today },
      { href: "/salute", label: "Salute", icon: ICONS.health },
      { href: "/bilancio", label: "Bilancio", icon: ICONS.balance },
      { href: "/palestra", label: "Allenamento", icon: ICONS.gym },
      { href: "/insights", label: "Incroci", icon: ICONS.insights },
      { href: "/spesa", label: "Spesa", icon: ICONS.shop },
    ],
  },
  {
    label: "SISTEMA",
    items: [{ href: "/costi", label: "Costi AI", icon: ICONS.costs }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  // /aira è a schermo intero e ha la sua barra: la rail resta nascosta lì
  if (pathname.startsWith("/aira")) return null;
  return (
    <aside className="rail">
      <Link href="/" className="brand">
        <span className="logo">SB</span>
        <span>
          <b>Second Brain</b>
          <small>v1 · ONLINE</small>
        </span>
      </Link>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="group-label">{g.label}</div>
          <nav>
            {g.items.map((it) => {
              const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
              return (
                <Link key={it.href} href={it.href} className={`nav-item${"cls" in it ? ` ${it.cls}` : ""}${active ? " active" : ""}`}>
                  {it.icon}
                  <span className="lbl">{it.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
      <div className="rail-foot">
        daro-hub/second-brain
        <br />
        master · pubblico
      </div>
    </aside>
  );
}
