import { describe, expect, it } from "vitest";
import { addPending, freshPending, lectureBase, rawNames, sanitizeTarget, uniqueName, UNI_HINT, type PendingPdf } from "../src/lib/uniUpload";

const pdf = (fileId: string, at: string): PendingPdf => ({ fileId, name: `${fileId}.pdf`, size: 1000, at });

describe("coda dei PDF in attesa", () => {
  const now = Date.parse("2026-10-06T10:00:00Z");
  it("scarta quelli scaduti (oltre 60 minuti) e i doppioni", () => {
    const list = [pdf("vecchio", "2026-10-06T08:00:00Z"), pdf("a", "2026-10-06T09:30:00Z")];
    const out = addPending(list, pdf("a", "2026-10-06T09:59:00Z"), now);
    expect(out.map((p) => p.fileId)).toEqual(["a"]);
  });
  it("tiene al massimo 4 file, gli ultimi", () => {
    let l: PendingPdf[] = [];
    for (const id of ["1", "2", "3", "4", "5"]) l = addPending(l, pdf(id, "2026-10-06T09:59:00Z"), now);
    expect(l.map((p) => p.fileId)).toEqual(["2", "3", "4", "5"]);
  });
  it("freshPending ignora i file scaduti", () => expect(freshPending([pdf("x", "2026-10-05T10:00:00Z")], now)).toEqual([]));
});

describe("sanitizeTarget", () => {
  const today = "2026-10-06";
  it("il caso d'uso: analisi, lezione 4", () => {
    const r = sanitizeTarget({ year: 1, subject: "mathematical-analysis", lecture: 4, date: "2026-10-06", parse: true }, today);
    expect(r).toEqual({ ok: true, target: { year: 1, subject: "mathematical-analysis", lecture: 4, date: "2026-10-06", parse: true } });
  });
  it("senza materia chiede, usando la domanda del modello se c'è", () => {
    expect(sanitizeTarget({ year: 1, subject: null, ask: "Quale materia?" }, today)).toEqual({ ok: false, ask: "Quale materia?" });
    expect(sanitizeTarget({ year: 1 }, today)).toMatchObject({ ok: false });
  });
  it("rifiuta cartelle non sicure (niente .., maiuscole, spazi, slash)", () => {
    for (const subject of ["../etc", "Analisi Matematica", "a/b", "", ".git"]) expect(sanitizeTarget({ year: 1, subject }, today).ok).toBe(false);
  });
  it("anno fuori dall'intervallo → chiede l'anno", () => {
    expect(sanitizeTarget({ year: 4, subject: "fisica" }, today)).toMatchObject({ ok: false });
  });
  it("data mancante = oggi; lezione non valida = null; parse disattivo solo se esplicito", () => {
    const r = sanitizeTarget({ year: 2, subject: "fisica", lecture: -3, date: "boh", parse: false }, today);
    expect(r).toEqual({ ok: true, target: { year: 2, subject: "fisica", lecture: null, date: today, parse: false } });
  });
});

describe("nomi dei file", () => {
  it("base della lezione", () => {
    expect(lectureBase({ lecture: 4, date: "2026-10-06" })).toBe("lecture-04-2026-10-06");
    expect(lectureBase({ lecture: null, date: "2026-10-06" })).toBe("lecture-2026-10-06");
  });
  it("non sovrascrive mai un file esistente", () => {
    expect(uniqueName("lecture-04", "pdf", ["lecture-04.pdf"])).toBe("lecture-04-v2.pdf");
    expect(uniqueName("lecture-04", "pdf", ["lecture-04.pdf", "lecture-04-v2.pdf"])).toBe("lecture-04-v3.pdf");
    expect(uniqueName("lecture-04", "pdf", [])).toBe("lecture-04.pdf");
  });
  it("più PDF della stessa lezione: numerati; un PDF solo: senza numero", () => {
    expect(rawNames("lecture-04", 1, [])).toEqual(["lecture-04.pdf"]);
    expect(rawNames("lecture-04", 2, [])).toEqual(["lecture-04-1.pdf", "lecture-04-2.pdf"]);
    expect(rawNames("lecture-04", 2, ["lecture-04-1.pdf"])).toEqual(["lecture-04-1-v2.pdf", "lecture-04-2.pdf"]);
  });
});

describe("UNI_HINT", () => {
  it("riconosce le istruzioni sul PDF", () => {
    for (const t of ["mettilo su github", "è la lezione 4 di analisi", "fai il parsing", "salvalo negli appunti", "carica sul repo"]) expect(UNI_HINT.test(t)).toBe(true);
  });
  it("non scatta su messaggi che non c'entrano", () => {
    for (const t of ["ciao", "che tempo fa", "quanti passi ho fatto"]) expect(UNI_HINT.test(t)).toBe(false);
  });
});
