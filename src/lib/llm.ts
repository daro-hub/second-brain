/**
 * Modelli e ragionamento del bot, in un posto solo.
 *
 * gpt-6-luna ragiona a "medium" se non si dice nulla. Per il classificatore e le risposte del bot il ragionamento si spegne:
 * misurato il 05/11/2026 sull'eval del router, stessa precisione (60/63 contro 59/63) con latenza media −22% e p90 da 3,6 a 2,2 s.
 * I tipi dell'SDK installata non conoscono ancora "none", da qui il cast.
 */
export const NO_REASONING = { reasoning_effort: "none" } as object;

/** Classificatore, risposte dai dati e chat libera. */
export const BOT_MODEL = "gpt-6-luna";

/**
 * Agente a strumenti (domande su più fonti o su periodi che gli intent fissi non coprono): un modello più capace.
 * Sulle domande sbagliate dello stress test del 05/11/2026 gpt-6.1-terra ne ha risolte 4 su 6, Luna 3 su 6.
 * Supporta reasoning "none", l'unico ammesso con gli strumenti su chat.completions. TOOL_AGENT_MODEL per cambiarlo.
 */
export const toolAgentModel = (): string => process.env.TOOL_AGENT_MODEL || "gpt-6.1-terra";
