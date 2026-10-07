import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/airaAuth", () => ({ airaGate: (req: Request) => (req.headers.get("x-deny") ? new Response("no", { status: 401 }) : null) }));

import { POST } from "../app/api/aira/realtime/route";
import { ASK_TOOL_NAME, MAX_SESSION_MS, buildSessionConfig, realtimeModel } from "../src/lib/realtimeSession";

const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";
const post = (body: string, headers: Record<string, string> = {}) => POST(new Request("http://x/api/aira/realtime", { method: "POST", body, headers: { "Content-Type": "application/sdp", ...headers } }));

describe("configurazione della sessione live", () => {
  afterEach(() => delete process.env.REALTIME_MODEL);

  it("voce italiana, trascrizione, interruzione a voce e un solo tool verso la pipeline di Aira", () => {
    const c = buildSessionConfig();
    expect(c.type).toBe("realtime");
    expect(c.audio.output.voice).toBe("marin");
    expect(c.audio.input.transcription.language).toBe("it");
    expect(c.audio.input.turn_detection).toMatchObject({ create_response: true, interrupt_response: true });
    expect(c.tools.map((t) => t.name)).toEqual([ASK_TOOL_NAME]);
    expect(c.tools[0].parameters.required).toEqual(["request"]);
    expect(c.instructions).toContain(ASK_TOOL_NAME);
    expect(MAX_SESSION_MS).toBe(10 * 60_000);
  });

  it("il modello si cambia da REALTIME_MODEL senza toccare il codice", () => {
    expect(realtimeModel()).toBe("gpt-realtime-2.1");
    process.env.REALTIME_MODEL = "gpt-realtime-2.1-mini";
    expect(buildSessionConfig().model).toBe("gpt-realtime-2.1-mini");
  });
});

describe("POST /api/aira/realtime", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rifiuta senza autenticazione e non chiama OpenAI", async () => {
    expect((await post(OFFER, { "x-deny": "1" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("senza chiave OpenAI risponde 503", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await post(OFFER)).status).toBe(503);
  });

  it("rifiuta un'offerta che non è SDP", async () => {
    expect((await post("ciao")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("inoltra l'offerta con la configurazione e restituisce la risposta SDP, la chiave non esce dal server", async () => {
    fetchMock.mockResolvedValue(new Response("v=0 answer", { status: 201 }));
    const res = await post(OFFER);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/sdp");
    expect(await res.text()).toBe("v=0 answer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const fd = init.body as FormData;
    expect(fd.get("sdp")).toBe(OFFER);
    expect(JSON.parse(String(fd.get("session"))).tools[0].name).toBe(ASK_TOOL_NAME);
  });

  it("se OpenAI fallisce risponde 502 senza esporre il dettaglio al browser", async () => {
    fetchMock.mockResolvedValue(new Response("sk-secret problema", { status: 500 }));
    const res = await post(OFFER);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("sk-secret");
  });
});
