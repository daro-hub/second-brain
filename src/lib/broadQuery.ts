import OpenAI from "openai";
import { getUpcomingEvents } from "./calendar";
import { getMetricSummary } from "./health";
import { reportError } from "./report";
import { SITE_TOPICS, SITE_TOPIC_LABELS, gatherSiteData, type SiteTopic } from "./siteData";
import { getStepsStats } from "./steps";
import { getAllActivities } from "./strava";
import { formatDue, listOpenReminders } from "./todoReminders";
import { addDays, todayKey } from "./time";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Fonti oltre agli argomenti del sito: dati grezzi delle integrazioni, letti solo quando la domanda li richiede. */
const EXTRA_SOURCES = {
  strava: "corse e attività Strava (ultime 12 settimane: volumi, passi, record)",
  calendario: "eventi del calendario dei prossimi 30 giorni",
  promemoria: "promemoria aperti",
  salute: "Apple Health ultimi 30 giorni: calorie, proteine, battito, peso, sonno",
  passi: "passi degli ultimi 30 giorni",
} as const;
type ExtraSource = keyof typeof EXTRA_SOURCES;
type BroadSource = SiteTopic | ExtraSource;

const ALL_SOURCES: Record<string, string> = {
  ...Object.fromEntries(SITE_TOPICS.map((t) => [t, SITE_TOPIC_LABELS[t]])),
  ...EXTRA_SOURCES,
};

/** Il modello sceglie quali fonti servono; vuoto = nessuna delle integrazioni c'entra. */
export async function planSources(text: string): Promise<BroadSource[]> {
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Scegli quali fonti dati personali di Daro servono per rispondere al suo messaggio. Rispondi SOLO con JSON {"sources": string[]} con al massimo 5 chiavi tra queste (solo quelle davvero utili, anche più di una se la domanda incrocia ambiti):\n${Object.entries(ALL_SOURCES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\nSe nessuna fonte c'entra (es. conto in banca, domotica, inviare messaggi) rispondi {"sources": []}.`,
      },
      { role: "user", content: text },
    ],
  });
  const parsed = JSON.parse(res.choices[0].message.content ?? "{}") as { sources?: unknown };
  const list = Array.isArray(parsed.sources) ? parsed.sources.map(String) : [];
  return [...new Set(list)].filter((k): k is BroadSource => k in ALL_SOURCES).slice(0, 5);
}

async function extra(source: ExtraSource): Promise<string> {
  const today = todayKey();
  switch (source) {
    case "strava": {
      const since = addDays(today, -84);
      const acts = (await getAllActivities()).filter((a) => a.dateKey >= since);
      if (!acts.length) return "Nessuna attività Strava nelle ultime 12 settimane.";
      return acts
        .map((a) => `${a.dateKey} ${a.type} «${a.name}»: ${a.distanceKm}km in ${a.movingTimeMin}min${a.elevationM ? `, +${Math.round(a.elevationM)}m` : ""}${a.type === "Run" && a.distanceKm > 0 ? `, passo ${(a.movingTimeMin / a.distanceKm).toFixed(2)} min/km` : ""}`)
        .join("\n");
    }
    case "calendario": {
      const events = await getUpcomingEvents(40, 30);
      return events.length ? events.map((e) => `${e.start} — ${e.summary}`).join("\n") : "Nessun evento nei prossimi 30 giorni.";
    }
    case "promemoria": {
      const open = await listOpenReminders();
      return open.length ? open.map((r) => `• ${r.text}${r.due_at ? ` — ${formatDue(r.due_at)}` : ""}`).join("\n") : "Nessun promemoria aperto.";
    }
    case "salute": {
      const start = addDays(today, -30);
      const metrics = ["dietary_energy", "protein", "active_energy", "resting_heart_rate", "weight_body_mass", "sleep_analysis"];
      const sums = await Promise.all(metrics.map((m) => getMetricSummary(m, start, today)));
      const lines = sums.filter((s) => s.pointCount > 0).map((s) => `${s.metricName}: ${s.pointCount} punti${s.sum !== null ? `, totale ${s.sum.toFixed(1)}` : ""}${s.avg !== null ? `, media ${s.avg.toFixed(1)}` : ""}${s.units ? ` ${s.units}` : ""}`);
      return lines.length ? lines.join("\n") : "Nessun dato Apple Health negli ultimi 30 giorni.";
    }
    case "passi": {
      const stats = await getStepsStats(addDays(today, -30), today);
      return stats.days.length ? `Totale ${stats.total}, media ${stats.average}/giorno.\n${stats.days.map((d) => `${d.date}: ${d.steps}`).join("\n")}` : "Nessun dato sui passi.";
    }
  }
}

/** Raccoglie le fonti scelte; una fonte che fallisce non blocca le altre. */
export async function gatherBroad(sources: BroadSource[]): Promise<string> {
  const siteTopics = sources.filter((s): s is SiteTopic => (SITE_TOPICS as readonly string[]).includes(s));
  const extras = sources.filter((s): s is ExtraSource => s in EXTRA_SOURCES);
  const parts: string[] = [];
  if (siteTopics.length) parts.push(await gatherSiteData(siteTopics, null));
  for (const s of extras) {
    try {
      parts.push(`## ${EXTRA_SOURCES[s]}\n${await extra(s)}`);
    } catch (err) {
      reportError(`broadQuery/${s}`, err, { expected: true });
      parts.push(`## ${EXTRA_SOURCES[s]}\nDato non disponibile in questo momento (errore di lettura).`);
    }
  }
  return parts.join("\n\n");
}
