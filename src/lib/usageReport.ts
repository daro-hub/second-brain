import type { OpenAiUsageSummary } from "./openaiUsage";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString("it-IT");

/** Servizi di cui il bot non legge i consumi (solo OpenAI, che è ciò che paga il second brain). */
const OTHER_SERVICE = /vercel|supabase|anthropic|github|telegram|google/i;

/**
 * Risposta alla domanda "quanti crediti ho consumato?". Costruita nel codice dai numeri reali: il modello non deve
 * né indovinarli né chiedere "di quale servizio?" — per il second brain i crediti sono quelli OpenAI.
 * Il residuo è una STIMA (totale caricato − spesa degli ultimi 30 giorni) e lo si dice.
 */
export function formatUsageReport(u: OpenAiUsageSummary, service: string | null = null): string {
  if (service && OTHER_SERVICE.test(service)) {
    return `Dei consumi di ${service} non ho accesso. Posso dirti quelli di OpenAI, che è ciò che paga il second brain: chiedimi "quanti crediti ho consumato?".`;
  }
  if (!u.configured) {
    return "Non riesco a leggere i consumi OpenAI: manca la chiave amministrativa (OPENAI_ADMIN_API_KEY) sul server.";
  }
  const lines = [
    "💳 Crediti OpenAI — second brain",
    "",
    `• Consumati negli ultimi 30 giorni: ${usd(u.totalCostUsd30d)}`,
    `• Oggi: ${usd(u.totalCostUsdToday)} · ultimi 7 giorni: ${usd(u.totalCostUsd7d)}`,
  ];
  if (u.creditTotalUsd !== null && u.creditRemainingUsd !== null) {
    lines.push(`• Caricati: ${usd(u.creditTotalUsd)} → residui (stima): ${usd(u.creditRemainingUsd)}`);
  } else {
    lines.push("• Residuo: non lo so, non mi hai detto quanto hai caricato (si imposta dalla pagina Costi AI).");
  }
  lines.push(`• Token negli ultimi 30 giorni: ${int(u.totalTokens30d)}`);
  const top = u.byModel.slice(0, 3);
  if (top.length) lines.push(`• Modelli più usati: ${top.map((m) => `${m.model} (${int(m.requests)} richieste)`).join(", ")}`);
  if (u.creditTotalUsd !== null) lines.push("", "Il residuo è una stima: totale caricato meno la spesa degli ultimi 30 giorni.");
  return lines.join("\n");
}
