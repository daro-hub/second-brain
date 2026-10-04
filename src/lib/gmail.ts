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
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await res.json();
  const ids: string[] = (data.messages ?? []).map((m: { id: string }) => m.id);

  return Promise.all(ids.map((id) => getMessageDetails(id, token)));
}
