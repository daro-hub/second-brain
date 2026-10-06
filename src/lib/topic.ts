import { reportError } from "./report";
import { supabase } from "./supabase";
import { topicIsFresh, type ActiveTopic } from "./topicFormat";

export { describeTopic, topicIsFresh, TOPIC_TTL_MIN, type ActiveTopic } from "./topicFormat";

/**
 * "Di cosa stavamo parlando": l'ultimo argomento trattato, ricordato per qualche minuto. Serve a capire i seguiti brevi
 * («Tutti», "dammi i pesi", «e ieri?») senza ripartire da zero. Un solo valore (app_settings): il bot ha un solo utente.
 */
const KEY = "bot_topic";

export async function getTopic(now = Date.now()): Promise<ActiveTopic | null> {
  try {
    const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
    if (!data) return null;
    const t = JSON.parse(String(data.value)) as ActiveTopic;
    return topicIsFresh(t, now) ? t : null;
  } catch (err) {
    reportError("topic/get", err, { expected: true });
    return null;
  }
}

export async function setTopic(t: ActiveTopic): Promise<void> {
  try {
    await supabase.from("app_settings").upsert({ key: KEY, value: JSON.stringify(t), updated_at: new Date().toISOString() });
  } catch (err) {
    reportError("topic/set", err, { expected: true });
  }
}

