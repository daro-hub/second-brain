import { describe, expect, it } from "vitest";
import { balanceIndex, combine, scoreRange, scoreTarget, trendOf } from "../src/lib/scoring";

describe("scoreTarget", () => {
  it("scala fino al 100 e non oltre", () => {
    expect(scoreTarget(10, 20)).toBe(50);
    expect(scoreTarget(40, 20)).toBe(100);
  });
  it("dato sconosciuto resta null, non 0", () => {
    expect(scoreTarget(null, 20)).toBeNull();
    expect(scoreTarget(Number.NaN, 20)).toBeNull();
    expect(scoreTarget(5, 0)).toBeNull();
  });
  it("zero reale è 0", () => expect(scoreTarget(0, 20)).toBe(0));
});

describe("scoreRange", () => {
  it("100 dentro la fascia, inclusi gli estremi", () => {
    expect(scoreRange(8000, 8000, 14000)).toBe(100);
    expect(scoreRange(14000, 8000, 14000)).toBe(100);
  });
  it("sotto la fascia scala in proporzione", () => expect(scoreRange(4000, 8000, 14000)).toBe(50));
  it("sopra la fascia penalizza (superare non è un merito)", () => {
    expect(scoreRange(15400, 8000, 14000)).toBe(80);
    expect(scoreRange(30000, 8000, 14000)).toBe(0);
  });
  it("input invalidi → null", () => {
    expect(scoreRange(null, 1, 2)).toBeNull();
    expect(scoreRange(5, 10, 2)).toBeNull();
  });
});

describe("combine", () => {
  it("media pesata", () => expect(combine([{ score: 100, weight: 1 }, { score: 0, weight: 3 }])).toBe(25));
  it("ignora le misure sconosciute e quelle senza peso", () => {
    expect(combine([{ score: 80, weight: 1 }, { score: null, weight: 5 }, { score: 0, weight: 0 }])).toBe(80);
  });
  it("tutte sconosciute → null", () => expect(combine([{ score: null, weight: 1 }])).toBeNull());
  it("un vero zero non viene ignorato", () => expect(combine([{ score: 0, weight: 1 }, { score: 100, weight: 1 }])).toBe(50));
});

describe("balanceIndex", () => {
  it("penalizza la dispersione", () => {
    expect(balanceIndex([70, 70, 70])).toBe(70);
    expect(balanceIndex([100, 40])!).toBeLessThan(70);
  });
  it("servono almeno due assi noti", () => {
    expect(balanceIndex([80, null, null])).toBeNull();
    expect(balanceIndex([80, null, 60])).not.toBeNull();
  });
});

describe("trendOf", () => {
  it("differenza o null", () => {
    expect(trendOf(70, 60)).toBe(10);
    expect(trendOf(null, 60)).toBeNull();
    expect(trendOf(70, undefined)).toBeNull();
  });
});
