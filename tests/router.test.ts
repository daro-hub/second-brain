import { describe, expect, it } from "vitest";
import { ROUTER_CASES, matchesExpectation } from "../evals/router.cases";
import { earlyRoute, lateRoute, quickRoute } from "../src/lib/router";
import { describeTopic, topicIsFresh, TOPIC_TTL_MIN } from "../src/lib/topicFormat";

describe("scorciatoie del router: prendono le frasi giuste e NON ne rubano altre", () => {
  for (const c of ROUTER_CASES) {
    it(`${c.id}: «${c.text}» → ${c.quick ?? "al modello"}`, () => {
      expect(quickRoute(c.text)).toBe(c.quick ?? null);
    });
  }
  it("l'ordine: 'spesa' e 'gym' sono prima di tutto, i gruppi e la scheda dopo", () => {
    expect(earlyRoute("Spesa")).toBe("shopping_query");
    expect(earlyRoute("gym")).toBe("gym_keyword");
    expect(earlyRoute("Schiena e petto")).toBeNull();
    expect(lateRoute("Schiena e petto")).toBe("group_announcement");
  });
  it("non rubano frasi comuni di altri ambiti", () => {
    for (const t of ["che impegni ho oggi", "quanto costa Aira", "cosa devo comprare", "che tempo fa", "come sto andando", "quante proteine ho mangiato", "mettilo su github", "dammi i pesi del leg curl", "che allenamento ho fatto ieri"]) {
      expect(quickRoute(t), t).toBeNull();
    }
  });
});

describe("il file dei casi è coerente", () => {
  it("id unici e frasi uniche", () => {
    expect(new Set(ROUTER_CASES.map((c) => c.id)).size).toBe(ROUTER_CASES.length);
    expect(new Set(ROUTER_CASES.map((c) => c.text)).size).toBe(ROUTER_CASES.length);
  });
  it("matchesExpectation: tipo ammesso e campi indicati", () => {
    expect(matchesExpectation({ type: "github_query", repoName: "*" }, { type: "github_query", repoName: "*" })).toBe(true);
    expect(matchesExpectation({ type: "github_query", repoName: "orbis" }, { type: "github_query", repoName: "*" })).toBe(false);
    expect(matchesExpectation({ type: "clarify" }, { type: ["clarify", "ask"] })).toBe(true);
    expect(matchesExpectation({ type: "none" }, { type: "unsupported" })).toBe(false);
  });
});

describe("argomento attivo", () => {
  const now = Date.parse("2026-10-06T10:00:00Z");
  const t = { intent: "gym_plan", text: "Dammi i pesi", at: now - 3 * 60_000 };
  it("fresco: lo descrive per il modello, con i minuti", () => {
    expect(topicIsFresh(t, now)).toBe(true);
    expect(describeTopic(t, now)).toContain("«gym_plan»");
    expect(describeTopic(t, now)).toContain("3 min fa");
    expect(describeTopic(t, now)).toContain("Dammi i pesi");
  });
  it("scaduto o assente: niente (un argomento vecchio confonderebbe)", () => {
    expect(describeTopic({ ...t, at: now - (TOPIC_TTL_MIN + 1) * 60_000 }, now)).toBe("");
    expect(describeTopic(null, now)).toBe("");
  });
});

import { isPeopleQuestion } from "../src/lib/router";

describe("domande sulle persone (non sono «richieste non supportate»)", () => {
  it.each(["che persone conosco", "chi è checco", "chi è kekko?", "chi sono i miei amici", "Chi sono i miei amici?", "cosa sai di Nicole", "ti ricordi di Nicole?"])(
    "«%s» va alla knowledge base",
    (t) => expect(isPeopleQuestion(t)).toBe(true),
  );
  it.each(["quanto ho speso", "domani cosa ho", "leg curl 41 7", "password di Supabase", "chi vince stasera in campionato"])("«%s» no", (t) =>
    expect(isPeopleQuestion(t)).toBe(false),
  );
});
