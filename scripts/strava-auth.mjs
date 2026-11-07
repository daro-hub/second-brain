import dotenv from "dotenv";
import http from "node:http";

// le chiavi stanno in .env.local (vercel env pull), come per scripts/google-auth.mjs: .env nel repo non esiste
dotenv.config({ path: new URL("../.env.local", import.meta.url).pathname });

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
      const envPath = new URL("../.env.local", import.meta.url);
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
      const line = /^STRAVA_REFRESH_TOKEN=.*/m;
      if (line.test(envContent)) envContent = envContent.replace(line, `STRAVA_REFRESH_TOKEN=${tokens.refresh_token}`);
      else envContent += `${envContent && !envContent.endsWith("\n") ? "\n" : ""}STRAVA_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      fs.writeFileSync(envPath, envContent);
      // Strava rimanda nel redirect gli scope davvero concessi: se manca la spunta sulle attività, il token dà 401 sulle attività
      const granted = url.searchParams.get("scope") ?? "";
      if (!granted.includes("activity:read")) console.warn(`Attenzione: scope concessi «${granted}», senza activity:read_all le attività daranno 401. Rifai e lascia la spunta sulle attività.`);
      console.log(`Autorizzazione riuscita (scope: ${granted || "non indicati"}). Refresh token aggiornato in .env.local (non lo stampo); va copiato anche su Vercel.`);
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
