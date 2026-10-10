import type { ReactNode } from "react";

/** Icone della tab bar (mobile): tratto 1.7, 24px, colore del testo. */
export const ICONS: Record<string, ReactNode> = {
  panoramica: (
    <>
      <path d="M12 3.5 20 9.3l-3 9.2H7L4 9.3 12 3.5Z" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  aira: <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-7Z" />,
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
