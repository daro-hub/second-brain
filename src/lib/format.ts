/**
 * Escape per contenuto dinamico/esterno (titoli GitHub, Linear, ecc.) inserito
 * dentro tag HTML dei messaggi Telegram — senza questo, un carattere "<" o "&"
 * nel contenuto rompe il parsing lato Telegram (messaggio non inviato).
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function bold(text: string): string {
  return `<b>${text}</b>`;
}

export function italic(text: string): string {
  return `<i>${text}</i>`;
}

export const BULLET = "•";
