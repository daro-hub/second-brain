import "dotenv/config";
import http from "node:http";

const PORT = 3052;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const authUrl = new URL("https://www.strava.com/oauth/authorize");
authUrl.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("approval_prompt", "force");
authUrl.searchParams.set("scope", "activity:read_all");

console.log("\nApri questo link, accedi e dai il consenso:\n");
console.log(authUrl.toString());
console.log("\nIn attesa del redirect su", REDIRECT_URI, "...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Codice mancante.");
    setTimeout(() => process.exit(1), 300);
    return;
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();

    if (tokens.refresh_token) {
      const fs = await import("node:fs");
      const envPath = new URL("../.env", import.meta.url);
      let envContent = fs.readFileSync(envPath, "utf-8");
      envContent = envContent.replace(/STRAVA_REFRESH_TOKEN=.*/, `STRAVA_REFRESH_TOKEN=${tokens.refresh_token}`);
      fs.writeFileSync(envPath, envContent);
      console.log("Autorizzazione riuscita con scope activity:read_all. Refresh token aggiornato in .env.");
      res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Fatto, puoi chiudere questa finestra.</h1>");
    } else {
      console.error("Nessun refresh_token nella risposta:", tokens);
      res.writeHead(500).end("Errore, controlla il terminale.");
    }
  } catch (e) {
    console.error("Errore scambio token:", e.message);
    res.writeHead(500).end("Errore, controlla il terminale.");
  }

  setTimeout(() => process.exit(0), 500);
});

server.listen(PORT);
