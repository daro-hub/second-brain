import type { NewsItem } from "./news";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatNewsMessage(items: NewsItem[]): string {
  const body = items
    .map((item) => `${item.emoji} <b>${escapeHtml(item.title)}</b>\n${escapeHtml(item.description)}`)
    .join("\n\n");
  return `📰 <b>Le notizie di oggi</b>\n\n${body}`;
}

export function formatAiBreakthroughMessage(item: NewsItem): string {
  return `${item.emoji} <b>Novità AI: ${escapeHtml(item.title)}</b>\n\n${escapeHtml(item.description)}`;
}
