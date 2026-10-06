import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Replay della chat reale di Daro del 05/10/2026 su un database in memoria con i suoi dati veri
 * (routine, storico, il riposo di oggi). L'unico pezzo simulato è il modello: il classificatore risponde con
 * l'intent che ha dato nella chat vera, e le risposte "a partire dai dati" restituiscono il contesto ricevuto,
 * così si verifica cosa il bot GLI PASSA, non come lo riformula.
 */
type Row = Record<string, unknown>;
let tick = 0;
vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

// classificatore: l'intent che il modello ha restituito nella chat vera
const INTENTS: Record<string, Row> = {
  "Quanto faccio di trazioni": { intent: "exercise_query", exercise: "trazioni" },
  "Chest press inclinata 30 kg 7 reps": { intent: "workout", entries: [{ exercise: "chest press inclinata", weightKg: 30, reps: 7, sets: 1, muscleGroup: "petto", sameAsLast: false }] },
  "Trazioni 20 kg 6 reps": { intent: "workout", entries: [{ exercise: "trazioni", weightKg: 20, reps: 6, sets: 1, muscleGroup: "schiena", sameAsLast: false }] },
  "Dimmi quanti ne facevo l'ultima volta": { intent: "exercise_query", exercise: "chest press" },
  "Oggi uguale": { intent: "workout", entries: [{ exercise: "chest press", weightKg: null, reps: null, sets: 1, sameAsLast: true, fromPreviousSession: true }] },
};
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (req: { response_format?: unknown; messages: { role: string; content: string }[] }) => {
          if (req.response_format) {
            const user = req.messages.filter((m) => m.role === "user").at(-1)!.content;
            return { choices: [{ message: { content: JSON.stringify(INTENTS[user] ?? { intent: "none", save: false }) } }] };
          }
          return { choices: [{ message: { content: req.messages[0].content } }] }; // risposta = i dati ricevuti
        },
      },
    };
  },
}));

import { handleMessageTraced } from "../src/lib/respond";
import { db } from "./helpers/memdb";

const L = (exercise: string, w: number, reps: number, at: string, g: string | null) => ({ id: `s${++tick}`, exercise, weight_kg: w, reps, sets: 1, muscle_group: g, performed_at: at });
const R = (routine_name: string, exercise: string, muscle_group: string, order_index: number) => ({ routine_name, exercise, muscle_group, order_index });

function seed() {
  for (const k of Object.keys(db)) db[k] = [];
  db.workout_routines = [
    R("braccia", "db military press", "spalle", 1), R("braccia", "machine curl", "bicipiti", 2), R("braccia", "incline-back db curl", "bicipiti", 4), R("braccia", "hammer curl", "bicipiti", 7),
    R("braccia", "overhead triceps", "tricipiti", 6), R("braccia", "pushdown", "tricipiti", 8), R("braccia", "abs machine", "addome", 10),
    R("leg day", "hack squat", "gambe", 1), R("leg day", "leg curl", "gambe", 2), R("leg day", "leg extension", "gambe", 3),
    R("petto e schiena", "weighted pull-up", "schiena", 1), R("petto e schiena", "incline db press", "petto", 2), R("petto e schiena", "high row", "schiena", 3),
    R("petto e schiena", "chest press", "petto", 4), R("petto e schiena", "row", "schiena", 5), R("petto e schiena", "peck fly", "petto", 6), R("petto e schiena", "abs machine", "addome", 8),
  ];
  db.workout_logs = [
    L("chest press", 25, 6, "2026-08-01T09:37:48Z", "petto"), L("chest press", 30, 7, "2026-08-02T09:37:48Z", "petto"), L("chest press", 30, 6, "2026-08-03T09:37:48Z", "petto"),
    L("incline db press", 24, 8, "2026-08-07T09:37:48Z", "petto"), L("peck fly", 40, 10, "2026-08-09T09:37:48Z", "petto"),
    L("high row", 37.5, 7, "2026-08-14T09:37:48Z", "schiena"), L("high row", 52.5, 5, "2026-08-18T09:37:48Z", "schiena"), L("row", 60, 8, "2026-08-13T09:37:48Z", "schiena"),
    L("weighted pull-up", 10, 6, "2026-08-21T09:37:48Z", "schiena"), L("weighted pull-up", 10, 8, "2026-08-22T09:37:48Z", "schiena"), L("weighted pull-up", 12.5, 9, "2026-08-23T09:37:48Z", "schiena"),
    L("explosive pull-up", 0, 5, "2026-08-24T09:37:48Z", "schiena"),
    L("machine curl", 30, 8, "2026-09-08T09:37:48Z", "bicipiti"), L("hammer curl", 14, 10, "2026-09-14T09:37:48Z", "bicipiti"), L("incline-back db curl", 12, 9, "2026-09-12T09:37:48Z", "bicipiti"),
    L("hack squat", 70, 8, "2026-10-04T20:28:33Z", "gambe"), L("leg curl", 41, 7, "2026-10-04T20:42:19Z", "gambe"), L("leg extension", 84, 8, "2026-10-04T20:50:27Z", "gambe"),
    { id: "rest", exercise: "riposo", weight_kg: 0, reps: 0, sets: 0, muscle_group: "riposo", performed_at: "2026-10-05T14:33:40Z" },
  ];
}

beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = "x";
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T15:25:00Z")); // 17:25 a Roma
  seed();
});
afterEach(() => vi.useRealTimers());

const say = async (text: string) => {
  vi.setSystemTime(Date.now() + 20_000);
  return handleMessageTraced(text);
};

describe("replay della chat del 05/10/2026", () => {
  it("'Schiena e bicipiti' → le ultime sessioni dei DUE gruppi (prima: 'Nessun allenamento registrato per schiena e bicipiti')", async () => {
    const r = await say("Schiena e bicipiti");
    expect(r).not.toContain("Nessun allenamento registrato");
    expect(r).toContain("schiena");
    expect(r).toContain("bicipiti");
    expect(r).toContain("hammer curl: 14kg x10"); // l'ultima sessione dei bicipiti
    expect(r).toContain("explosive pull-up");
  });

  it("la correzione 'schiena e petto' è la routine 'petto e schiena' con i pesi di ogni esercizio", async () => {
    await say("Schiena e bicipiti");
    const r = await say("Ah no scusa devo fare schiena e petto");
    expect(r).not.toContain("Nessun allenamento registrato");
    expect(r).toContain("petto e schiena");
    expect(r).toContain("chest press — <b>30kg x6</b>");
    expect(r).toContain("high row — <b>52.5kg x5</b>");
  });

  it("'Cosa devo allenare oggi' dopo l'annuncio usa i gruppi annunciati; senza annuncio, il ciclo (oggi = petto e schiena)", async () => {
    await say("Schiena e bicipiti");
    const mixed = await say("Cosa devo allenare oggi");
    expect(mixed).toContain("bicipiti");
    expect(mixed).not.toContain("Non trovo qui la scheda");
    seed();
    const cycle = await say("Cosa devo allenare oggi");
    expect(cycle).toContain("Allenamento di oggi: petto e schiena"); // dopo gambe e il riposo di oggi
    expect(cycle).toContain("weighted pull-up");
  });

  it("'Dammi i pesi' e 'Dammi la scheda' danno la scheda (prima: 'Per quali esercizi?' e 'Nessun allenamento registrato')", async () => {
    await say("Ah no scusa devo fare schiena e petto");
    for (const t of ["Dammi i pesi", "Dammi la scheda"]) {
      const r = await say(t);
      expect(r).toContain("petto e schiena");
      expect(r).toContain("chest press");
      expect(r).not.toContain("Per quali esercizi");
    }
  });

  it("'Quanto faccio di trazioni' trova le weighted pull-up (prima: 'Non trovo trazioni nel tuo storico')", async () => {
    const r = await say("Quanto faccio di trazioni");
    expect(r).not.toContain("Non trovo");
    expect(r).toContain("weighted pull-up");
    expect(r).toContain("12.5kg x9");
  });

  it("'Trazioni 20 kg 6 reps' si salva come weighted pull-up, non come un esercizio nuovo", async () => {
    const r = await say("Trazioni 20 kg 6 reps");
    expect(r).toContain("weighted pull-up");
    expect(db.workout_logs.some((l) => l.exercise === "trazioni")).toBe(false);
    expect(r).toContain("Nuovo PR"); // 20 kg batte il 12,5 kg: questo sì è un record vero
  });

  it("il primo log di un esercizio mai fatto non è un 'Nuovo PR'", async () => {
    INTENTS["Face pull 15 kg 10 reps"] = { intent: "workout", entries: [{ exercise: "face pull", weightKg: 15, reps: 10, sets: 1, muscleGroup: "spalle", sameAsLast: false }] };
    expect(await say("Face pull 15 kg 10 reps")).not.toContain("Nuovo PR");
  });

  it("'l'ultima volta' NON è la serie appena fatta, e 'Oggi uguale' registra il valore della sessione precedente", async () => {
    await say("Chest press inclinata 30 kg 7 reps"); // serie di oggi
    const last = await say("Dimmi quanti ne facevo l'ultima volta");
    expect(last).toContain("Serie di OGGI (già registrate): 30kg x7");
    expect(last).toContain("Sessioni PRECEDENTI a oggi (dalla più recente): 30kg x6"); // la più recente prima di oggi, non 30kg x7 di oggi
    expect(last).toContain("sessione PRECEDENTE");
    const same = await say("Oggi uguale");
    expect(same).toContain("<b>chest press</b> 30kg x6");
    expect(db.workout_logs.filter((l) => l.exercise === "chest press").at(-1)).toMatchObject({ weight_kg: 30, reps: 6 });
  });

  it("'Cosa devo fare stasera' a metà allenamento non salta a 'braccia': la routine di oggi è quella in corso", async () => {
    await say("Chest press inclinata 30 kg 7 reps");
    const plan = await say("Cosa devo allenare oggi");
    expect(plan).toContain("Allenamento di oggi: petto e schiena");
    expect(plan).toContain("oggi ✓ 30kg x7"); // il pannello mostra anche quanto già fatto oggi
  });
});
