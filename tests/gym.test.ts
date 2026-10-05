import { describe, expect, it } from "vitest";
import { exerciseTokens, formatRoutinePreview, groupsFromText, isGroupAnnouncement, latestAnnouncedGroups, routineForGroups, wantsGymPlan } from "../src/lib/gym";

const routines = { "petto e schiena": ["schiena", "petto", "addome"], braccia: ["spalle", "bicipiti", "tricipiti", "addome"], "leg day": ["gambe", "addome"] };

describe("groupsFromText — 'Schiena e bicipiti' non è un gruppo solo", () => {
  it("separa i gruppi e tiene l'ordine", () => {
    expect(groupsFromText("Schiena e bicipiti")).toEqual(["schiena", "bicipiti"]);
    expect(groupsFromText("Ah no scusa devo fare schiena e petto")).toEqual(["schiena", "petto"]);
  });
  it("riconosce sinonimi, plurali e le routine composte", () => {
    expect(groupsFromText("pettorali e dorsali")).toEqual(["petto", "schiena"]);
    expect(groupsFromText("oggi braccia")).toEqual(["bicipiti", "tricipiti", "spalle"]);
    expect(groupsFromText("leg day")).toEqual(["gambe"]);
  });
  it("nessun gruppo nelle altre frasi", () => {
    expect(groupsFromText("Cosa devo allenare oggi")).toEqual([]);
    expect(groupsFromText("Quanto faccio di trazioni")).toEqual([]);
  });
});

describe("isGroupAnnouncement / latestAnnouncedGroups", () => {
  it("annuncio = solo gruppi e parole di contorno", () => {
    for (const t of ["Schiena e bicipiti", "Ah no scusa devo fare schiena e petto", "oggi petto"]) expect(isGroupAnnouncement(t)).toBe(true);
  });
  it("non è un annuncio se ha numeri, domande o altre richieste", () => {
    for (const t of ["petto 70 kg 8", "quanto peso in schiena?", "dimmi i pesi della schiena", "Cosa devo allenare oggi"]) expect(isGroupAnnouncement(t)).toBe(false);
  });
  it("la correzione più recente vince (schiena e bicipiti → schiena e petto)", () => {
    const history = [
      { role: "user", content: "Schiena e bicipiti" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Ah no scusa devo fare schiena e petto" },
      { role: "user", content: "Quanto faccio di trazioni" },
    ];
    expect(latestAnnouncedGroups(history)).toEqual(["schiena", "petto"]);
  });
  it("senza annunci → null", () => expect(latestAnnouncedGroups([{ role: "user", content: "ciao" }])).toBeNull());
});

describe("routineForGroups", () => {
  it("petto + schiena (in qualsiasi ordine) = la routine 'petto e schiena'", () => {
    expect(routineForGroups(["schiena", "petto"], routines)).toBe("petto e schiena");
    expect(routineForGroups(["petto", "schiena", "addome"], routines)).toBe("petto e schiena");
  });
  it("una scelta mista (schiena + bicipiti) non è una routine; un gruppo solo nemmeno", () => {
    expect(routineForGroups(["schiena", "bicipiti"], routines)).toBeNull();
    expect(routineForGroups(["petto"], routines)).toBeNull();
  });
  it("bicipiti + tricipiti → braccia", () => expect(routineForGroups(["bicipiti", "tricipiti"], routines)).toBe("braccia"));
});

describe("wantsGymPlan — 'Cosa devo allenare oggi', 'Dammi la scheda', 'Dammi i pesi'", () => {
  it("le frasi della chat", () => {
    for (const t of ["Cosa devo allenare oggi", "Dammi la scheda", "Dammi i pesi", "che allenamento faccio oggi?", "cosa faccio in palestra", "scheda", "la scheda di oggi", "quali esercizi devo fare oggi"]) expect(wantsGymPlan(t)).toBe(true);
  });
  it("non scatta sul passato né su un esercizio specifico", () => {
    for (const t of ["che allenamento ho fatto ieri?", "dammi i pesi del leg curl", "quanto faccio di trazioni", "cosa ho in agenda oggi", "Chest press"]) expect(wantsGymPlan(t)).toBe(false);
  });
});

describe("exerciseTokens — 'trazioni' = 'weighted pull-up'", () => {
  const has = (a: string[], b: string[]) => b.every((t) => a.includes(t));
  it("le trazioni italiane corrispondono alle pull-up dello storico", () => {
    expect(has(exerciseTokens("weighted pull-up"), exerciseTokens("trazioni"))).toBe(true);
    expect(has(exerciseTokens("explosive pull-up"), exerciseTokens("trazioni"))).toBe(true);
    expect(has(exerciseTokens("weighted pull-up"), exerciseTokens("trazioni zavorrate"))).toBe(true);
    expect(has(exerciseTokens("explosive pull-up"), exerciseTokens("trazioni zavorrate"))).toBe(false);
  });
  it("il comportamento di prima resta: 'extension' è contenuto in 'leg extension'", () => {
    expect(has(exerciseTokens("leg extension"), exerciseTokens("extension"))).toBe(true);
    expect(exerciseTokens("Leg curls")).toEqual(["leg", "curl"]);
  });
});

describe("formatRoutinePreview", () => {
  it("mostra i pesi di prima e, se c'è, quanto fatto oggi", () => {
    const t = formatRoutinePreview("petto e schiena", [
      { exercise: "chest press", last: { weight_kg: 30, reps: 6 }, today: { weight_kg: 30, reps: 7 } },
      { exercise: "row", last: null, today: null },
    ]);
    expect(t).toContain("chest press — <b>30kg x6</b> · oggi ✓ 30kg x7");
    expect(t).toContain("row — nessun dato precedente");
    expect(t).toContain("ultimi pesi prima di oggi");
  });
});
