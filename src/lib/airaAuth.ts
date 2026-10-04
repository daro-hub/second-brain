import { isDashboardRequestAllowed } from "./dashboardAuth";

/**
 * Le API di Aira possono leggere password (Bitwarden), calendario ed email: a differenza delle
 * pagine, NON possono restare aperte se la password della dashboard non è configurata. In
 * produzione senza DASHBOARD_PASSWORD si rifiuta tutto (fail closed); in sviluppo locale si passa.
 */
export function airaGate(req: Request): Response | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "aira_disabled", message: "Imposta DASHBOARD_PASSWORD per abilitare Aira sul web." },
        { status: 503 },
      );
    }
    return null;
  }
  if (isDashboardRequestAllowed(req.headers.get("authorization"), password)) return null;
  return new Response("Autenticazione richiesta", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Second Brain", charset="UTF-8"' },
  });
}
