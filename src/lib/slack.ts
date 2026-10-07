import { reportError } from "./report";

/**
 * Client Slack in SOLA LETTURA (user token `xoxp-…`, scopes solo *:history, *:read, search:read, users:read).
 * Non scrive mai su Slack: nessun metodo POST che crei o modifichi messaggi. Il testo dei messaggi è scritto da
 * terzi: chi lo passa a un modello deve trattarlo come dato, mai come istruzione.
 */

const SLACK_API = "https://slack.com/api";

export const slackConfigured = (): boolean => Boolean(process.env.SLACK_USER_TOKEN);

export interface SlackMessage {
  /** timestamp Slack (es. "1759832000.000200") */
  ts: string;
  /** ISO, comodo per ordinare e mostrare */
  at: string;
  channel: string;
  /** true per DM e gruppi privati di più persone */
  direct: boolean;
  author: string;
  text: string;
  permalink: string;
}

/** Errori Slack che dipendono dall'ambiente (token non messo, rete, limite): warning, non bug. */
const EXPECTED_ERRORS = new Set(["ratelimited", "missing_scope", "not_allowed_token_type", "account_inactive"]);

export class SlackError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? `Slack: ${code}`);
  }
}

async function call<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) throw new SlackError("not_configured", "SLACK_USER_TOKEN non impostato");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${SLACK_API}/${method}?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 429) throw new SlackError("ratelimited", `Slack: limite di richieste (riprova tra ${res.headers.get("retry-after") ?? "?"} s)`);
  if (!res.ok) throw new SlackError(`http_${res.status}`);
  const json = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!json.ok) throw new SlackError(json.error ?? "unknown_error");
  return json;
}

/** Puro: <@U123> / <#C1|nome> / <https://x|etichetta> / entità HTML → testo leggibile. */
export function cleanSlackText(raw: string, names: Record<string, string> = {}): string {
  return raw
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, label?: string) => `@${label ?? names[id] ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}

interface RawMatch {
  ts: string;
  text?: string;
  username?: string;
  user?: string;
  permalink?: string;
  channel?: { id: string; name?: string; is_im?: boolean; is_mpim?: boolean; is_private?: boolean };
}

export function toMessage(m: RawMatch): SlackMessage {
  const direct = Boolean(m.channel?.is_im || m.channel?.is_mpim);
  return {
    ts: m.ts,
    at: new Date(Number(m.ts) * 1000).toISOString(),
    channel: direct ? (m.channel?.is_im ? "DM" : "gruppo") : `#${m.channel?.name ?? m.channel?.id ?? "?"}`,
    direct,
    author: m.username || m.user || "?",
    text: cleanSlackText(m.text ?? ""),
    permalink: m.permalink ?? "",
  };
}

/** Cerca nei messaggi che il tuo account può vedere. Ordinati dal più recente. */
export async function searchMessages(query: string, count = 10): Promise<SlackMessage[]> {
  const data = await call<{ messages: { matches: RawMatch[] } }>("search.messages", { query, count: Math.min(Math.max(count, 1), 50), sort: "timestamp", sort_dir: "desc" });
  return (data.messages?.matches ?? []).map(toMessage);
}

export interface SlackThread {
  channel: string;
  messages: { at: string; author: string; text: string }[];
}

/** Thread intero di un messaggio (per capire il contesto di un risultato di ricerca). */
export async function getThread(channelId: string, ts: string, limit = 30): Promise<SlackThread["messages"]> {
  const data = await call<{ messages: { ts: string; user?: string; username?: string; text?: string }[] }>("conversations.replies", { channel: channelId, ts, limit });
  return (data.messages ?? []).map((m) => ({ at: new Date(Number(m.ts) * 1000).toISOString(), author: m.username || m.user || "?", text: cleanSlackText(m.text ?? "") }));
}

export interface SlackActivity {
  /** messaggi che ti nominano o ti sono indirizzati */
  mentions: SlackMessage[];
  /** DM e gruppi privati recenti */
  directs: SlackMessage[];
  /** quello che hai scritto tu: impegni presi ("ti mando X domani") */
  mine: SlackMessage[];
}

/** Puro: toglie i doppioni (uno stesso messaggio può uscire da più ricerche) e ordina dal più recente. */
export function dedupeMessages(list: SlackMessage[]): SlackMessage[] {
  const seen = new Set<string>();
  const out: SlackMessage[] = [];
  for (const m of list) {
    const key = `${m.channel}|${m.ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out.sort((a, b) => b.ts.localeCompare(a.ts));
}

/** Attività recente (da `afterDay` incluso, chiave "YYYY-MM-DD") per il brief di domani. Un fallimento di una ricerca non butta le altre. */
export async function getRecentActivity(afterDay: string): Promise<SlackActivity> {
  const me = await call<{ user_id: string }>("auth.test", {});
  const after = `after:${afterDay}`;
  const settle = async (q: string, count: number) => {
    try {
      return await searchMessages(q, count);
    } catch (err) {
      reportError("slack/activity", err, { expected: err instanceof SlackError && EXPECTED_ERRORS.has(err.code) });
      return [] as SlackMessage[];
    }
  };
  const [mentions, directs, mine] = await Promise.all([settle(`<@${me.user_id}> ${after}`, 30), settle(`is:dm ${after}`, 30), settle(`from:<@${me.user_id}> ${after}`, 30)]);
  return { mentions: dedupeMessages(mentions), directs: dedupeMessages(directs), mine: dedupeMessages(mine) };
}
