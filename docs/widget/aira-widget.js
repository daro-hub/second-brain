// Widget di Aira per l'iPhone, per l'app gratuita "Scriptable" (App Store).
//
// Installazione:
//  1. Scriptable → "+" → incolla questo file → chiamalo "Aira".
//  2. Esegui lo script una volta DALL'APP (non dal widget): ti chiede la chiave del widget e la salva nel Portachiavi.
//     La chiave è la variabile WIDGET_KEY su Vercel (non scriverla mai in questo file: il repo è pubblico).
//  3. Home → tieni premuto → "+" → Scriptable → scegli la misura → Modifica widget → Script: Aira.
//
// Toccando il widget si apre il sito in Safari (iOS non permette ai widget di aprire l'app aggiunta alla home).

const SITE = "https://second-brain-rho-neon.vercel.app";
const KEY_NAME = "aira_widget_key";

async function getKey() {
  if (Keychain.contains(KEY_NAME)) return Keychain.get(KEY_NAME);
  const a = new Alert();
  a.title = "Chiave del widget";
  a.message = "Incolla il valore di WIDGET_KEY (da Vercel).";
  a.addSecureTextField("chiave");
  a.addAction("Salva");
  a.addCancelAction("Annulla");
  if ((await a.present()) === -1) return null;
  const k = a.textFieldValue(0).trim();
  if (k) Keychain.set(KEY_NAME, k);
  return k || null;
}

async function load(key) {
  const req = new Request(`${SITE}/api/widget`);
  req.headers = { Authorization: `Bearer ${key}` };
  const data = await req.loadJSON();
  if (req.response.statusCode === 401) {
    Keychain.remove(KEY_NAME); // chiave sbagliata o cambiata: la richiede al prossimo avvio
    throw new Error("Chiave non valida");
  }
  return data;
}

function bar(stack, color, score) {
  const w = 110;
  const row = stack.addStack();
  row.size = new Size(w, 5);
  row.cornerRadius = 3;
  row.backgroundColor = new Color("#ffffff", 0.12);
  const fill = row.addStack();
  fill.size = new Size(Math.max(2, (w * (score ?? 0)) / 100), 5);
  fill.cornerRadius = 3;
  fill.backgroundColor = new Color(color);
}

async function build() {
  const w = new ListWidget();
  w.backgroundColor = new Color("#070a10");
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const key = await getKey();
  if (!key) {
    w.addText("Apri lo script in Scriptable per impostare la chiave.");
    return w;
  }
  let d;
  try {
    d = await load(key);
  } catch (e) {
    const t = w.addText("Aira non raggiungibile");
    t.textColor = new Color("#ff5d73");
    t.font = Font.semiboldSystemFont(13);
    w.addText(String(e.message || e)).font = Font.systemFont(10);
    return w;
  }
  const size = config.widgetFamily || "medium";

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("AIRA");
  title.font = Font.boldMonospacedSystemFont(11);
  title.textColor = new Color("#4de1ff");
  head.addSpacer();
  if (d.index != null) {
    const idx = head.addText(`${d.index}`);
    idx.font = Font.boldMonospacedSystemFont(14);
    idx.textColor = Color.white();
  }
  w.addSpacer(6);

  for (const p of d.pillars) {
    const row = w.addStack();
    row.centerAlignContent();
    const label = row.addText(p.label);
    label.font = Font.systemFont(size === "small" ? 10 : 12);
    label.textColor = new Color(p.color);
    row.addSpacer();
    const score = row.addText(p.score == null ? "—" : String(p.score));
    score.font = Font.boldMonospacedSystemFont(size === "small" ? 10 : 12);
    score.textColor = Color.white();
    if (size !== "small") {
      row.addSpacer(8);
      bar(row, p.color, p.score);
    }
    w.addSpacer(3);
  }

  if (size !== "small") {
    w.addSpacer(4);
    if (d.nextExam) {
      const ex = w.addText(`🎓 ${d.nextExam.name} · tra ${d.nextExam.daysLeft} g`);
      ex.font = Font.systemFont(11);
      ex.textColor = new Color("#5eead4");
    }
    const maxEvents = size === "large" ? 4 : 1;
    for (const e of d.events.slice(0, maxEvents)) {
      const t = w.addText(`${e.time ? e.time + " " : ""}${e.title}`);
      t.font = Font.systemFont(11);
      t.textColor = new Color("#8b98a8");
      t.lineLimit = 1;
    }
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
