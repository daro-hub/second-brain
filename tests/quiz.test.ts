import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../src/data/countries";
import {
  EUROPE,
  WITH_BORDERS,
  buildBordersQuiz,
  buildCapitalQuiz,
  formatQuiz,
  parseHistoryQuiz,
  parseQuizCallback,
  pickSubject,
  quizKeyboard,
  similarity,
  type SubjectStat,
} from "../src/lib/quizBuild";

/** Generatore pseudo-casuale con seme, per prove ripetibili. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("dati dei paesi", () => {
  it("i confini sono reciproci e senza paesi sconosciuti", () => {
    const by = new Map(COUNTRIES.map((c) => [c.code, c]));
    for (const c of COUNTRIES) for (const b of c.borders) expect(by.get(b)?.borders, `${c.code}-${b}`).toContain(c.code);
  });
  it("Europa: 44 paesi con capitale più il Kosovo", () => {
    expect(EUROPE).toHaveLength(45);
    expect(EUROPE.find((c) => c.code === "ITA")?.capital).toBe("Roma");
  });
});

describe("quiz capitali", () => {
  it("quattro opzioni diverse e la giusta è all'indice indicato, per ogni paese", () => {
    for (const c of EUROPE) {
      const q = buildCapitalQuiz(c, EUROPE, seeded(7 + c.code.charCodeAt(0)));
      expect(new Set(q.options).size).toBe(4);
      expect([c.name, c.capital]).toContain(q.options[q.correct]);
    }
  });
  it("Parigi → Francia e Francia → Parigi", () => {
    const fra = EUROPE.find((c) => c.code === "FRA")!;
    const a = buildCapitalQuiz(fra, EUROPE, () => 0.1);
    expect(a.question).toContain("Parigi");
    expect(a.options[a.correct]).toBe("Francia");
    const b = buildCapitalQuiz(fra, EUROPE, () => 0.9);
    expect(b.question).toContain("Francia");
    expect(b.options[b.correct]).toBe("Parigi");
  });
  it("le risposte sbagliate sono paesi vicini, non a caso", () => {
    const slo = EUROPE.find((c) => c.code === "SVN")!;
    for (let s = 1; s <= 10; s++) {
      const q = buildCapitalQuiz(slo, EUROPE, () => 0.9 * (s / 10));
      const wrong = q.options.filter((_, i) => i !== q.correct);
      const owners = EUROPE.filter((c) => wrong.includes(c.capital) || wrong.includes(c.name));
      expect(owners).toHaveLength(3);
      for (const o of owners) expect(Math.hypot(o.lat - slo.lat, o.lng - slo.lng), o.name).toBeLessThan(15);
    }
    expect(similarity("Slovenia", "Slovacchia")).toBeGreaterThan(similarity("Slovenia", "Portogallo"));
  });
});

describe("quiz confini", () => {
  it("per ogni paese: la giusta confina, le sbagliate no, mai il paese stesso", () => {
    for (const c of WITH_BORDERS) {
      for (let s = 1; s <= 3; s++) {
        const q = buildBordersQuiz(c, COUNTRIES, seeded(s * 31 + c.code.charCodeAt(1)));
        const names = new Map(COUNTRIES.map((x) => [x.name, x]));
        expect(new Set(q.options).size).toBe(4);
        q.options.forEach((o, i) => {
          const x = names.get(o)!;
          expect(x.code).not.toBe(c.code);
          expect(c.borders.includes(x.code), `${c.code} ${o}`).toBe(i === q.correct);
        });
      }
    }
  }, 30_000);
  it("la spiegazione elenca tutti i vicini", () => {
    const ita = COUNTRIES.find((c) => c.code === "ITA")!;
    const q = buildBordersQuiz(ita, COUNTRIES, seeded(1));
    for (const n of ["Francia", "Svizzera", "Austria", "Slovenia", "San Marino", "Città del Vaticano"]) expect(q.explanation).toContain(n);
  });
});

describe("cosa chiedere", () => {
  const subjects = ["a", "b", "c"];
  it("prima ciò che non è mai stato chiesto", () => {
    const stats = new Map<string, SubjectStat>([["a", { lastSent: "2026-10-01", lastWrong: false }]]);
    for (let s = 1; s < 20; s++) expect(["b", "c"]).toContain(pickSubject(subjects, stats, "2026-10-30", seeded(s)));
  });
  it("gli errori tornano dopo 2 giorni, subito se non c'è altro da scoprire", () => {
    const all = new Map<string, SubjectStat>([
      ["a", { lastSent: "2026-10-20", lastWrong: false }],
      ["b", { lastSent: "2026-10-28", lastWrong: true }],
      ["c", { lastSent: "2026-10-25", lastWrong: false }],
    ]);
    expect(pickSubject(subjects, all, "2026-10-30", () => 0.5)).toBe("b");
    const fresh = new Map(all).set("b", { lastSent: "2026-10-30", lastWrong: true });
    expect(pickSubject(subjects, fresh, "2026-10-30", () => 0)).not.toBe("b");
  });
});

describe("domande di storia", () => {
  const ok = { topic: "Rivoluzione francese", question: "In che anno fu presa la Bastiglia?", options: ["1787", "1789", "1791", "1793"], correct: 1, explanation: "Il 14 luglio 1789." };
  it("la risposta giusta resta quella dopo il rimescolamento", () => {
    for (let s = 1; s < 30; s++) {
      const q = parseHistoryQuiz(JSON.stringify(ok), seeded(s))!;
      expect(q.options[q.correct]).toBe("1789");
    }
  });
  it("scarta opzioni duplicate, indice fuori misura, campi vuoti, testo non JSON", () => {
    expect(parseHistoryQuiz(JSON.stringify({ ...ok, options: ["1789", "1789", "1791", "1793"] }))).toBeNull();
    expect(parseHistoryQuiz(JSON.stringify({ ...ok, correct: 4 }))).toBeNull();
    expect(parseHistoryQuiz(JSON.stringify({ ...ok, explanation: "" }))).toBeNull();
    expect(parseHistoryQuiz(JSON.stringify({ ...ok, options: ["a", "b", "c"] }))).toBeNull();
    expect(parseHistoryQuiz("non json")).toBeNull();
  });
  it("il testo del modello è reso innocuo per l'HTML di Telegram", () => {
    const q = parseHistoryQuiz(JSON.stringify({ ...ok, question: "Chi era <b>Cesare</b> & Pompeo?" }))!;
    expect(q.question).toBe("Chi era &lt;b&gt;Cesare&lt;/b&gt; &amp; Pompeo?");
  });
});

describe("messaggio e bottoni", () => {
  it("callback: andata e ritorno, 64 byte al massimo, rifiuta il resto", () => {
    const kb = quizKeyboard(UUID, "confini", ["Francia", "Spagna", "Andorra", "Svizzera"]);
    const data = kb.inline_keyboard.flat().map((b) => ("callback_data" in b ? b.callback_data : ""));
    expect(data).toHaveLength(4);
    for (const d of data) expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
    expect(parseQuizCallback(data[2])).toEqual({ id: UUID, idx: 2 });
    expect(parseQuizCallback("qz:xx:1")).toBeNull();
    expect(parseQuizCallback(`qz:${UUID}:4`)).toBeNull();
  });
  it("geografia: nomi sui bottoni, storia: lettere e opzioni nel testo", () => {
    const geo = quizKeyboard(UUID, "capitali", ["Roma", "Parigi", "Madrid", "Berna"]);
    expect(geo.inline_keyboard.map((r) => r.map((b) => b.text))).toEqual([["Roma", "Parigi"], ["Madrid", "Berna"]]);
    const st = quizKeyboard(UUID, "storia", ["1787", "1789", "1791", "1793"]);
    expect(st.inline_keyboard.map((r) => r.map((b) => b.text))).toEqual([["A", "B", "C", "D"]]);
    const text = formatQuiz({ kind: "storia", subject: "x", question: "Domanda?", options: ["1787", "1789", "1791", "1793"], correct: 1, explanation: "Spiegazione." });
    expect(text).toContain("<b>B</b>) 1789");
  });
  it("dopo la risposta mostra esito e spiegazione", () => {
    const base = { kind: "capitali" as const, subject: "cap:FRA", question: "Q", options: ["Roma", "Parigi", "Madrid", "Berna"], correct: 1, explanation: "Capitale di Francia: Parigi." };
    expect(formatQuiz({ ...base, answeredIdx: 1 })).toContain("✅ <b>Esatto!</b> Parigi");
    const wrong = formatQuiz({ ...base, answeredIdx: 0 });
    expect(wrong).toContain("Hai scelto Roma");
    expect(wrong).toContain("Era <b>Parigi</b>");
    expect(wrong).toContain("Capitale di Francia: Parigi.");
  });
});
