import { describe, expect, it } from "vitest";
import { config } from "../middleware";

// Il matcher di Next è una regex con lookahead: qui lo si applica com'è ai percorsi reali.
const protectedPath = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("cosa protegge il PIN", () => {
  it("protegge le pagine", () => {
    for (const p of ["/", "/login", "/uni", "/salute", "/palestra"]) expect(protectedPath(p), p).toBe(true);
  });

  it("lascia fuori ciò che il browser scarica senza cookie (installazione, notifiche, icone)", () => {
    for (const p of ["/manifest.webmanifest", "/sw.js", "/apple-icon", "/icon.svg", "/opengraph-image", "/favicon.ico", "/_next/static/x.js"]) {
      expect(protectedPath(p), p).toBe(false);
    }
  });

  it("le API restano fuori (hanno i loro segreti)", () => {
    for (const p of ["/api/push/subscribe", "/api/widget", "/api/telegram"]) expect(protectedPath(p), p).toBe(false);
  });
});
