/**
 * Tracciamento delle fonti dati consultate per rispondere a un messaggio. Il bot Telegram lo
 * ignora (nessun trace passato); l'interfaccia web di Aira lo usa per mostrare in tempo reale da
 * dove arrivano le informazioni, con link alla dashboard dedicata.
 */
export type SourceId =
  | "kb"
  | "calendar"
  | "study"
  | "gym"
  | "strava"
  | "health"
  | "shopping"
  | "github"
  | "linear"
  | "gmail"
  | "bitwarden";

export interface SourceItem {
  text: string;
  href?: string;
  meta?: string;
}

export interface Source {
  id: SourceId;
  label: string;
  /** una riga: cosa è stato letto/scritto */
  summary: string;
  /** pagina della dashboard (o URL esterno) dove vedere il dato per intero */
  href?: string;
  items?: SourceItem[];
}

export interface Trace {
  intent(type: string): void;
  source(s: Source): void;
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  kb: "Knowledge base",
  calendar: "Google Calendar",
  study: "Orario di studio",
  gym: "Allenamenti",
  strava: "Strava",
  health: "Apple Health",
  shopping: "Lista della spesa",
  github: "GitHub",
  linear: "Linear",
  gmail: "Gmail",
  bitwarden: "Bitwarden",
};
