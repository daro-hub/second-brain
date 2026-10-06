import { describe, expect, it } from "vitest";
import type { AgentWorker } from "../src/lib/agentCore";
import { shouldYield, YIELD_GRACE_MS } from "../src/worker/priority";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const w = (o: Partial<AgentWorker>): AgentWorker => ({ id: "pc-fisso", priority: 0, last_seen: new Date(NOW - 3_000).toISOString(), version: null, current_job_id: null, ...o });
const mac = { id: "mac", priority: 1 };
const pc = { id: "pc-fisso", priority: 0 };

describe("shouldYield", () => {
  it("il Mac cede se il PC fisso è online e libero e il job è fresco", () => {
    expect(shouldYield(mac, [w({}), w({ id: "mac", priority: 1 })], 2_000, NOW)).toBe(true);
  });
  it("il Mac prende il job se il PC fisso è offline", () => {
    expect(shouldYield(mac, [w({ last_seen: new Date(NOW - 10 * 60_000).toISOString() })], 2_000, NOW)).toBe(false);
  });
  it("il Mac prende il job se il PC fisso è occupato", () => {
    expect(shouldYield(mac, [w({ current_job_id: "job-1" })], 2_000, NOW)).toBe(false);
  });
  it("dopo il periodo di grazia anche il Mac lo prende (il PC potrebbe essere bloccato)", () => {
    expect(shouldYield(mac, [w({})], YIELD_GRACE_MS, NOW)).toBe(false);
  });
  it("il PC fisso non cede mai al Mac", () => {
    expect(shouldYield(pc, [w({ id: "mac", priority: 1 })], 0, NOW)).toBe(false);
  });
  it("non cede a se stesso", () => {
    expect(shouldYield(mac, [w({ id: "mac", priority: 1 })], 0, NOW)).toBe(false);
  });
});
