import { describe, expect, it } from "vitest";
import { dropEmptyIconLines } from "../src/lib/format";

describe("dropEmptyIconLines — le icone vuote in fondo alla risposta", () => {
  it("il caso della chat: 📅 📚 🏋️ da soli su una riga spariscono", () => {
    const reply = "📅 Questa sera hai:\n\n• TEST second-brain — 17:00–18:00\n• Assemblea di ESN — 19:30–20:30\n📅\n📚\n🏋️";
    expect(dropEmptyIconLines(reply)).toBe("📅 Questa sera hai:\n\n• TEST second-brain — 17:00–18:00\n• Assemblea di ESN — 19:30–20:30");
  });
  it("non tocca le righe con testo, nemmeno se iniziano con un'icona", () => {
    const reply = "🏋️ Allenamento: riposo\n📚 Nessuna lezione";
    expect(dropEmptyIconLines(reply)).toBe(reply);
  });
  it("un messaggio fatto solo di emoji resta com'è (meglio di una risposta vuota)", () => {
    expect(dropEmptyIconLines("👍")).toBe("👍");
  });
  it("comprime le righe vuote lasciate dalla pulizia", () => {
    expect(dropEmptyIconLines("Ciao\n\n📚\n\n\nFine")).toBe("Ciao\n\nFine");
  });
});
