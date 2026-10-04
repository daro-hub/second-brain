import { NextRequest, NextResponse } from "next/server";
import { isDashboardRequestAllowed } from "./src/lib/dashboardAuth";

// La dashboard mostra dati sensibili (alimentazione, battito, calendario, allenamenti): senza
// protezione chiunque conosca l'URL pubblico li legge. La password si attiva impostando
// DASHBOARD_PASSWORD; finché non c'è, il comportamento resta quello di prima (nessuna protezione).
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  if (isDashboardRequestAllowed(req.headers.get("authorization"), password)) return NextResponse.next();

  return new NextResponse("Autenticazione richiesta", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Second Brain", charset="UTF-8"' },
  });
}

export const config = {
  // Le API restano fuori: il webhook Telegram, i cron e la sincronizzazione Apple Health/passi
  // hanno già i loro segreti e vengono chiamati da servizi che non possono fare login.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
