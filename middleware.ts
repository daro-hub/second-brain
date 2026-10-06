import { NextRequest, NextResponse } from "next/server";
import { isDashboardRequestAllowed } from "./src/lib/dashboardAuth";
import { isValidSession, SESSION_COOKIE } from "./src/lib/session";

// La dashboard mostra dati sensibili (alimentazione, battito, calendario, allenamenti): senza
// protezione chiunque conosca l'URL pubblico li legge. Con DASHBOARD_PIN (6 cifre) le pagine chiedono
// il PIN su /login e ricordano la sessione in un cookie; senza PIN resta la vecchia password HTTP
// Basic (DASHBOARD_PASSWORD); se non c'è nessuna delle due, il comportamento è quello di prima.
export async function middleware(req: NextRequest) {
  const pin = process.env.DASHBOARD_PIN;
  if (pin) {
    const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, pin);
    const { pathname, search } = req.nextUrl;
    if (pathname === "/login") {
      return authed ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
    }
    if (authed) return NextResponse.next();
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

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
  // hanno già i loro segreti e vengono chiamati da servizi che non possono fare login. Restano fuori anche manifest, service
  // worker e icone: il browser li scarica SENZA cookie (installazione sulla home, notifiche) e un redirect a /login li romperebbe.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg|apple-icon|opengraph-image).*)"],
};
