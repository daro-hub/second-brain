import { describe, expect, it } from "vitest";
import { formatJobs, formatWorkers, isOnline, parseJobCommand, queuedMessage, type AgentJob, type AgentWorker } from "../src/lib/agentCore";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const worker = (o: Partial<AgentWorker>): AgentWorker => ({ id: "pc-fisso", priority: 0, last_seen: new Date(NOW - 5_000).toISOString(), version: "0.1.0", current_job_id: null, ...o });
const job = (o: Partial<AgentJob>): AgentJob => ({
  id: "x", short_id: "abcd1234", created_at: new Date(NOW - 120_000).toISOString(), prompt: "guarda AMU-1", repo: null, mode: "read", status: "pending",
  worker_id: null, result: null, error: null, cost_usd: null, cancel_requested: false, ...o,
});

describe("parseJobCommand", () => {
  it("accetta un prompt senza repo", () => {
    expect(parseJobCommand("  guarda AMU-812 ")).toEqual({ ok: true, repo: null, prompt: "guarda AMU-812" });
  });
  it("riconosce il prefisso repo solo se consentito", () => {
    expect(parseJobCommand("amuse3-webapp: perché fallisce il login")).toEqual({ ok: true, repo: "amuse3-webapp", prompt: "perché fallisce il login" });
    // «priv:» non è nella lista: resta parte del testo, non diventa mai un repo
    expect(parseJobCommand("priv: leggi tutto")).toEqual({ ok: true, repo: null, prompt: "priv: leggi tutto" });
  });
  it("un due punti dentro la frase non è un repo", () => {
    expect(parseJobCommand("AMU-812: guarda questa issue")).toEqual({ ok: true, repo: null, prompt: "AMU-812: guarda questa issue" });
  });
  it("rifiuta vuoto, solo-repo e testi troppo lunghi", () => {
    expect(parseJobCommand("   ").ok).toBe(false);
    expect(parseJobCommand("second-brain:   ").ok).toBe(false);
    expect(parseJobCommand("x".repeat(4001)).ok).toBe(false);
  });
});

describe("worker online / messaggi", () => {
  it("online solo se visto negli ultimi 45 s", () => {
    expect(isOnline(worker({}), NOW)).toBe(true);
    expect(isOnline(worker({ last_seen: new Date(NOW - 60_000).toISOString() }), NOW)).toBe(false);
  });
  it("avvisa quando nessun worker è acceso", () => {
    const msg = queuedMessage("abcd1234", [worker({ last_seen: new Date(NOW - 3_600_000).toISOString() })], NOW);
    expect(msg).toContain("Nessun worker è acceso");
  });
  it("elenca i worker online in ordine di priorità", () => {
    const msg = queuedMessage("abcd1234", [worker({ id: "mac", priority: 1 }), worker({ id: "pc-fisso" })], NOW);
    expect(msg).toContain("pc-fisso, mac");
  });
  it("formatWorkers distingue online, occupato e offline", () => {
    const out = formatWorkers([worker({ id: "mac", priority: 1, last_seen: new Date(NOW - 600_000).toISOString() }), worker({ current_job_id: "j" })], NOW);
    expect(out).toContain("online, occupato");
    expect(out).toContain("offline (visto 10 min fa)");
  });
});

describe("formatJobs", () => {
  it("scappa l'HTML del prompt e mostra worker e stop richiesto", () => {
    const out = formatJobs([job({ status: "running", worker_id: "pc-fisso", prompt: "<script>x</script>", cancel_requested: true })], NOW);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("su pc-fisso");
    expect(out).toContain("stop richiesto");
  });
  it("lista vuota", () => {
    expect(formatJobs([], NOW)).toBe("Nessun job.");
  });
});

import { callbackData, formatProposal, parseCallback, parseFixCommand, PUSHABLE_REPOS, WRITE_REPOS, type ActionPayload } from "../src/lib/agentCore";

describe("parseFixCommand", () => {
  it("richiede il repo e lo accetta solo tra quelli scrivibili", () => {
    expect(parseFixCommand("second-brain: correggi il bug X")).toEqual({ ok: true, repo: "second-brain", prompt: "correggi il bug X" });
    expect(parseFixCommand("correggi il bug X").ok).toBe(false);
    expect(parseFixCommand("").ok).toBe(false);
  });
  it("amuseapp-xano è uno specchio in lettura: mai scrivibile", () => {
    expect(WRITE_REPOS).not.toContain("amuseapp-xano");
    expect(parseFixCommand("amuseapp-xano: cambia l'endpoint").ok).toBe(false);
  });
  it("solo second-brain è pushabile dal worker", () => {
    expect(PUSHABLE_REPOS).toEqual(["second-brain"]);
  });
});

describe("callback dei bottoni", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("round-trip e limite di 64 byte di Telegram", () => {
    for (const k of ["approve", "reject", "diff"] as const) {
      const data = callbackData(k, id);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseCallback(data)).toEqual({ kind: k, id });
    }
  });
  it("scarta dati malformati o con id non uuid", () => {
    for (const bad of ["", "ap:", "ap:123", "xx:" + id, `ap:${id}; drop table agent_actions`, `AP:${id}`]) expect(parseCallback(bad)).toBeNull();
  });
});

describe("formatProposal", () => {
  const p: ActionPayload = { repo: "second-brain", branch: "agent/abcd1234", base: "master", baseSha: "a", headSha: "b", worktree: "/w", commits: 2, stat: " a.ts | 2 +-", checks: "ok", pushable: true };
  it("dice cosa succede se approvi e lo stato dei controlli", () => {
    const t = formatProposal("abcd1234", p, "Ho corretto X");
    expect(t).toContain("pusha su master");
    expect(t).toContain("typecheck e test passati");
    expect(t).toContain("Ho corretto X");
  });
  it("avvisa se i controlli non passano o non sono stati eseguiti", () => {
    expect(formatProposal("x", { ...p, checks: "failed" }, "")).toContain("NON passano");
    expect(formatProposal("x", { ...p, checks: "not_run" }, "")).toContain("non eseguiti");
  });
  it("per i repo con gate e2e non promette il push", () => {
    const t = formatProposal("x", { ...p, repo: "amuse3-webapp", pushable: false }, "");
    expect(t).toContain("il push lo fai tu");
    expect(t).not.toContain("pusha su master");
  });
});
