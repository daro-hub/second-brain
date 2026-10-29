import { describe, expect, it } from "vitest";
import { pickRoutineByExercises } from "../src/lib/gym";

const cycle = ["gambe", "petto e schiena", "quadricipiti", "femorali", "richiamo schiena e bicipiti", "riposo"];
const routines = {
  gambe: ["Squat", "Hip thrust", "Leg curl"],
  "petto e schiena": ["Panca piana", "Lat machine", "Rematore"],
  quadricipiti: ["Leg extension", "Leg press", "Affondi"],
  femorali: ["Stacchi rumeni", "Leg curl", "Glute bridge"],
  "richiamo schiena e bicipiti": ["Lat machine", "Curl manubri", "Pulley"],
};

describe("posizione nel ciclo dagli esercizi fatti", () => {
  it("riconosce la routine anche quando più giorni hanno lo stesso gruppo muscolare", () => {
    expect(pickRoutineByExercises(["Leg extension", "Leg press"], routines, cycle)).toBe(2);
    expect(pickRoutineByExercises(["stacchi rumeni", "GLUTE BRIDGE"], routines, cycle)).toBe(3);
  });

  it("un esercizio in due routine: vince quella con più esercizi fatti", () => {
    expect(pickRoutineByExercises(["Lat machine", "Curl manubri"], routines, cycle)).toBe(4);
    expect(pickRoutineByExercises(["Lat machine", "Panca piana", "Rematore"], routines, cycle)).toBe(1);
  });

  it("nessuna corrispondenza (o scheda ancora vuota) = −1, cioè si riparte dall'inizio", () => {
    expect(pickRoutineByExercises(["Plank"], routines, cycle)).toBe(-1);
    expect(pickRoutineByExercises([], routines, cycle)).toBe(-1);
    expect(pickRoutineByExercises(["Squat"], {}, cycle)).toBe(-1);
  });
});

import { resolveCyclePosition } from "../src/lib/gym";

describe("segnaposto del ciclo messo a mano", () => {
  const c = ["gambe", "petto e schiena", "quadricipiti", "riposo"];
  const logs = { position: 0, at: "2026-10-29T08:00:00Z" };

  it("se è più recente delle serie vince il segnaposto (ultima fatta = petto e schiena → oggi quadricipiti)", () => {
    expect(resolveCyclePosition(logs, { routine: "Petto e schiena", at: "2026-10-29T09:00:00Z" }, c)).toBe(1);
    expect(resolveCyclePosition(null, { routine: "petto e schiena", at: "2026-10-29T09:00:00Z" }, c)).toBe(1);
  });

  it("le serie registrate dopo il segnaposto tornano a decidere", () => {
    expect(resolveCyclePosition({ position: 2, at: "2026-10-29T12:00:00Z" }, { routine: "petto e schiena", at: "2026-10-29T09:00:00Z" }, c)).toBe(2);
  });

  it("segnaposto assente o con un nome che non è nel ciclo: restano le serie (o −1)", () => {
    expect(resolveCyclePosition(logs, null, c)).toBe(0);
    expect(resolveCyclePosition(logs, { routine: "boh", at: "2026-10-29T09:00:00Z" }, c)).toBe(0);
    expect(resolveCyclePosition(null, null, c)).toBe(-1);
  });
});
