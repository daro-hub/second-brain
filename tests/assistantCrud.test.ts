import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ||= "sk-test";
});
vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("../src/lib/embeddings", () => ({ embed: async () => [0] }));
vi.mock("../src/lib/calendar", () => ({ createEvent: vi.fn(async () => ({})) }));

import { db, resetDb } from "./helpers/memdb";
import { runTool } from "../src/lib/tools/registry";

beforeEach(resetDb);

const ids = (table: string) => db[table].map((r) => r.id as string);

describe("assistente: modifica ed eliminazione (non solo lettura e creazione)", () => {
  it("promemoria: cambia testo e scadenza (e riarma l'avviso), poi lo elimina", async () => {
    db.todo_reminders = [{ id: "r1", text: "chiamare Nicole", due_at: "2026-10-27T08:00:00Z", notified_at: "2026-10-27T08:01:00Z", done_at: null }];
    const upd = await runTool("reminder_update", { id: "r1", text: "chiamare Marco", date: "2026-10-30", time: "10:00" });
    expect(JSON.parse(upd.text)).toEqual({ updated: true });
    expect(db.todo_reminders[0]).toMatchObject({ text: "chiamare Marco", notified_at: null });
    expect(db.todo_reminders[0].due_at).not.toBe("2026-10-27T08:00:00Z");
    expect(JSON.parse((await runTool("reminder_delete", { ids: ["r1", "boh"] })).text)).toEqual({ deleted: 1 });
    expect(db.todo_reminders).toHaveLength(0);
  });

  it("spesa: shopping_remove toglie l'articolo (anche per nome parziale) senza segnarlo comprato", async () => {
    db.shopping_list = [
      { id: "s1", item: "latte parzialmente scremato", added_at: "2026-10-27", checked_at: null },
      { id: "s2", item: "pane", added_at: "2026-10-27", checked_at: null },
    ];
    expect(JSON.parse((await runTool("shopping_remove", { items: ["latte"] })).text)).toEqual({ removed: ["latte parzialmente scremato"] });
    expect(ids("shopping_list")).toEqual(["s2"]);
  });

  it("palestra: corregge e cancella una serie sbagliata", async () => {
    db.workout_logs = [{ id: "w1", exercise: "Panca piana", weight_kg: 60, reps: 8, sets: 3, performed_at: "2026-10-27T10:00:00Z" }];
    expect(JSON.parse((await runTool("gym_log_update", { id: "w1", weightKg: 65 })).text)).toEqual({ updated: true });
    expect(db.workout_logs[0]).toMatchObject({ weight_kg: 65, reps: 8 });
    expect((await runTool("gym_recent_logs", {})).text).toContain("w1");
    await runTool("gym_log_delete", { id: "w1" });
    expect(db.workout_logs).toHaveLength(0);
  });

  it("ore di lavoro e pagamenti: correzione e cancellazione per id", async () => {
    db.work_log = [{ id: "k1", day: "2026-10-26", minutes: 60, task: "AmuseUp", details: null }];
    db.work_payments = [{ id: "p1", paid_on: "2026-10-01", amount_eur: 100, covers_until: "2026-09-30", note: "" }];
    expect(JSON.parse((await runTool("work_log_update", { id: "k1", minutes: 90 })).text)).toEqual({ updated: true });
    expect(db.work_log[0].minutes).toBe(90);
    await runTool("work_log_delete", { id: "k1" });
    await runTool("work_payment_delete", { id: "p1" });
    expect(db.work_log).toHaveLength(0);
    expect(db.work_payments).toHaveLength(0);
  });

  it("knowledge base: riscrive e cancella una nota per id", async () => {
    db.documents = [{ id: "d1", content: "Nicole abita a Padova", source: "telegram" }];
    expect(JSON.parse((await runTool("kb_update", { id: "d1", content: "Nicole abita a Milano" })).text)).toEqual({ updated: true });
    expect(db.documents[0].content).toBe("Nicole abita a Milano");
    expect(JSON.parse((await runTool("kb_delete", { id: "d1" })).text)).toEqual({ deleted: true });
  });

  it("università: voto e data per 'passed', esame pianificato creato e tolto", async () => {
    db.uni_courses = [{ code: "MA0007", name: "Analisi", status: "attending", grade: null, passed_on: null }];
    expect((await runTool("uni_course_set", { code: "MA0007", status: "passed" })).isError).toBe(true); // senza voto e data
    await runTool("uni_course_set", { code: "MA0007", status: "passed", grade: "28", passedOn: "2026-10-20" });
    expect(db.uni_courses[0]).toMatchObject({ status: "passed", grade: "28", passed_on: "2026-10-20" });
    await runTool("uni_exam_save", { courseCode: "MA0007", examDate: "2026-11-10", topics: "integrali" });
    expect(db.uni_exams).toHaveLength(1);
  });
});
