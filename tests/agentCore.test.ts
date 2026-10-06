import { describe, expect, it } from "vitest";
import { formatJobs, formatWorkers, isOnline, parseJobCommand, queuedMessage, type AgentJob, type AgentWorker } from "../src/lib/agentCore";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const worker = (o: Partial<AgentWorker>): AgentWorker => ({ id: "pc-fisso", priority: 0, last_seen: new Date(NOW - 5_000).toISOString(), version: "0.1.0", current_job_id: null, ...o });
const job = (o: Partial<AgentJob>): AgentJob => ({
  id: "x", short_id: "abcd1234", created_at: new Date(NOW - 120_000).toISOString(), prompt: "guarda AMU-1", repo: null, status: "pending",
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
