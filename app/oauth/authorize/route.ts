import { clearFailures, clientRedirects, isLockedOut, makeCode, mcpPassword, recordFailure } from "../../../src/lib/mcpOAuth";
import { constantTimeEqual } from "../../../src/lib/session";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(fields: Record<string, string>, message = "", status = 200) {
  const hidden = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  return new Response(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Second Brain · accesso</title>
<style>body{font:16px system-ui;background:#0b0b0e;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}form{width:min(320px,86vw);display:grid;gap:12px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #333;background:#16161b;color:#eee}button{background:#7c5cff;border:0;font-weight:600}p{margin:0;color:#f88}</style></head>
<body><form method="post" action="/oauth/authorize"><h1 style="margin:0;font-size:20px">Collega Claude al tuo Second Brain</h1>${message ? `<p>${esc(message)}</p>` : ""}${hidden}<input name="password" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN o password" required autofocus><button>Autorizza</button></form></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function validate(p: URLSearchParams): { error: string } | { clientId: string; redirectUri: string; challenge: string; state: string } {
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const challenge = p.get("code_challenge") ?? "";
  const allowed = clientRedirects(clientId);
  if (!allowed || !allowed.includes(redirectUri)) return { error: "client o redirect_uri non validi" };
  if (p.get("response_type") !== "code" || !challenge || p.get("code_challenge_method") !== "S256") return { error: "richiesta non valida (serve PKCE S256)" };
  return { clientId, redirectUri, challenge, state: p.get("state") ?? "" };
}

export async function GET(req: Request) {
  if (!mcpPassword() || !process.env.CRON_SECRET) return new Response("MCP non configurato", { status: 503 });
  const v = validate(new URL(req.url).searchParams);
  if ("error" in v) return new Response(v.error, { status: 400 });
  return page({ client_id: v.clientId, redirect_uri: v.redirectUri, code_challenge: v.challenge, state: v.state, response_type: "code", code_challenge_method: "S256" });
}

export async function POST(req: Request) {
  const pwd = mcpPassword();
  if (!pwd || !process.env.CRON_SECRET) return new Response("MCP non configurato", { status: 503 });
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [k, val] of form.entries()) if (typeof val === "string" && k !== "password") params.set(k, val);
  const v = validate(params);
  if ("error" in v) return new Response(v.error, { status: 400 });
  const fields = { client_id: v.clientId, redirect_uri: v.redirectUri, code_challenge: v.challenge, state: v.state, response_type: "code", code_challenge_method: "S256" };

  if (await isLockedOut()) return page(fields, "Troppi tentativi: riprova tra 15 minuti.", 429);
  if (!constantTimeEqual(String(form.get("password") ?? ""), pwd)) {
    await recordFailure();
    return page(fields, "Password errata.", 401);
  }
  await clearFailures();
  const url = new URL(v.redirectUri);
  url.searchParams.set("code", makeCode(v.clientId, v.redirectUri, v.challenge));
  if (v.state) url.searchParams.set("state", v.state);
  return Response.redirect(url.toString(), 303);
}
