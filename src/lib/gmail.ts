import { getGoogleAccessToken } from "./googleAuth";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

export interface EmailResult {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  urls: string[];
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function findTextPart(part: GmailPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findTextPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return [...new Set(matches)];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function getMessageDetails(id: string, token: string): Promise<EmailResult> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await res.json();

  const headers: GmailHeader[] = data.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const textPlain = findTextPart(data.payload, "text/plain");
  const textHtml = findTextPart(data.payload, "text/html");
  const body = textPlain ?? (textHtml ? stripHtml(textHtml) : "");

  return {
    id,
    from: getHeader("From"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    snippet: data.snippet ?? "",
    urls: extractUrls(body),
  };
}

export async function searchEmails(query: string, maxResults = 5): Promise<EmailResult[]> {
  const token = await getGoogleAccessToken();
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`);
  const data = await res.json();
  const ids: string[] = (data.messages ?? []).map((m: { id: string }) => m.id);

  return Promise.all(ids.map((id) => getMessageDetails(id, token)));
}

/** RFC 2047 per l'oggetto con accenti/emoji. */
const encodeHeader = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`);

/**
 * Crea una BOZZA (mai un invio): Daro la rivede e la spedisce da Gmail. Richiede lo scope gmail.compose:
 * se manca, Google risponde 403 e va rilanciato `scripts/google-auth.mjs`.
 */
export async function createEmailDraft(input: { to: string; subject: string; body: string }): Promise<{ id: string }> {
  if (/[\r\n]/.test(input.to) || /[\r\n]/.test(input.subject)) throw new Error("Destinatario o oggetto non validi");
  const token = await getGoogleAccessToken();
  const mime = [`To: ${input.to}`, `Subject: ${encodeHeader(input.subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(input.body, "utf-8").toString("base64")].join("\r\n");
  const raw = Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (res.status === 403) throw new Error("Gmail ha rifiutato la bozza: manca lo scope gmail.compose, rilancia scripts/google-auth.mjs");
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  return { id: String((await res.json()).id) };
}
