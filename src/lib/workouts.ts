import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface WorkoutEntry {
  exercise: string;
  weightKg: number;
  reps: number;
  sets: number;
  muscleGroup?: string;
}

export async function parseWorkoutMessage(text: string): Promise<WorkoutEntry> {
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Estrai i dati di un allenamento da un messaggio in italiano. Rispondi SOLO con JSON: {"exercise": string, "weightKg": number, "reps": number, "sets": number, "muscleGroup": string}. Normalizza "exercise" in minuscolo. "muscleGroup" è una tra: petto, schiena, spalle, bicipiti, tricipiti, gambe, addome. Se "sets" non è specificato, usa 1.',
      },
      { role: "user", content: text },
    ],
  });
  const parsed = JSON.parse(res.choices[0].message.content!);
  return {
    exercise: String(parsed.exercise).toLowerCase().trim(),
    weightKg: Number(parsed.weightKg),
    reps: Number(parsed.reps),
    sets: Number(parsed.sets ?? 1),
    muscleGroup: parsed.muscleGroup ? String(parsed.muscleGroup).toLowerCase().trim() : undefined,
  };
}

function estimateOneRepMax(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export async function logWorkout(entry: WorkoutEntry) {
  const { data, error } = await supabase
    .from("workout_logs")
    .insert({
      exercise: entry.exercise,
      weight_kg: entry.weightKg,
      reps: entry.reps,
      sets: entry.sets,
      muscle_group: entry.muscleGroup ?? null,
    })
    .select("id, performed_at")
    .single();
  if (error) throw error;

  const { data: history, error: historyError } = await supabase
    .from("workout_logs")
    .select("weight_kg, reps")
    .eq("exercise", entry.exercise)
    .neq("id", data.id);
  if (historyError) throw historyError;

  const newOneRm = estimateOneRepMax(entry.weightKg, entry.reps);
  const bestPreviousOneRm = (history ?? []).reduce(
    (max, row) => Math.max(max, estimateOneRepMax(row.weight_kg, row.reps)),
    0,
  );

  return {
    id: data.id as string,
    performedAt: data.performed_at as string,
    isPR: newOneRm > bestPreviousOneRm,
    estimatedOneRm: newOneRm,
  };
}

export async function getExerciseHistory(exercise: string, limit = 20) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("weight_kg, reps, sets, performed_at")
    .eq("exercise", exercise)
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getLastSession(muscleGroup: string) {
  const { data: latest, error: latestError } = await supabase
    .from("workout_logs")
    .select("performed_at")
    .eq("muscle_group", muscleGroup)
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest) return null;

  const latestDate = (latest.performed_at as string).slice(0, 10);
  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise, weight_kg, reps, sets, performed_at")
    .eq("muscle_group", muscleGroup)
    .gte("performed_at", `${latestDate}T00:00:00`)
    .lt("performed_at", `${latestDate}T23:59:59.999`)
    .order("performed_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function findMatchingRoutine(text: string): Promise<string | null> {
  const { data, error } = await supabase.from("workout_routines").select("routine_name");
  if (error) throw error;
  const names = [...new Set((data ?? []).map((r) => r.routine_name as string))];
  const normalized = text.toLowerCase().trim();
  return names.find((n) => normalized.includes(n.toLowerCase())) ?? null;
}

export interface RoutinePreviewEntry {
  exercise: string;
  muscleGroup: string | null;
  last: { weight_kg: number; reps: number; sets: number; performed_at: string } | null;
}

export async function getRoutinePreview(routineName: string): Promise<RoutinePreviewEntry[] | null> {
  const { data: routine, error } = await supabase
    .from("workout_routines")
    .select("exercise, muscle_group, order_index")
    .ilike("routine_name", routineName)
    .order("order_index", { ascending: true });
  if (error) throw error;
  if (!routine || !routine.length) return null;

  const results: RoutinePreviewEntry[] = [];
  for (const r of routine) {
    const { data: last, error: lastError } = await supabase
      .from("workout_logs")
      .select("weight_kg, reps, sets, performed_at")
      .eq("exercise", r.exercise)
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    results.push({ exercise: r.exercise, muscleGroup: r.muscle_group, last });
  }
  return results;
}

/**
 * Ciclo fisso di Daro: petto e schiena -> braccia -> leg day -> riposo -> ripete.
 * Non e' legato al calendario: se salta un giorno il flusso si posticipa (resta
 * fermo sulla prossima tappa finche' non viene davvero allenata), quindi si guarda
 * SOLO l'ultimo gruppo muscolare realmente loggato, non le date.
 */
const TRAINING_CYCLE = ["petto e schiena", "braccia", "leg day", "riposo"];

const MUSCLE_GROUP_TO_ROUTINE: Record<string, string> = {
  petto: "petto e schiena",
  schiena: "petto e schiena",
  spalle: "braccia",
  bicipiti: "braccia",
  tricipiti: "braccia",
  gambe: "leg day",
};

export async function getNextRoutineToTrain(): Promise<string> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("muscle_group, performed_at")
    .order("performed_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  let lastPosition = -1; // niente di tracciabile ancora -> si parte dall'inizio del ciclo
  for (const row of data ?? []) {
    if (row.muscle_group === "riposo") {
      lastPosition = TRAINING_CYCLE.indexOf("riposo");
      break;
    }
    const routine = MUSCLE_GROUP_TO_ROUTINE[row.muscle_group as string];
    if (routine) {
      lastPosition = TRAINING_CYCLE.indexOf(routine);
      break;
    }
    // addome (o altro non mappato) viene allenato in ogni routine: non e' indicativo,
    // si continua a guardare indietro nello storico
  }

  const nextPosition = (lastPosition + 1) % TRAINING_CYCLE.length;
  return TRAINING_CYCLE[nextPosition];
}

/**
 * Registra un giorno di riposo (nessun esercizio) cosi' il ciclo avanza
 * correttamente il giorno dopo, invece di risuggerire "riposo" di nuovo
 * (su un giorno di riposo non c'e' nulla da loggare, quindi va marcato esplicitamente).
 */
export async function markRestDay(date: Date): Promise<void> {
  const { error } = await supabase.from("workout_logs").insert({
    exercise: "riposo",
    weight_kg: 0,
    reps: 0,
    sets: 0,
    muscle_group: "riposo",
    performed_at: date.toISOString(),
  });
  if (error) throw error;
}

export interface ScheduleSlot {
  startTime: string;
  endTime: string;
  type: "studio" | "lezione";
  subject: string;
}

export async function getScheduleForDay(dayOfWeek: number): Promise<ScheduleSlot[]> {
  const { data, error } = await supabase
    .from("weekly_schedule")
    .select("start_time, end_time, type, subject")
    .eq("day_of_week", dayOfWeek)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    startTime: r.start_time,
    endTime: r.end_time,
    type: r.type as "studio" | "lezione",
    subject: r.subject,
  }));
}

