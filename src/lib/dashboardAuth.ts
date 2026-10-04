/**
 * Controllo password (HTTP Basic) per le pagine della dashboard. Il nome utente è ignorato:
 * conta solo la password. Gira nel runtime Edge del middleware: niente Buffer, solo atob.
 */
function constantTimeEqual(a: string, b: string): boolean {
  // confronto a tempo costante sulla lunghezza massima, per non rivelare il prefisso corretto
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function isDashboardRequestAllowed(authorizationHeader: string | null, password: string): boolean {
  if (!authorizationHeader?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authorizationHeader.slice(6).trim());
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return constantTimeEqual(decoded.slice(sep + 1), password);
}
