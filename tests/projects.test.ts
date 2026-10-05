import { describe, expect, it } from "vitest";
import { formatProjectList, isGenericLinkWord, lastRepoInHistory, matchRepo, normName } from "../src/lib/projects";

const repos = [{ name: "second-brain" }, { name: "orbis" }, { name: "scolastica" }, { name: "longevity" }];

describe("matchRepo", () => {
  it("trova per nome anche con spazi, maiuscole o underscore", () => {
    expect(matchRepo(repos, "second brain")?.name).toBe("second-brain");
    expect(matchRepo(repos, "Second_Brain")?.name).toBe("second-brain");
    expect(matchRepo(repos, "Orbis")?.name).toBe("orbis");
  });
  it("corrispondenza parziale, ma mai su una stringa vuota", () => {
    expect(matchRepo(repos, "scolast")?.name).toBe("scolastica");
    expect(matchRepo(repos, "")).toBeNull();
    expect(matchRepo(repos, "vercel")).toBeNull();
  });
  it("normName ignora accenti e simboli", () => expect(normName("Più-Sù!")).toBe("piusu"));
});

describe("isGenericLinkWord — 'vercel' non è un repository", () => {
  it("riconosce le parole che indicano l'indirizzo online", () => {
    for (const w of ["vercel", "Vercel", "il sito", "online", "link del deploy", "url"]) expect(isGenericLinkWord(w)).toBe(true);
  });
  it("i nomi veri di progetti no", () => {
    for (const w of ["orbis", "second brain", "longevity"]) expect(isGenericLinkWord(w)).toBe(false);
  });
});

describe("lastRepoInHistory — il seguito 'vercel' si riferisce al progetto di prima", () => {
  it("il caso della chat: 'link del second brain' → 'vercel'", () => {
    const history = [
      { role: "user" as const, content: "mi dai il link del second brain?" },
      { role: "assistant" as const, content: "🐙 second-brain: https://github.com/daro-hub/second-brain" },
    ];
    expect(lastRepoInHistory(repos, history)?.name).toBe("second-brain");
  });
  it("prende il più recente e null se nessuno è stato nominato", () => {
    const history = [
      { role: "user" as const, content: "parlami di orbis" },
      { role: "user" as const, content: "e di longevity?" },
    ];
    expect(lastRepoInHistory(repos, history)?.name).toBe("longevity");
    expect(lastRepoInHistory(repos, [{ role: "user" as const, content: "ciao" }])).toBeNull();
  });
});

describe("formatProjectList", () => {
  it("mostra il sito online e il repository; senza sito solo il repository", () => {
    const out = formatProjectList([
      { name: "second-brain", url: "https://github.com/x/second-brain", homepage: "https://second-brain-rho-neon.vercel.app" },
      { name: "orbis", url: "https://github.com/x/orbis", liveUrl: null },
    ]);
    expect(out).toContain("🌐 https://second-brain-rho-neon.vercel.app");
    expect(out).toContain("📦 https://github.com/x/orbis");
    expect(out.match(/🌐/g)).toHaveLength(1);
  });
  it("elenco vuoto → messaggio chiaro", () => expect(formatProjectList([])).toContain("Non ho trovato"));
});
