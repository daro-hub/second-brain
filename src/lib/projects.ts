import type { Turn } from "./chatHistory";

/** Logica pura sui progetti GitHub: trovare quello giusto dal nome, dalla conversazione, e formattare l'elenco. */

export interface ProjectRef {
  name: string;
  url: string;
  homepage?: string | null;
  description?: string | null;
}

/** "Second Brain", "second_brain" e "second-brain" sono lo stesso nome. */
export const normName = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function matchRepo<T extends { name: string }>(repos: T[], query: string): T | null {
  const q = normName(query);
  if (!q) return null;
  return repos.find((r) => normName(r.name) === q) ?? repos.find((r) => normName(r.name).includes(q)) ?? null;
}

/**
 * Parole che indicano "l'indirizzo online" di un progetto e non il suo nome ("vercel", "il sito", "online"...):
 * se il classificatore le scambia per il nome di un repository, il progetto giusto è quello di cui si parlava.
 */
const GENERIC = /^(vercel|sito|site|online|deploy|deployment|live|app|webapp|web|link|url|produzione|prod|dominio|pubblico|pubblica|github)$/;
const STOP = /^(il|lo|la|l|del|dei|di|dal|quello|quella|su|in)$/;
export const isGenericLinkWord = (name: string): boolean => {
  const words = name.toLowerCase().split(/[^a-zà-ù0-9]+/).filter(Boolean);
  return words.some((w) => GENERIC.test(w)) && words.every((w) => GENERIC.test(w) || STOP.test(w));
};

/** L'ultimo progetto nominato nella conversazione recente (dal messaggio più nuovo), oppure null. */
export function lastRepoInHistory<T extends { name: string }>(repos: T[], history: Turn[]): T | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const text = normName(history[i].content);
    const hit = repos
      .filter((r) => normName(r.name).length >= 4 && text.includes(normName(r.name)))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (hit) return hit;
  }
  return null;
}

/** Elenco pronto da inviare: il link online se c'è, altrimenti solo il repository. Niente modello: nessuna voce inventata. */
export function formatProjectList(projects: (ProjectRef & { liveUrl?: string | null })[]): string {
  if (!projects.length) return "Non ho trovato progetti pubblici.";
  const lines = projects.map((p) => {
    const live = p.liveUrl ?? p.homepage ?? null;
    const desc = p.description ? ` — ${p.description}` : "";
    return live ? `• ${p.name}${desc}\n  🌐 ${live}\n  📦 ${p.url}` : `• ${p.name}${desc}\n  📦 ${p.url}`;
  });
  return `🔗 I tuoi progetti pubblici\n\n${lines.join("\n\n")}`;
}
