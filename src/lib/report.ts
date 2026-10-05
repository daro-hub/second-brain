/**
 * Unico punto da cui passano gli errori dei widget e delle API del hub. Oggi scrive sul log di Vercel;
 * quando si aggiungerà Sentry (il repo non lo ha ancora) basterà chiamare captureException qui.
 * `expected` = errore ambientale atteso (servizio non collegato, tabella non ancora creata): solo warning.
 */
export function reportError(scope: string, err: unknown, opts: { expected?: boolean } = {}): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (opts.expected) console.warn(`[${scope}] ${msg}`);
  else console.error(`[${scope}]`, err);
}
