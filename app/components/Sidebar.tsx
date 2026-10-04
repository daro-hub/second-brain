"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Oggi", ico: "☀️" },
  { href: "/salute", label: "Salute", ico: "❤️" },
  { href: "/palestra", label: "Palestra", ico: "🏋️" },
  { href: "/insights", label: "Incroci", ico: "🔗" },
  { href: "/spesa", label: "Spesa", ico: "🛒" },
  { href: "/bot", label: "Bot", ico: "🤖" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        <span>Second Brain</span>
      </div>
      <nav>
        {ITEMS.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={`nav-item${active ? " active" : ""}`}>
              <span className="ico">{it.ico}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
