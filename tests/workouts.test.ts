import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { workout_logs: [], workout_routines: [] };
let nextId = 1;

/** Mini database in memoria che capisce le catene di query usate da workouts.ts. */
class Q {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private inserted: Row | null = null;
  constructor(private table: string) {}
  select() { return this; }
  insert(row: Row) { this.inserted = { id: `id${nextId++}`, performed_at: new Date().toISOString(), ...row }; db[this.table].push(this.inserted); return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
  ilike(c: string, v: string) { this.filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  private rows(): Row[] {
    if (this.inserted) return [this.inserted];
    let r = db[this.table].filter((x) => this.filters.every((f) => f(x)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      r = r.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return this.max ? r.slice(0, this.max) : r;
  }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] ?? null, error: null }); }
  single() { return Promise.resolve({ data: this.rows()[0], error: null }); }
  then(res: (v: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: this.rows(), error: null }).then(res); }
}

vi.mock("../src/lib/supabase", () => ({ supabase: { from: (t: string) => new Q(t) } }));
vi.mock("openai", () => ({ default: class {} }));

import { getLastLogFor, getLastSession, getRoutineForToday, getRoutinePreview, logWorkout, resolveExercise } from "../src/lib/workouts";

const TODAY = "2026-10-05"; // dayRangeUtc: dal 2026-10-04T22:00Z
const log = (exercise: string, w: number, reps: number, at: string, group: string | null) =>
  db.workout_logs.push({ id: `l${nextId++}`, exercise, weight_kg: w, reps, sets: 1, muscle_group: group, performed_at: at });

beforeEach(() => {
  db.workout_logs = [];
  db.workout_routines = [
    { routine_name: "petto e schiena", exercise: "weighted pull-up", muscle_group: "schiena", order_index: 1 },
    { routine_name: "petto e schiena", exercise: "chest press", muscle_group: "petto", order_index: 2 },
    { routine_name: "braccia", exercise: "machine curl", muscle_group: "bicipiti", order_index: 1 },
  ];
  // storico come nel database vero
  log("chest press", 30, 7, "2026-08-02T09:37:48Z", "petto");
  log("chest press", 30, 6, "2026-08-03T09:37:48Z", "petto");
  log("weighted pull-up", 12.5, 9, "2026-08-23T09:37:48Z", "schiena");
  log("weighted pull-up", 10, 8, "2026-08-22T09:37:48Z", "schiena");
  log("explosive pull-up", 0, 5, "2026-08-24T09:37:48Z", "schiena");
  log("leg curl", 41, 7, "2026-10-04T20:42:00Z", "gambe");
});

describe("logWorkout — niente 'Nuovo PR!' al primo log di un esercizio", () => {
  it("un esercizio nuovo non è un record (non c'è niente da battere)", async () => {
    const r = await logWorkout({ exercise: "esercizio mai fatto", weightKg: 20, reps: 6, sets: 1 });
    expect(r.isPR).toBe(false);
  });
  it("battere lo storico sì, non batterlo no", async () => {
    expect((await logWorkout({ exercise: "chest press", weightKg: 40, reps: 8, sets: 1 })).isPR).toBe(true);
    expect((await logWorkout({ exercise: "chest press", weightKg: 20, reps: 5, sets: 1 })).isPR).toBe(false);
  });
});

describe("'l'ultima volta' è un'altra sessione, non le serie di oggi", () => {
  beforeEach(() => log("chest press", 30, 7, "2026-10-05T16:00:49Z", "petto")); // già fatto oggi
  it("getLastLogFor con il giorno di oggi salta le serie di oggi (prima rispondeva '30 kg x7' = quella appena fatta)", async () => {
    expect(await getLastLogFor("chest press", TODAY)).toMatchObject({ weight_kg: 30, reps: 6 });
  });
  it("senza il giorno (serie ripetuta nella stessa sessione) resta l'ultima in assoluto", async () => {
    expect(await getLastLogFor("chest press")).toMatchObject({ weight_kg: 30, reps: 7 });
  });
  it("getLastSession(gruppo, oggi) non restituisce la sessione di oggi", async () => {
    log("high row", 50, 6, "2026-10-05T16:14:11Z", "schiena");
    const s = await getLastSession("schiena", TODAY);
    expect(s?.map((x) => x.exercise).sort()).toEqual(["explosive pull-up"]); // il 24 agosto, non oggi
    expect((await getLastSession("schiena"))?.map((x) => x.exercise)).toEqual(["high row"]);
  });
  it("getRoutinePreview mostra i pesi di PRIMA e, a parte, quanto fatto oggi", async () => {
    const p = await getRoutinePreview("petto e schiena", TODAY);
    const cp = p!.find((x) => x.exercise === "chest press")!;
    expect(cp.last).toMatchObject({ weight_kg: 30, reps: 6 });
    expect(cp.today).toMatchObject({ weight_kg: 30, reps: 7 });
    expect(p!.find((x) => x.exercise === "weighted pull-up")!.today).toBeNull();
  });
});

describe("getRoutineForToday — a metà allenamento la routine di oggi è quella in corso", () => {
  it("dopo gambe e un riposo tocca petto e schiena; una volta iniziata resta petto e schiena (non 'braccia')", async () => {
    db.workout_logs.push({ id: "r1", exercise: "riposo", weight_kg: 0, reps: 0, sets: 0, muscle_group: "riposo", performed_at: "2026-10-05T14:33:40Z" });
    expect(await getRoutineForToday(TODAY)).toBe("petto e schiena");
    log("chest press", 30, 7, "2026-10-05T16:00:49Z", "petto");
    expect(await getRoutineForToday(TODAY)).toBe("petto e schiena");
  });
  it("senza serie oggi usa il ciclo: dopo gambe viene il riposo", async () => {
    expect(await getRoutineForToday(TODAY)).toBe("riposo");
  });
});

describe("resolveExercise — 'trazioni' è 'weighted pull-up'", () => {
  it("trova l'esercizio dello storico invece di crearne uno nuovo", async () => {
    const r = await resolveExercise("trazioni", "schiena");
    expect(r.match?.name).toBe("weighted pull-up");
  });
  it("'trazioni zavorrate' esclude le explosive", async () => {
    expect((await resolveExercise("trazioni zavorrate")).match?.name).toBe("weighted pull-up");
  });
  it("il comportamento di prima: 'extension' → 'leg extension'", async () => {
    log("leg extension", 84, 8, "2026-10-04T20:50:00Z", "gambe");
    expect((await resolveExercise("extension")).match?.name).toBe("leg extension");
  });
});
