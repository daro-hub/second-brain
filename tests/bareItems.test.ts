import { describe, expect, it } from "vitest";
import { parseBareItems } from "../src/lib/bareItems";

describe("parseBareItems — un prodotto da solo è 'aggiungi alla spesa'", () => {
  it("il caso della chat: 'Latte'", () => expect(parseBareItems("Latte")).toEqual(["latte"]));
  it("più prodotti, con 'e' o virgole", () => {
    expect(parseBareItems("pane e uova")).toEqual(["pane", "uova"]);
    expect(parseBareItems("Latte, burro, mele")).toEqual(["latte", "burro", "mele"]);
  });
  it("prodotti composti e articoli", () => {
    expect(parseBareItems("carta igienica")).toEqual(["carta igienica"]);
    expect(parseBareItems("il detersivo")).toEqual(["detersivo"]);
  });
  it("singolare/plurale", () => {
    expect(parseBareItems("uovo")).toEqual(["uovo"]);
    expect(parseBareItems("biscotto")).toEqual(["biscotto"]);
  });
  it("impara dalla lista: prodotti già messi in passato anche se non nel lessico", () => {
    expect(parseBareItems("kefir")).toBeNull();
    expect(parseBareItems("kefir", ["kefir"])).toEqual(["kefir"]);
  });
  it("non intercetta frasi, domande o nomi che non sono prodotti", () => {
    expect(parseBareItems("Nicole")).toBeNull();
    expect(parseBareItems("Leg curl")).toBeNull();
    expect(parseBareItems("Analisi")).toBeNull();
    expect(parseBareItems("quanto latte ho bevuto?")).toBeNull();
    expect(parseBareItems("ho bevuto il latte")).toBeNull();
    expect(parseBareItems("latte e qualcosa di strano")).toBeNull();
    expect(parseBareItems("")).toBeNull();
  });
  it("una voce sconosciuta annulla tutto (meglio il modello che un'aggiunta sbagliata)", () => {
    expect(parseBareItems("latte e nicole")).toBeNull();
  });
});

describe("articoli", () => {
  it("non taglia pezzi di parola (latte, lattuga, lamette non perdono 'la')", () => {
    expect(parseBareItems("lattuga")).toEqual(["lattuga"]);
    expect(parseBareItems("lamette")).toEqual(["lamette"]);
    expect(parseBareItems("la mela")).toEqual(["mela"]);
    expect(parseBareItems("l'olio")).toEqual(["olio"]);
  });
});
