import { isOnline, type AgentWorker } from "../lib/agentCore";

/** Quanto un job deve aspettare in coda prima che anche un worker non preferito possa prenderlo. */
export const YIELD_GRACE_MS = 20_000;

/**
 * Il worker `me` deve lasciare il job a un altro? Sì se esiste un worker più preferito (priorità più bassa), online e
 * libero, e il job è in coda da poco: gli si dà il tempo di accorgersene. Un worker preferito occupato o offline non
 * conta: altrimenti il job resterebbe fermo. La presa vera è atomica nel database (claim_agent_job), questa è solo
 * cortesia tra macchine, quindi un errore qui non può mai far partire un job due volte.
 */
export function shouldYield(me: Pick<AgentWorker, "id" | "priority">, workers: AgentWorker[], oldestPendingAgeMs: number, now: number): boolean {
  if (oldestPendingAgeMs >= YIELD_GRACE_MS) return false;
  return workers.some((w) => w.id !== me.id && w.priority < me.priority && isOnline(w, now) && !w.current_job_id);
}
