import { describe, expect, it } from "vitest";
import { parseLecture, pickSubject, tryNotesRequest, type NotesDeps } from "../src/lib/uniNotesRequest";

const subjects = [
  { year: 1, slug: "programming-and-lab" },
  { year: 2, slug: "object-oriented-programming" },
  { year: 2, slug: "algorithms-and-data-structures" },
];
const files = [
  { name: "lecture-01-manca-un-pezzo.pdf", type: "file" as const, size: 10 },
  { name: "lecture-02-funziona-non-vuol-dire-giusto.pdf", type: "file" as const, size: 10 },
];
const deps = (over: Partial<NotesDeps> = {}): NotesDeps => ({ subjects: async () => subjects, list: async () => files, get: async (p) => Buffer.from(p), ...over });

describe("parseLecture", () => {
  it("riconosce i modi di dire il numero", () => {
    expect(parseLecture("appunti lezione 2")).toBe(2);
    expect(parseLecture("la L03")).toBe(3);
    expect(parseLecture("la 4 lezione")).toBe(4);
    expect(parseLecture("Dammi la quinta lezione di lagoritmi")).toBe(5);
    expect(parseLecture("l'ultima")).toBe("last");
    expect(parseLecture("gli appunti")).toBeNull();
  });
});

describe("pickSubject", () => {
  it("«programmazione» a parità sceglie l'anno più alto, «oggetti» la sua materia", () => {
    expect(pickSubject("programmazione", subjects)?.slug).toBe("object-oriented-programming");
    expect(pickSubject("programmazione a oggetti", subjects)?.slug).toBe("object-oriented-programming");
    expect(pickSubject("algoritmi", subjects)?.slug).toBe("algorithms-and-data-structures");
    expect(pickSubject("la quinta lezione di lagoritmi", subjects)?.slug).toBe("algorithms-and-data-structures");
    expect(pickSubject("cucina", subjects)).toBeNull();
  });
});

describe("tryNotesRequest", () => {
  it("«la quinta lezione di lagoritmi» (ordinale + refuso) trova la lezione 5", async () => {
    const five = [{ name: "lecture-05-grafi.pdf", type: "file" as const, size: 10 }];
    const r = await tryNotesRequest("Dammi la quinta lezione di lagoritmi", deps({ list: async () => five }));
    expect(r).toMatchObject({ kind: "files", files: [{ name: "lecture-05-grafi.pdf" }] });
  });
  it("manda il file della lezione chiesta", async () => {
    const r = await tryNotesRequest("dammi gli appunti di programmazione lezione 2", deps());
    expect(r).toMatchObject({ kind: "files", files: [{ name: "lecture-02-funziona-non-vuol-dire-giusto.pdf" }] });
  });
  it("senza numero manda l'ultima", async () => {
    const r = await tryNotesRequest("mandami gli appunti di programmazione", deps());
    expect(r).toMatchObject({ kind: "files", files: [{ name: "lecture-02-funziona-non-vuol-dire-giusto.pdf" }] });
  });
  it("lezione inesistente: dice quali ci sono", async () => {
    const r = await tryNotesRequest("dammi gli appunti di programmazione lezione 9", deps());
    expect(r).toMatchObject({ kind: "text", html: expect.stringContaining("1, 2") });
  });
  it("non intercetta ciò che non è una richiesta di appunti", async () => {
    expect(await tryNotesRequest("mettilo su github, programmazione, lezione 4", deps())).toBeNull();
    expect(await tryNotesRequest("dammi gli appunti di cucina", deps())).toBeNull();
    expect(await tryNotesRequest("com'è andata la lezione di programmazione?", deps())).toBeNull();
  });
});
