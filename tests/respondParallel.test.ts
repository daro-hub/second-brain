import { beforeEach, describe, expect, it, vi } from "vitest";

/** Le letture iniziali di handleMessageTraced partono in parallelo: se la ricerca della routine fallisce, il messaggio prosegue. */
vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("../src/lib/bitwarden", () => ({ getPassword: async () => "segreto" }));

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: [0, 0, 0] }] }) };
    chat = {
      completions: {
        create: async (req: { response_format?: unknown }) => ({
          choices: [{ message: { content: req.response_format ? JSON.stringify({ intent: "none", save: false }) : "risposta conversazionale" } }],
        }),
      },
    };
  },
}));

vi.mock("../src/lib/workouts", async (orig) => ({
  ...(await orig<typeof import("../src/lib/workouts")>()),
  findMatchingRoutine: async () => {
    throw new Error("db giù");
  },
}));

import { handleMessageTraced } from "../src/lib/respond";
import { resetDb } from "./helpers/memdb";

beforeEach(() => resetDb());

describe("letture iniziali in parallelo", () => {
  it("un errore di findMatchingRoutine non fa fallire il messaggio", async () => {
    await expect(handleMessageTraced("come stai oggi")).resolves.toContain("risposta conversazionale");
  });
});
