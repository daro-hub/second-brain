import { isDashboardRequestAllowed } from "./dashboardAuth";
import { hasValidSessionCookie } from "./sessionNode";

/**
 * Le API di Aira possono leggere password (Bitwarden), calendario ed email: a differenza delle
 * pagine, NON possono restare aperte se la protezione della dashboard non è configurata. In
 * produzione senza DASHBOARD_PIN né DASHBOARD_PASSWORD si rifiuta tutto (fail closed); in sviluppo
 * locale si passa. Accetta la sessione da PIN (cookie) oppure la password HTTP Basic.
 */
export function airaGate(req: Request): Response | null {
  const pin = process.env.DASHBOARD_PIN;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!pin && !password) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "aira_disabled", message: "Imposta DASHBOARD_PIN per abilitare Aira sul web." },
        { status: 503 },
      );
    }
    return null;
  }
  if (pin && hasValidSessionCookie(req.headers.get("cookie"), pin)) return null;
  if (password && isDashboardRequestAllowed(req.headers.get("authorization"), password)) return null;
  return new Response("Autenticazione richiesta", {
    status: 401,
    headers: password && !pin ? { "WWW-Authenticate": 'Basic realm="Second Brain", charset="UTF-8"' } : {},
  });
}
