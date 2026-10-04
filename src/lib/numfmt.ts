export const int = (n: number): string => Math.round(n).toLocaleString("it-IT");

export const dec = (n: number, digits = 1): string =>
  n.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Passo da minuti/km decimali a "m:ss". */
export const pace = (minPerKm: number): string => {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`;
};

export const signed = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${int(Math.abs(n))}`;

/** Ora decimale → "HH:MM". */
export const clock = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(m === 60 ? h + 1 : h).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
};
