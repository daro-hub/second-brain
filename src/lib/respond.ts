import OpenAI from "openai";
import { getPassword } from "./bitwarden";
import { getUpcomingEvents } from "./calendar";
import { getRepoInfo } from "./github";
import { ingest } from "./ingest";
import { classifyMessage } from "./intent";
import { searchIssues } from "./linear";
import { searchSemantic } from "./search";
import { addShoppingItems, checkOffShoppingItemsByName, getActiveShoppingList } from "./shoppingList";
import { getRecentActivities } from "./strava";
import { findMatchingRoutine, getLastSession, getRoutinePreview, logWorkout } from "./workouts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RELEVANCE_THRESHOLD = 0.5;

async function respondConversationally(text: string): Promise<string> {
  const results = await searchSemantic(text, 3);
  const relevant = results.filter((r) => (r.similarity ?? 0) > RELEVANCE_THRESHOLD);
  const contextText = relevant.length
    ? relevant.map((r) => `- (${r.source}) ${r.content}`).join("\n")
    : "Nessuna informazione pertinente trovata nella knowledge base.";

  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      {
        role: "system",
        content: `Sei Aira, l'assistente personale di Daro su Telegram. Non sei un bot che legge dati — sei un vero segretario/a con cui ha una conversazione normale.

Regole di conversazione:
- Rispondi sempre in italiano.
- Calibra la lunghezza della risposta alla domanda: a una domanda breve e informale ("come stai", "ciao") rispondi in una frase o due, non di più. Allunga la risposta solo quando la domanda richiede davvero dettaglio o elenco di informazioni.
- Non ripetere la domanda, non riassumere quello che ti ha appena detto prima di rispondere.
- Non usare elenchi puntati o struttura formale nella chiacchiera normale — quelli servono solo quando stai davvero elencando dati (orari, prezzi, risultati). In una conversazione normale scrivi come parli.
- Se non sai qualcosa, dillo chiaramente invece di inventare — meglio "non lo so" che un'informazione falsa su di lui.
- Puoi avere un tono leggero, simpatico, con qualche emoji con moderazione — non essere né robotico né eccessivamente formale/burocratico.
- Se nel contesto sotto c'è un'informazione davvero pertinente alla domanda, usala per rispondere; altrimenti rispondi in modo conversazionale senza inventare fatti su di lui che non conosci.

Contesto dalla knowledge base:
${contextText}`,
      },
      { role: "user", content: text },
    ],
  });
  return res.choices[0].message.content ?? "Non so cosa risponderti.";
}

export async function handleMessage(text: string): Promise<string> {
  const routineName = await findMatchingRoutine(text);
  if (routineName) {
    const preview = await getRoutinePreview(routineName);
    if (!preview) return `Nessun esercizio definito per "${routineName}".`;
    const previewText = preview
      .map((p, i) => {
        if (!p.last) return `${i + 1}. ${p.exercise} — nessun dato registrato`;
        return `${i + 1}. ${p.exercise}: ${p.last.weight_kg}kg x${p.last.reps} (${p.last.sets} set)`;
      })
      .join("\n");
    return `${routineName} — ultimi pesi registrati:\n${previewText}`;
  }

  const intent = await classifyMessage(text);

  if (intent.type === "workout") {
    const result = await logWorkout(intent.entry);
    const prText = result.isPR ? " 🏆 Nuovo PR!" : "";
    return `Salvato: ${intent.entry.exercise} ${intent.entry.weightKg}kg x${intent.entry.reps} (${intent.entry.sets} set).${prText}`;
  }

  if (intent.type === "session_query") {
    const session = await getLastSession(intent.muscleGroup);
    if (!session || !session.length) return `Nessun allenamento registrato per ${intent.muscleGroup}.`;
    const date = new Date(session[0].performed_at).toLocaleDateString("it-IT");
    const sessionText = session
      .map((s, i) => `${i + 1}. ${s.exercise} ${s.weight_kg}kg x${s.reps} (${s.sets} set)`)
      .join("\n");
    return `Ultimo allenamento ${intent.muscleGroup} (${date}):\n${sessionText}`;
  }

  if (intent.type === "password_request") {
    try {
      const password = await getPassword(intent.itemName);
      return password ?? `Nessuna voce trovata per "${intent.itemName}".`;
    } catch {
      return "Errore nel recupero da Bitwarden.";
    }
  }

  if (intent.type === "github_query") {
    try {
      const repo = await getRepoInfo(intent.repoName);
      if (!repo) return `Nessun repository trovato per "${intent.repoName}".`;
      const parts = [repo.name, repo.description ?? "(nessuna descrizione)", repo.url];
      if (repo.readmeExcerpt) parts.push(`\n${repo.readmeExcerpt}`);
      return parts.join("\n");
    } catch {
      return "Errore nel recupero da GitHub.";
    }
  }

  if (intent.type === "linear_query") {
    try {
      const issues = await searchIssues(intent.term);
      if (!issues.length) return `Nessuna issue trovata per "${intent.term}".`;
      return issues.map((i) => `${i.identifier} [${i.state}] ${i.title}\n${i.url}`).join("\n\n");
    } catch {
      return "Errore nel recupero da Linear.";
    }
  }

  if (intent.type === "calendar_query") {
    try {
      const events = await getUpcomingEvents(10);
      if (!events.length) return "Nessun evento in programma.";
      return events
        .map((e) => `${new Date(e.start).toLocaleString("it-IT")} — ${e.summary}${e.location ? ` (${e.location})` : ""}`)
        .join("\n");
    } catch {
      return "Errore nel recupero da Google Calendar.";
    }
  }

  if (intent.type === "strava_query") {
    try {
      const activities = await getRecentActivities(10);
      if (!activities.length) return "Nessuna attività trovata.";
      return activities
        .map((a) => `${new Date(a.startDate).toLocaleDateString("it-IT")} — ${a.name} (${a.type}): ${a.distanceKm}km, ${a.movingTimeMin}min`)
        .join("\n");
    } catch {
      return "Errore nel recupero da Strava.";
    }
  }

  if (intent.type === "shopping_add") {
    try {
      await addShoppingItems(intent.items);
      return `Aggiunto alla lista della spesa: ${intent.items.join(", ")} 🛒`;
    } catch {
      return "Errore nel salvare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_done") {
    try {
      const matched = await checkOffShoppingItemsByName(intent.items);
      if (!matched.length) return "Non ho trovato questi articoli nella lista.";
      return `Segnato come comprato: ${matched.join(", ")} ✅`;
    } catch {
      return "Errore nell'aggiornare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_query") {
    try {
      const list = await getActiveShoppingList();
      if (!list.length) return "La lista della spesa è vuota 🛒";
      return `Lista della spesa:\n${list.map((l) => `- ${l.item}`).join("\n")}`;
    } catch {
      return "Errore nel recupero della lista della spesa.";
    }
  }

  if (!intent.save) {
    return respondConversationally(text);
  }

  const id = await ingest(text, "telegram");
  return `Salvato ✅ (${id})`;
}
