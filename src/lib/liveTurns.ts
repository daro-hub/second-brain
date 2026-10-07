/**
 * Le due modalità della conversazione live con Aira:
 * - "realtime": voce↔voce in streaming con la Realtime API di OpenAI (naturale, interrompibile, costosa);
 * - "turns": a frasi, economica. Mentre parli ogni frase (pausa breve) parte subito in trascrizione; quando smetti di
 *   parlare il testo intero va alla pipeline di Aira (la stessa della chat) e la risposta viene letta frase per frase,
 *   cominciando dalla prima senza aspettare la sintesi del resto.
 * La scelta sta nel browser (localStorage), si cambia dalla pagina di stato di Aira.
 */
export type LiveMode = "realtime" | "turns";

export const LIVE_MODE_KEY = "aira.liveMode";

export const LIVE_MODES: { value: LiveMode; label: string; hint: string }[] = [
  { value: "realtime", label: "Streaming", hint: "Voce diretta con OpenAI Realtime: la più naturale e interrompibile, ma costa di più." },
  { value: "turns", label: "A frasi · economica", hint: "Trascrive frase per frase mentre parli, poi risponde a voce: costa molto meno." },
];

export function parseLiveMode(v: unknown): LiveMode {
  return v === "turns" ? "turns" : "realtime";
}

/** Pausa che chiude una frase: da lì parte la trascrizione di quel pezzo, mentre si continua ad ascoltare. */
export const PHRASE_GAP_MS = 500;
/** Silenzio che chiude il turno: il testo di tutte le frasi va ad Aira. */
export const END_GAP_MS = 950;

export function readLiveMode(): LiveMode {
  try {
    return parseLiveMode(window.localStorage.getItem(LIVE_MODE_KEY));
  } catch {
    return "realtime"; // storage bloccato (navigazione privata): resta la modalità predefinita
  }
}

export function writeLiveMode(mode: LiveMode): void {
  try {
    window.localStorage.setItem(LIVE_MODE_KEY, mode);
  } catch {
    /* non salvabile: la scelta vale solo per questa pagina */
  }
}

/** Frasi del parlato trascritte una per una → un unico testo. Le trascrizioni vuote o fallite si saltano. */
export function joinParts(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_CHUNKS = 8;
const MAX_CHUNK_CHARS = 400;

/**
 * Spezza la risposta in pezzi da leggere uno dopo l'altro: ogni pezzo finisce a fine frase (. ! ? …) e i pezzi troppo corti
 * si uniscono al successivo, perché una sintesi per due parole suona a scatti. Con molti pezzi gli ultimi si accorpano.
 */
export function splitSentences(text: string, minLen = 45): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];

  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    // una frase lunghissima senza punteggiatura si taglia sull'ultimo spazio utile
    const pieces: string[] = [];
    let rest = s;
    while (rest.length > MAX_CHUNK_CHARS) {
      const cut = rest.lastIndexOf(" ", MAX_CHUNK_CHARS);
      const at = cut > MAX_CHUNK_CHARS / 2 ? cut : MAX_CHUNK_CHARS;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    pieces.push(rest);
    for (const p of pieces) {
      cur = cur ? `${cur} ${p}` : p;
      if (cur.length >= minLen) {
        chunks.push(cur);
        cur = "";
      }
    }
  }
  if (cur) {
    if (chunks.length && cur.length < minLen / 2) chunks[chunks.length - 1] += ` ${cur}`;
    else chunks.push(cur);
  }
  while (chunks.length > MAX_CHUNKS) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] += ` ${last}`;
  }
  return chunks;
}
