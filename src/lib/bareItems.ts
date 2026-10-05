/**
 * Un messaggio che è SOLO il nome di uno o più prodotti ("Latte", "pane e uova", "carta igienica") non ha verbo né
 * contesto, e il classificatore lo mandava in conversazione: il bot rispondeva "Vuoi che registri un latte?".
 * Qui lo si riconosce nel codice: vale come "aggiungi alla lista della spesa" solo se OGNI voce è un prodotto noto
 * (lessico comune + quello che Daro ha già messo in lista in passato). Il modello resta il ripiego per il resto.
 */

const GROCERIES = `latte pane uova uovo burro yogurt formaggio formaggi mozzarella parmigiano grana ricotta mascarpone panna prosciutto
salame affettati pasta riso farina zucchero sale pepe olio aceto passata pomodori pomodoro pelati tonno carne pollo manzo maiale
tacchino salsiccia hamburger pesce salmone merluzzo gamberi insalata lattuga rucola spinaci carote patate cipolle cipolla aglio
zucchine melanzane peperoni funghi cetrioli broccoli cavolfiore verdura verdure frutta mele mela banane banana arance arancia
limoni limone pere pera fragole uva kiwi ananas avocado biscotti cereali merendine cioccolato nutella marmellata miele crackers
grissini fette biscottate caffè caffe tè tisana acqua birra vino succo succhi coca cola bibita bibite legumi fagioli ceci lenticchie
piselli mais noci mandorle nocciole frutta secca patatine gelato surgelati pizza affettato whey avena fiocchi d'avena
carta igienica scottex sgrassatore detersivo detersivi ammorbidente sapone bagnoschiuma shampoo balsamo dentifricio spazzolino
deodorante rasoi schiuma sacchetti spazzatura pellicola alluminio spugne spugna candeggina lavastoviglie pastiglie cotton fioc
assorbenti lamette filo interdentale collutorio crema profumo batterie lampadine pile`
  .split(/\s+/)
  .filter(Boolean);

// l'articolo è una parola a sé ("la mela") oppure ha l'apostrofo ("l'olio"): mai un pezzo di parola ("latte")
const ARTICLES = /^(?:(?:il|lo|la|i|gli|le|un|uno|una|dei|delle|degli|del|della|dello|di)\s+|(?:l|un|d)'\s*)/;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Toglie l'articolo e la vocale finale, così "uovo/uova", "mela/mele", "biscotto/biscotti" coincidono. */
const stem = (s: string) => {
  const t = norm(s).replace(ARTICLES, "").replace(/\s+/g, " ").trim();
  return t.length > 3 ? t.replace(/[aeio]$/, "") : t;
};

export const DEFAULT_LEXICON = GROCERIES;

/**
 * Ritorna le voci da aggiungere, oppure null se il messaggio non è una semplice lista di prodotti noti.
 * Le voci composte ("carta igienica", "fette biscottate") si confrontano anche intere.
 */
export function parseBareItems(text: string, known: string[] = []): string[] | null {
  const t = text.trim().replace(/[.!]+$/, "");
  if (!t || t.length > 50 || /[?]/.test(t)) return null;
  const parts = t.split(/\s*(?:,|\+|\n|;|\se\s|\sed\s)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 5) return null;

  const knownStems = new Set([...GROCERIES, ...known].flatMap((k) => [stem(k), ...norm(k).split(/\s+/).map(stem)]));
  const wholeStems = new Set([...GROCERIES, ...known].map(stem));
  const items: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/);
    if (words.length > 3) return null;
    const ok = wholeStems.has(stem(p)) || words.every((w) => knownStems.has(stem(w)) || /^(d'|di|da|al|allo|alla|in|con|per)$/.test(norm(w)));
    if (!ok) return null;
    items.push(norm(p).replace(ARTICLES, "").trim());
  }
  return items;
}
