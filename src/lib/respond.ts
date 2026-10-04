import { getPassword } from "./bitwarden";
import { getUpcomingEvents } from "./calendar";
import { getRepoInfo } from "./github";
import { ingest } from "./ingest";
import { classifyMessage } from "./intent";
import { searchIssues } from "./linear";
import { getRecentActivities } from "./strava";
import { findMatchingRoutine, getLastSession, getRoutinePreview, logWorkout } from "./workouts";

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

  const id = await ingest(text, "telegram");
  return `Salvato ✅ (${id})`;
}
