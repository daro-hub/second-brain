/** Parte PURA dell'argomento attivo (nessun database): tipi, scadenza e testo da dare al modello. */
export interface ActiveTopic {
  intent: string;
  /** il messaggio che ha aperto l'argomento (mai per le password) */
  text: string;
  /** ms epoch */
  at: number;
}

export const TOPIC_TTL_MIN = 20;

export const topicIsFresh = (t: ActiveTopic | null | undefined, now = Date.now()): t is ActiveTopic =>
  Boolean(t && Number.isFinite(t.at) && now - t.at >= 0 && now - t.at < TOPIC_TTL_MIN * 60_000);

/** Riga da dare al modello: l'argomento attivo e da quanto. */
export function describeTopic(t: ActiveTopic | null | undefined, now = Date.now()): string {
  if (!topicIsFresh(t, now)) return "";
  const min = Math.max(0, Math.round((now - t.at) / 60_000));
  return `Argomento attivo: «${t.intent}» (aperto ${min === 0 ? "adesso" : `${min} min fa`} da: «${t.text.slice(0, 120)}»).`;
}
