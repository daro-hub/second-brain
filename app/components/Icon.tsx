import type { ReactNode } from "react";

/** Icone a linea (24×24, tratto 1.8, colore del testo): al posto delle emoji in tutta l'interfaccia web. */
const PATHS = {
  meal: <path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M9 3v6M17 21V3c-2.5 1.5-3.5 4-3.5 7.500V14H17" />,
  protein: <path d="M8 6c3-3 9-2 10 3s-3 8-7 10c-3 1.500-6-1-5-4 .8-2.500-1.500-5 2-9Z" />,
  steps: <path d="M8 4c2.200 0 3 2 3 4.500S10 12 8 12 5 10.500 5 8s1-4 3-4ZM9 15.500c0 1.500-.8 2.500-2 2.500M16 9c2.200 0 3 2 3 4.500S18 17 16 17s-3-1.500-3-4 1-4 3-4ZM16 20c0 .6-.4 1-1 1" />,
  heart: <path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" />,
  dumbbell: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  calendar: <path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4" />,
  cart: <path d="M3 4h2.500l2.200 10.500h9.600L19.500 8H6.300M9 19a.5.5 0 1 0 0 .01M17 19a.5.5 0 1 0 0 .01" />,
  graduation: <path d="M2 9l10-5 10 5-10 5L2 9ZM6 11.500V16c0 1.200 2.700 3 6 3s6-1.800 6-3v-4.500M22 9v6" />,
  folder: <path d="M3 7a1 1 0 0 1 1-1h5l2 2.500h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />,
  note: <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 12h6M9 16h6" />,
  file: <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5" />,
  timer: <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.500 1.500M9.500 2.500h5" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15L6 16ZM10 21h4" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v1.500A3 3 0 0 0 7.500 11M16 6h4v1.500A3 3 0 0 1 16.500 11M12 13v4M8.500 20h7M10 17h4" />,
  moon: <path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500Z" />,
  flame: <path d="M12 21c3.500 0 6-2.500 6-6 0-3-2-4.500-3-7-1 1-1.500 2-1.500 3-1-1-2-3-1.500-6C9 6 6 9.500 6 15c0 3.500 2.500 6 6 6Z" />,
  scale: <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.500 6a3 3 0 0 0 5 0L5 8Zm14 0-2.500 6a3 3 0 0 0 5 0L19 8Z" />,
  link: <path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1" />,
  run: <path d="M13 4.500a1.500 1.500 0 1 1 0 .01M9 20l2.500-5-3-2.500 2-4.500 3.500 2 3 .5M8 9l-3 2" />,
  book: <path d="M4 5.500A1.500 1.500 0 0 1 5.500 4H11v16H5.500A1.500 1.500 0 0 1 4 18.500v-13ZM20 5.500A1.500 1.500 0 0 0 18.500 4H13v16h5.500a1.500 1.500 0 0 0 1.500-1.500v-13Z" />,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 4 2.400 5 5.600.7-4.100 3.800 1.100 5.500L12 16.300 7 19l1.100-5.500L4 9.700 9.600 9 12 4Z" />,
  alert: <path d="M12 4 2.500 20h19L12 4ZM12 10v5M12 17.500v.01" />,
  rotate: <path d="M20 12a8 8 0 1 1-2.500-5.800M20 4v4.500h-4.500" />,
  telegram: <path d="M21 4 3 11l6 2.500L11 20l3-4.500 5 3.500L21 4ZM9 13.500 21 4" />,
  scales: <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.500 6a3 3 0 0 0 5 0L5 8Zm14 0-2.500 6a3 3 0 0 0 5 0L19 8Z" />,
  bolt: <path d="M13 3 5 13.500h6L10 21l8-10.500h-6L13 3Z" />,
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ico${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

const GLYPH_TO_ICON: Record<string, IconName> = { "⚖": "scale", "👟": "steps", "⚡": "bolt", "⚠": "alert", "★": "star", "♥": "heart" };

/** Il simbolo di un insight calcolato in `src/lib`: le emoji e i dingbat diventano icone, le forme geometriche restano com'è. */
export function InsightGlyph({ glyph }: { glyph: string }) {
  const name = GLYPH_TO_ICON[glyph];
  return name ? <Icon name={name} size={16} /> : <>{glyph}</>;
}
