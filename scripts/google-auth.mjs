import "dotenv/config";
import http from "node:http";

const PORT = 3051;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
// Con --work si autorizza l'account di lavoro (francesco.darin@amuseapp.it): solo lettura del calendario,
// il refresh token finisce in GOOGLE_REFRESH_TOKEN_WORK. Senza flag resta l'account personale di sempre.
const WORK = process.argv.includes("--work");
const TOKEN_VAR = WORK ? "GOOGLE_REFRESH_TOKEN_WORK" : "GOOGLE_REFRESH_TOKEN";
const SCOPE = WORK
  ? "https://www.googleapis.com/auth/calendar.readonly"
  : "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly";

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
if (WORK) authUrl.searchParams.set("login_hint", "francesco.darin@amuseapp.it");

console.log("\nApri questo link, accedi e dai il consenso:\n");
console.log(authUrl.toString());
console.log("\nIn attesa del redirect su", REDIRECT_URI, "...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Codice mancante.");
    return;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokens = await tokenRes.json();

  if (tokens.refresh_token) {
    console.log("\nAutorizzazione riuscita. Refresh token ottenuto (non lo stampo per sicurezza).");
    console.log("Lo salvo direttamente in .env...");
    const fs = await import("node:fs");
    const envPath = new URL("../.env", import.meta.url);
    let envContent = fs.readFileSync(envPath, "utf-8");
    const line = new RegExp(`^${TOKEN_VAR}=.*`, "m");
    if (line.test(envContent)) {
      envContent = envContent.replace(line, `${TOKEN_VAR}=${tokens.refresh_token}`);
    } else {
      envContent += `${envContent.endsWith("\n") ? "" : "\n"}${TOKEN_VAR}=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log("Salvato in .env. Puoi chiudere questo script (Ctrl+C) e tornare alla chat.");
    res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Fatto, puoi chiudere questa finestra.</h1>");
  } else {
    console.error("Nessun refresh_token nella risposta:", tokens);
    res.writeHead(500).end("Errore, controlla il terminale.");
  }

  setTimeout(() => process.exit(0), 500);
});

server.listen(PORT);
