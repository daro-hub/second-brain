/**
 * Logica pura dei punteggi dei pilastri (nessun I/O, testabile). Regole di base:
 * - i punteggi sono 0-100; `null` significa "dato sconosciuto", mai 0;
 * - per salute e allenamento si premia la permanenza in una FASCIA, non il massimo;
 * - il punteggio di un pilastro è la media pesata delle sole misure che hanno un punteggio.
 */

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

/** Avanzamento verso un obiettivo: 100 quando lo raggiungi o lo superi. */
export function scoreTarget(value: number | null, target: number): number | null {
  if (value === null || !Number.isFinite(value) || target <= 0) return null;
  return clamp((value / target) * 100);
}

/**
 * Permanenza in una fascia [lo, hi]: 100 dentro; sotto scala in proporzione a `lo`;
 * sopra scende di 2 punti per ogni punto percentuale oltre `hi` (superare non è un merito).
 */
export function scoreRange(value: number | null, lo: number, hi: number): number | null {
  if (value === null || !Number.isFinite(value) || lo <= 0 || hi < lo) return null;
  if (value >= lo && value <= hi) return 100;
  if (value < lo) return clamp((value / lo) * 100);
  return clamp(100 - ((value - hi) / hi) * 200);
}

export interface Weighted {
  score: number | null;
  weight: number;
}

/** Media pesata ignorando le misure senza punteggio. Tutte sconosciute → null. */
export function combine(items: Weighted[]): number | null {
  const known = items.filter((i): i is { score: number; weight: number } => i.score !== null && i.weight > 0);
  const w = known.reduce((s, i) => s + i.weight, 0);
  if (known.length === 0 || w === 0) return null;
  return clamp(known.reduce((s, i) => s + i.score * i.weight, 0) / w);
}

/** Indice complessivo: media penalizzata dalla dispersione (un asse basso pesa più di uno alto che compensa). */
export function balanceIndex(scores: (number | null)[]): number | null {
  const s = scores.filter((v): v is number => v !== null);
  if (s.length < 2) return null;
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const spread = Math.sqrt(s.reduce((a, b) => a + (b - avg) ** 2, 0) / s.length);
  return clamp(avg - spread * 0.5);
}

/** Differenza con uno snapshot precedente; null se manca uno dei due. */
export function trendOf(now: number | null, before: number | null | undefined): number | null {
  if (now === null || before === null || before === undefined) return null;
  return now - before;
}