export async function getPR(exercise: string) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("weight_kg, reps, performed_at")
    .eq("exercise", exercise);
  if (error) throw error;
  if (!data.length) return null;

  let best = data[0];
  let bestOneRm = estimateOneRepMax(best.weight_kg, best.reps);
  for (const row of data.slice(1)) {
    const oneRm = estimateOneRepMax(row.weight_kg, row.reps);
    if (oneRm > bestOneRm) {
      best = row;
      bestOneRm = oneRm;
    }
  }
  return { ...best, estimatedOneRm: bestOneRm };
}

export interface KnownExercise {
  name: string;
  muscleGroup: string | null;
  logs: number;
}

async function getKnownExercises(): Promise<KnownExercise[]> {
  const { data, error } = await supabase.from("workout_logs").select("exercise, muscle_group").neq("exercise", "riposo");
  if (error) throw error;
  const map = new Map<string, KnownExercise>();
  for (const r of data ?? []) {
    const name = String(r.exercise);
    const e = map.get(name) ?? { name, muscleGroup: (r.muscle_group as string | null) ?? null, logs: 0 };
    e.logs++;
    if (!e.muscleGroup && r.muscle_group) e.muscleGroup = r.muscle_group as string;
    map.set(name, e);
  }
  return [...map.values()];
}

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-zà-ù0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));

/**
 * Porta il nome detto a voce/scritto al nome già usato nello storico. Senza questo "extension"
 * diventava un esercizio nuovo invece di "leg extension" e spezzava storico, massimali e PR.
 * Esatto > uno contenuto nell'altro (per parole, plurali ignorati); a parità vince il più registrato.
 */
export interface ExerciseResolution {
  match: KnownExercise | null;
  /** più esercizi noti compatibili con il nome detto: serve chiedere quale */
  options: string[];
}

export async function resolveExercise(name: string, muscleGroupHint?: string): Promise<ExerciseResolution> {
  const wanted = name.toLowerCase().trim();
  if (!wanted) return { match: null, options: [] };
  const known = await getKnownExercises();
  const exact = known.find((k) => k.name === wanted);
  if (exact) return { match: exact, options: [] };
  const wt = tokens(wanted);
  const candidates = known.filter((k) => {
    const kt = tokens(k.name);
    return wt.every((t) => kt.includes(t)) || kt.every((t) => wt.includes(t));
  });
  if (candidates.length === 1) return { match: candidates[0], options: [] };
  if (candidates.length > 1) {
    // se il gruppo muscolare indicato restringe a un solo esercizio, o uno è nettamente il più usato, è lui
    const byGroup = muscleGroupHint ? candidates.filter((c) => c.muscleGroup === muscleGroupHint) : [];
    const pool = byGroup.length ? byGroup : candidates;
    const sorted = pool.slice().sort((x, y) => y.logs - x.logs);
    if (sorted.length === 1 || sorted[0].logs >= sorted[1].logs * 2) return { match: sorted[0], options: [] };
    return { match: null, options: sorted.map((c) => c.name) };
  }
  return { match: null, options: [] };
}

export async function getLastLogFor(exercise: string): Promise<{ weight_kg: number; reps: number; sets: number } | null> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("weight_kg, reps, sets")
    .eq("exercise", exercise)
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { weight_kg: Number(data.weight_kg), reps: Number(data.reps), sets: Number(data.sets ?? 1) } : null;
}
