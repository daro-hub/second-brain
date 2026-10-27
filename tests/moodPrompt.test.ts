import { describe, expect, it } from "vitest";
import { MOOD_ASPECTS, moodPrompt } from "../src/lib/mood";

describe("moodPrompt — la legenda non contraddice la domanda", () => {
  it("stress: 5 = tantissimo, mai 'benissimo'", () => {
    const p = moodPrompt(MOOD_ASPECTS.findIndex((a) => a.key === "stress"));
    expect(p).toContain("5 = tantissimo");
    expect(p).not.toContain("benissimo");
  });
  it("gli altri aspetti restano 1 = male · 5 = benissimo", () => {
    expect(moodPrompt(0)).toContain("1 = male · 5 = benissimo");
  });
});
