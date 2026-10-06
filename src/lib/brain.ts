import { getDocumentPoints, getWebhookStatus, getWorkoutStats } from "./dashboard";
import { pca2d } from "./pca";
import { listDir } from "./university";
import { supabase } from "./supabase";

export interface BrainDoc {
  id: string;
  source: string;
  title: string;
  content: string;
  x: number;
  y: number;
}

export interface Integration {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface BrainSnapshot {
  docs: BrainDoc[];
  totalDocuments: number;
  totalLogs: number;
  sources: { source: string; count: number }[];
  webhook: { active: boolean; pending: number };
  integrations: Integration[];
}

/** Prova DAVVERO a raggiungere il repo degli appunti (il token può esistere ma non avere accesso). */
async function universityProbe(): Promise<{ ok: boolean; detail: string }> {
  try {
    await Promise.race([listDir(""), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
    return { ok: true, detail: "repository degli appunti raggiungibile, in lettura" };
  } catch (err) {
    const m = (err as Error).message;
    return { ok: false, detail: /not_found|40[134]/.test(m) ? "il token GitHub (UNI_GITHUB_TOKEN, altrimenti GITHUB_TOKEN) non vede daro-hub/university: serve Contents read+write su quel repo" : `non raggiungibile (${m.slice(0, 50)})` };
  }
}

const env = (...names: string[]) => names.every((n) => Boolean(process.env[n]));

async function lastHealthIngest(): Promise<string | null> {
  const { data } = await supabase.from("health_metrics").select("recorded_at").order("recorded_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.recorded_at as string | undefined) ?? null;
}

/** Tutto ciò che descrive "il cervello": base di conoscenza, bot e integrazioni, in un'unica fotografia. */
export async function getBrainSnapshot(): Promise<BrainSnapshot> {
  const [points, stats, webhook, lastHealth, uni] = await Promise.all([
    getDocumentPoints().catch(() => []),
    getWorkoutStats().catch(() => ({ totalLogs: 0, totalDocuments: 0 })),
    getWebhookStatus(),
    lastHealthIngest().catch(() => null),
    universityProbe(),
  ]);

  const coords = pca2d(points.map((d) => d.embedding));
  const docs: BrainDoc[] = points.map((d, i) => ({
    id: d.id,
    source: d.source,
    title: d.content.slice(0, 70),
    content: d.content.slice(0, 600),
    x: coords[i]?.[0] ?? 0,
    y: coords[i]?.[1] ?? 0,
  }));
  const counts = new Map<string, number>();
  for (const d of docs) counts.set(d.source, (counts.get(d.source) ?? 0) + 1);

  const healthAgeH = lastHealth ? (Date.now() - new Date(lastHealth).getTime()) / 3600_000 : null;
  const integrations: Integration[] = [
    { id: "telegram", label: "Telegram", ok: webhook.active, detail: webhook.active ? "webhook attivo" : "webhook non attivo" },
    { id: "openai", label: "OpenAI", ok: env("OPENAI_API_KEY"), detail: "classificazione, voce, notizie" },
    { id: "supabase", label: "Supabase", ok: env("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"), detail: "KB, allenamenti, salute" },
    { id: "health", label: "Apple Health", ok: healthAgeH !== null && healthAgeH < 48, detail: healthAgeH === null ? "nessun dato" : `ultimo dato ${healthAgeH < 1 ? "meno di un'ora" : `${Math.round(healthAgeH)} h`} fa` },
    { id: "calendar", label: "Google Calendar", ok: env("GOOGLE_CLIENT_ID", "GOOGLE_REFRESH_TOKEN"), detail: "agenda e Gmail" },
    { id: "strava", label: "Strava", ok: env("STRAVA_CLIENT_ID", "STRAVA_REFRESH_TOKEN"), detail: "corse e sessioni" },
    { id: "github", label: "GitHub", ok: env("GITHUB_TOKEN"), detail: "repository" },
    { id: "university", label: "Appunti (GitHub)", ok: uni.ok, detail: uni.detail },
    { id: "linear", label: "Linear", ok: env("LINEAR_API_KEY"), detail: "issue di lavoro" },
    { id: "bitwarden", label: "Bitwarden", ok: env("BW_CLIENTID", "BW_MASTER_PASSWORD"), detail: "password (mai via OpenAI)" },
  ];

  return {
    docs,
    totalDocuments: stats.totalDocuments,
    totalLogs: stats.totalLogs,
    sources: [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    webhook: { active: webhook.active, pending: (webhook as { pendingUpdateCount?: number }).pendingUpdateCount ?? 0 },
    integrations,
  };
}
