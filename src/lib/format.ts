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

/**
 * Guida di stile condivisa da TUTTI i prompt che producono testo per Telegram. Prima ogni prompt
 * diceva "emoji e grassetto con moderazione" e il modello lo leggeva come "quasi niente": le
 * risposte venivano piatte. Qui le regole sono esplicite e hanno esempi di layout (gli esempi
 * guidano lo stile molto più delle istruzioni astratte). I valori negli esempi sono segnaposto.
 */
export const STYLE_GUIDE = `Stile del messaggio (Telegram, formattazione HTML):
- Apri SEMPRE con un'emoji pertinente al tema (🍽 cibo, 🏋️ allenamento, 📅 agenda, ❤️ battito, 👟 passi, 📚 studio, 🛒 spesa, 💡 consigli, 🏃 corsa) e metti in <b>grassetto</b> il dato o il concetto chiave, anche nelle risposte brevissime.
- Più di un punto = elenco con "${BULLET} ", una riga per voce, con l'etichetta in <b>grassetto</b>, separato dal resto da una riga vuota. Mai un blocco di testo compatto.
- Consigli, suggerimenti e spiegazioni con 2 o più elementi (piatti, esercizi, motivi, passi): SEMPRE riga d'apertura con emoji e titolo in grassetto, riga vuota, elenco, riga vuota, eventuale frase finale — mai un paragrafo unico.
- Usa solo i tag <b> e <i>. MAI markdown con asterischi (**testo**): il bot invia in HTML e gli asterischi comparirebbero letteralmente.
- Un'emoji per sezione, non una per ogni parola. Tono caldo e diretto, italiano naturale; la lunghezza segue la domanda ma l'impaginazione è sempre ordinata.

Esempi dell'impaginazione giusta (i valori sono segnaposto):

Domanda semplice:
🍽 Oggi hai mangiato <b>[N] kcal</b> in [K] pasti.

Consiglio o risposta articolata:
💡 <b>[Titolo breve]</b>

${BULLET} <b>[Voce 1]</b> — [dettaglio]
${BULLET} <b>[Voce 2]</b> — [dettaglio]
${BULLET} <b>[Voce 3]</b> — [dettaglio]

[Frase finale utile, su una riga a parte].`;

/**
 * Testo adatto alla sintesi vocale: via i tag HTML, le emoji e i punti elenco (la voce li leggerebbe
 * come "b", "faccina", "punto"). I tag si tolgono PRIMA di decodificare le entità, così un "&lt;b&gt;"
 * letterale nel testo resta testo.
 */
export function stripForSpeech(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/^[ \t]*•[ \t]*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ $/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ALLOWED_TAG = /^(<\/?(b|i|u|s|code|pre)>|<a href="[^"<>]*">|<\/a>)$/;
const TAG_NAME = /^<\/?([a-z]+)/;
const MAX_TELEGRAM_CHARS = 4000; // il limite di Telegram è 4096

/**
 * Normalizza il testo scritto da un LLM prima di inviarlo con parse_mode HTML. Il modello a volte usa
 * il Markdown (**grassetto**, "* voce"), a volte lascia un "<" o "&" letterale ("peso < 60 kg") o un
 * tag non chiuso: con parse_mode HTML Telegram rifiuta l'INTERO messaggio ("can't parse entities") e
 * l'utente non riceve nessuna risposta. Si converte il Markdown, si fa l'escape di tutto ciò che non è
 * un tag consentito, si accorcia sotto il limite e si bilanciano i tag. Va applicato SOLO a testo
 * generato dal modello (mai a dati letterali come le password).
 */
export function sanitizeTelegramHtml(raw: string): string {
  const converted = raw
    .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/^[ \t]*[*-][ \t]+/gm, `${BULLET} `);

  const escapeText = (t: string) =>
    t
      .replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  let text = converted
    .split(/(<[^<>]*>)/g)
    .map((part) => (ALLOWED_TAG.test(part) ? part : escapeText(part)))
    .join("");

  if (text.length > MAX_TELEGRAM_CHARS) {
    const cut = text.lastIndexOf("\n", MAX_TELEGRAM_CHARS);
    text = `${text.slice(0, cut > MAX_TELEGRAM_CHARS / 2 ? cut : MAX_TELEGRAM_CHARS)}…`;
  }

  // bilanciamento: i tag di chiusura orfani si scartano, quelli rimasti aperti si chiudono in fondo
  const stack: string[] = [];
  const balanced = text
    .split(/(<[^<>]*>)/g)
    .map((part) => {
      if (!ALLOWED_TAG.test(part)) return part;
      const name = part.match(TAG_NAME)![1];
      if (!part.startsWith("</")) {
        stack.push(name);
        return part;
      }
      if (stack[stack.length - 1] === name) {
        stack.pop();
        return part;
      }
      return "";
    })
    .join("");
  return balanced + stack.reverse().map((n) => `</${n}>`).join("");
}

/**
 * Toglie le righe fatte SOLO di emoji ("📅", "📚", "🏋️" rimaste come intestazioni di sezioni senza contenuto):
 * il modello le scriveva in fondo alla risposta. Non tocca righe con testo.
 */
export function dropEmptyIconLines(text: string): string {
  const onlyIcons = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+$/u;
  const kept = text.split("\n").filter((l) => !(l.trim() && l.trim().length <= 12 && onlyIcons.test(l)));
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out || text;
}
