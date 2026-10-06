import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { messages: { role: string; content: unknown }[] }[] = [];
let answer = "Un piatto di pasta al pomodoro, circa 200 g.";

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (req: { messages: { role: string; content: unknown }[] }) => {
          calls.push(req);
          return { choices: [{ message: { content: answer } }] };
        },
      },
    };
  },
}));

import { describePhoto, photoToMessage } from "../src/lib/vision";

beforeEach(() => {
  calls.length = 0;
  answer = "Un piatto di pasta al pomodoro, circa 200 g.";
});

describe("foto → testo", () => {
  it("manda al modello l'immagine come data URL insieme alla didascalia", async () => {
    const out = await describePhoto(Buffer.from("fakejpeg"), "image/jpeg", "pranzo");
    expect(out).toBe(answer);
    const user = calls[0].messages.find((m) => m.role === "user")!.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(user[0].text).toContain("pranzo");
    expect(user[1].image_url!.url).toBe(`data:image/jpeg;base64,${Buffer.from("fakejpeg").toString("base64")}`);
  });

  it("senza didascalia lo dice al modello", async () => {
    await describePhoto(Buffer.from("x"), "image/png");
    const user = calls[0].messages.find((m) => m.role === "user")!.content as { text?: string }[];
    expect(user[0].text).toBe("Nessuna didascalia.");
  });

  it("una risposta vuota è un errore (il bot avvisa invece di inventare)", async () => {
    answer = "   ";
    await expect(describePhoto(Buffer.from("x"), "image/jpeg")).rejects.toThrow("empty_description");
  });

  it("tronca descrizioni enormi", async () => {
    answer = "a".repeat(5000);
    expect((await describePhoto(Buffer.from("x"), "image/jpeg")).length).toBe(1500);
  });

  it("il messaggio per il router unisce didascalia e descrizione", () => {
    expect(photoToMessage("pasta, 200 g", "ho mangiato")).toBe("ho mangiato\n\n[Foto allegata: pasta, 200 g]");
    expect(photoToMessage("pasta, 200 g")).toBe("[Foto allegata: pasta, 200 g]");
    expect(photoToMessage("pasta", "   ")).toBe("[Foto allegata: pasta]");
  });
});
