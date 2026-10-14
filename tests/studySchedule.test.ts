import { describe, expect, it, vi } from "vitest";

const events = [
  { summary: "🎓 Algoritmi (Mod. II)", start: "2026-10-15T10:30:00+02:00", end: "2026-10-15T12:30:00+02:00", allDay: false },
  { summary: "📚 Algoritmi (Mod. I)", start: "2026-10-15T08:00:00+02:00", end: "2026-10-15T10:30:00+02:00", allDay: false },
  { summary: "Pedrera", start: "2026-10-15T14:00:00+02:00", end: "2026-10-15T14:30:00+02:00", allDay: false },
  { summary: "📚 Tutto il giorno", start: "2026-10-15", end: "2026-10-16", allDay: true },
];

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("../src/lib/calendar", () => ({
  getEventsInRange: vi.fn(async () => events),
  isStudySyncEvent: (s: string) => /^[📚🎓]/u.test(s),
}));

import { getScheduleForDay } from "../src/lib/workouts";

describe("getScheduleForDay", () => {
  it("legge lezioni e studio dal calendario, in ordine di orario, ignorando gli altri eventi", async () => {
    expect(await getScheduleForDay("2026-10-15")).toEqual([
      { startTime: "08:00", endTime: "10:30", type: "studio", subject: "Algoritmi (Mod. I)" },
      { startTime: "10:30", endTime: "12:30", type: "lezione", subject: "Algoritmi (Mod. II)" },
    ]);
  });
});
