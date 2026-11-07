import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/workDigest", () => ({ tryApplyHoursReply: vi.fn() }));
vi.mock("../src/lib/respond", () => ({ handleMessageTraced: vi.fn() }));
vi.mock("../src/lib/chatHistory", () => ({ addTurns: vi.fn(async () => {}) }));
vi.mock("../src/lib/airaAuth", () => ({ airaGate: () => null }));
vi.mock("../src/lib/modules", () => ({ moduleGate: () => null, isEnabled: () => true }));

import { POST } from "../app/api/aira/chat/route";
import { tryApplyHoursReply } from "../src/lib/workDigest";
import { handleMessageTraced } from "../src/lib/respond";
import { addTurns } from "../src/lib/chatHistory";

async function chiama(text: string) {
  const res = await POST(new Request("http://x/api/aira/chat", { method: "POST", body: JSON.stringify({ text }) }));
  const righe = (await res.text()).split("\n").filter(Boolean);
  return righe.map((r) => JSON.parse(r) as Record<string, unknown>);
}

beforeEach(() => vi.clearAllMocks());

describe("chat del sito: risposta con le ore", () => {
  it("corregge la voce in attesa senza passare da handleMessageTraced", async () => {
    const msg = "⏱ Corretto: ora sono 3 h per il 2026-11-04.";
    vi.mocked(tryApplyHoursReply).mockResolvedValue(msg);
    const eventi = await chiama("anzi 3");
    expect(handleMessageTraced).not.toHaveBeenCalled();
    expect(addTurns).toHaveBeenCalledWith("web", [
      { role: "user", content: "anzi 3" },
      { role: "assistant", content: msg },
    ]);
    expect(eventi.find((e) => e.t === "reply")?.html).toBe(msg);
  });

  it("senza ore in attesa il flusso resta quello di prima", async () => {
    vi.mocked(tryApplyHoursReply).mockResolvedValue(null);
    vi.mocked(handleMessageTraced).mockResolvedValue("ciao");
    const eventi = await chiama("anzi 3");
    expect(handleMessageTraced).toHaveBeenCalledWith("anzi 3", expect.any(Object), "web");
    expect(eventi.find((e) => e.t === "reply")?.html).toBe("ciao");
  });
});
