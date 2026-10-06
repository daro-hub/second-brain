import { isGroupAnnouncement, wantsGymPlan } from "./gym";

/**
 * Scorciatoie PURE del router: riconoscono nel codice i messaggi inequivocabili, senza passare dal modello (zero
 * costo, zero ambiguità). Tenute in un posto solo e coperte da test su tutte le frasi note, perché una scorciatoia
 * troppo larga "ruba" messaggi che non le appartengono.
 */
export type QuickRoute = "shopping_query" | "gym_keyword" | "group_announcement" | "gym_plan";

/** Prima di tutto il resto: parole d'ordine esatte. */
export function earlyRoute(text: string): QuickRoute | null {
  const t = text.trim().toLowerCase();
  if (t === "spesa") return "shopping_query";
  if (t === "gym") return "gym_keyword";
  return null;
}

/** Dopo il riconoscimento del nome di una routine: solo gruppi muscolari, oppure «cosa devo allenare / dammi la scheda». */
export function lateRoute(text: string): QuickRoute | null {
  if (isGroupAnnouncement(text)) return "group_announcement";
  if (wantsGymPlan(text)) return "gym_plan";
  return null;
}

export const quickRoute = (text: string): QuickRoute | null => earlyRoute(text) ?? lateRoute(text);

/**
 * «Chi è Checco?», «che persone conosco?», «chi sono i miei amici?»: domande su persone e fatti raccontati ad Aira.
 * La risposta sta nella knowledge base, non in una fonte live: se il modello le scambia per «richiesta non supportata»
 * (come è successo) il codice le rimette sulla strada giusta invece di rispondere «non riesco a leggerlo».
 */
export function isPeopleQuestion(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[?!.]+$/, "");
  return (
    /^chi (è|e'|sono|era|erano)(\s|$)/.test(t) ||
    /(^|\s)(che|quali|quante|quanti) (persone|amici|amiche|conoscenti|ragazze|ragazzi)(\s|$)/.test(t) ||
    /(^|\s)(miei|mie) (amici|amiche|conoscenti|contatti)(\s|$)/.test(t) ||
    /^(cosa|che cosa) (sai|ricordi) (di|su|dei|delle)(\s|$)/.test(t) ||
    /^(ti ricordi|ricordi) (di|chi)(\s|$)/.test(t)
  );
}
