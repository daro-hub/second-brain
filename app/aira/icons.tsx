import type { ReactNode } from "react";
import type { SourceId } from "../../src/lib/trace";

/** Icone a linea (24×24, tratto 1.8, colore del testo): sostituiscono le emoji della console di Aira. */
function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ display: "block", flex: "none" }}>
      {children}
    </svg>
  );
}

type P = { size?: number };

export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const WaveIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </Svg>
);
export const StopIcon = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
  </Svg>
);
export const VolumeIcon = ({ on, ...p }: P & { on: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /> : <path d="m16 10 4 4m0-4-4 4" />}
  </Svg>
);
export const SendIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
);
export const PulseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

const SOURCE_ICON: Record<SourceId, ReactNode> = {
  kb: <path d="M12 4a4 4 0 0 0-4 4 3.5 3.5 0 0 0-2 6.2A3.5 3.5 0 0 0 12 19V4Zm0 0a4 4 0 0 1 4 4 3.5 3.5 0 0 1 2 6.2A3.5 3.5 0 0 1 12 19" />,
  calendar: <path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4" />,
  study: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />,
  gym: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  strava: <path d="M13 4.5a1.5 1.5 0 1 1 0 .01M9 20l2.5-5-3-2.5 2-4.5 3.5 2 3 .5M8 9l-3 2" />,
  health: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" />,
  energy: <path d="M13 3 5 13.500h6L10 21l8-10.500h-6L13 3Z" />,
  shopping: <path d="M4 5h2l2 10h9l2-7H7M10 19.500a.5.5 0 1 1 0 .01M16 19.500a.5.5 0 1 1 0 .01" />,
  github: <path d="M9 19c-4 1.300-4-2-6-2.500m12 4.500v-3a2.600 2.600 0 0 0-.7-2c2.800-.3 5.700-1.400 5.700-6.100a4.800 4.800 0 0 0-1.300-3.300 4.400 4.400 0 0 0-.1-3.300s-1-.3-3.500 1.300a12 12 0 0 0-6.200 0C6.400 3.500 5.400 3.800 5.400 3.800a4.400 4.400 0 0 0-.1 3.300A4.800 4.800 0 0 0 4 10.400c0 4.700 2.900 5.800 5.700 6.100a2.600 2.600 0 0 0-.7 2v3" />,
  linear: <path d="M4 12a8 8 0 0 0 8 8M4 8.500A11.500 11.500 0 0 0 15.500 20M5.500 5.500A11 11 0 0 0 18.500 18.500M9 4.500A15 15 0 0 0 19.500 15M13 4a8 8 0 0 1 7 7" />,
  gmail: <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1 8 6 8-6" />,
  bitwarden: <path d="M12 3 5 6v5c0 4.500 3 8 7 10 4-2 7-5.500 7-10V6l-7-3Z" />,
};

export const SourceIcon = ({ id, size = 18 }: { id: SourceId; size?: number }) => <Svg size={size}>{SOURCE_ICON[id]}</Svg>;
