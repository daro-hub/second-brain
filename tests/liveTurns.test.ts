import { describe, expect, it } from "vitest";
import { END_GAP_MS, joinParts, parseLiveMode, PHRASE_GAP_MS, splitSentences } from "../src/lib/liveTurns";

describe("parseLiveMode", () => {
  it("solo 'turns' attiva la modalità a frasi; tutto il resto è lo streaming", () => {
    expect(parseLiveMode("turns")).toBe("turns");
    expect(parseLiveMode("realtime")).toBe("realtime");
    expect(parseLiveMode(null)).toBe("realtime");
    expect(parseLiveMode("boh")).toBe("realtime");
  });
  it("la pausa di frase è più corta di quella di fine turno", () => {
    expect(PHRASE_GAP_MS).toBeLessThan(END_GAP_MS);
  });
});

describe("joinParts — le frasi trascritte una per una", () => {
  it("le unisce nell'ordine, saltando vuoti e fallite", () => {
    expect(joinParts(["Ciao Aira,", "  ", null, "cosa ho in agenda  oggi?", undefined])).toBe("Ciao Aira, cosa ho in agenda oggi?");
  });
  it("nessuna frase utile → stringa vuota", () => {
    expect(joinParts([null, "", "  "])).toBe("");
  });
});

describe("splitSentences — la risposta letta a pezzi", () => {
  it("un testo breve resta un pezzo solo", () => {
    expect(splitSentences("Oggi hai la palestra alle 18.")).toEqual(["Oggi hai la palestra alle 18."]);
  });
  it("vuoto → nessun pezzo", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
  it("spezza a fine frase e unisce le frasi troppo corte al pezzo dopo", () => {
    const out = splitSentences("Ok. Domani hai il dentista alle 18 e prima la lezione di algoritmi. Poi sei libero. Vuoi che ti ricordi qualcosa?");
    expect(out.join(" ")).toBe("Ok. Domani hai il dentista alle 18 e prima la lezione di algoritmi. Poi sei libero. Vuoi che ti ricordi qualcosa?");
    expect(out[0]).toBe("Ok. Domani hai il dentista alle 18 e prima la lezione di algoritmi.");
    expect(out.every((c) => c.length >= 20)).toBe(true);
  });
  it("non perde né duplica testo", () => {
    const text = "Prima frase abbastanza lunga da stare da sola nel suo pezzo. Seconda frase altrettanto lunga da sola, davvero. Terza! Quarta?";
    expect(splitSentences(text).join(" ")).toBe(text);
  });
  it("una frase lunghissima senza punteggiatura si taglia sugli spazi", () => {
    const long = Array.from({ length: 150 }, (_, i) => `parola${i}`).join(" ");
    const out = splitSentences(long);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.length <= 420)).toBe(true);
    expect(out.join(" ")).toBe(long);
  });
  it("mai più di 8 pezzi: gli ultimi si accorpano", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Questa è la frase numero ${i} della risposta lunga.`).join(" ");
    const out = splitSentences(text);
    expect(out.length).toBeLessThanOrEqual(8);
    expect(out.join(" ")).toBe(text);
  });
});
