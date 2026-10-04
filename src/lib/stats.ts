/**
 * Correlazione di Pearson con soglia minima di campioni. Con pochi punti il coefficiente
 * è rumore travestito da risultato: sotto MIN_N restituisce null, e la UI mostra
 * "dati in raccolta" invece di un numero che sembra un'informazione ma non lo è.
 */
export const MIN_N_FOR_CORRELATION = 8;

export interface Correlation {
  r: number;
  n: number;
}

export function pearson(xs: number[], ys: number[]): Correlation | null {
  const n = Math.min(xs.length, ys.length);
  if (n < MIN_N_FOR_CORRELATION) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return null;
  return { r: num / den, n };
}

export function describeCorrelation(c: Correlation): string {
  const a = Math.abs(c.r);
  const strength = a >= 0.7 ? "forte" : a >= 0.4 ? "moderata" : a >= 0.2 ? "debole" : "trascurabile";
  const dir = c.r > 0 ? "positiva" : "negativa";
  return a < 0.2 ? `correlazione ${strength}` : `correlazione ${strength} ${dir}`;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Media del percentile più basso (es. 0.1 = 10% inferiore): proxy robusto di "a riposo". */
export function lowPercentileMean(xs: number[], fraction = 0.1): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.max(1, Math.round(s.length * fraction));
  return mean(s.slice(0, k));
}

export const KJ_PER_KCAL = 4.184;
export const kjToKcal = (kj: number): number => kj / KJ_PER_KCAL;
