import OpenAI from "openai";
import { exerciseTokens } from "./gym";
import { supabase } from "./supabase";
import { dayRangeUtc } from "./time";

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
    // il primo log di un esercizio non è un record: non c'è niente da battere (prima: "Nuovo PR!" a ogni esercizio nuovo)
    isPR: (history ?? []).length > 0 && newOneRm > bestPreviousOneRm,
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

/**
 * Ultima sessione di un gruppo muscolare. Con `beforeDayKey` si guardano solo i giorni PRECEDENTI (l'ultima volta è
 * un'altra sessione, non le serie che hai già fatto oggi).
 */
export async function getLastSession(muscleGroup: string, beforeDayKey?: string) {
  let latestQuery = supabase.from("workout_logs").select("performed_at").eq("muscle_group", muscleGroup);
  if (beforeDayKey) latestQuery = latestQuery.lt("performed_at", dayRangeUtc(beforeDayKey).from.toISOString());
  const { data: latest, error: latestError } = await latestQuery.order("performed_at", { ascending: false }).limit(1).maybeSingle();
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
  /** quanto fatto oggi (solo se richiesto con beforeDayKey) */
  today: { weight_kg: number; reps: number; sets: number; performed_at: string } | null;
}

export async function getRoutinePreview(routineName: string, beforeDayKey?: string): Promise<RoutinePreviewEntry[] | null> {
  const { data: routine, error } = await supabase
    .from("workout_routines")
    .select("exercise, muscle_group, order_index")
    .ilike("routine_name", routineName)
    .order("order_index", { ascending: true });
  if (error) throw error;
  if (!routine || !routine.length) return null;

  const results: RoutinePreviewEntry[] = [];
  const dayStart = beforeDayKey ? dayRangeUtc(beforeDayKey).from.toISOString() : null;
  for (const r of routine) {
    let lastQuery = supabase.from("workout_logs").select("weight_kg, reps, sets, performed_at").eq("exercise", r.exercise);
    if (dayStart) lastQuery = lastQuery.lt("performed_at", dayStart);
    const { data: last, error: lastError } = await lastQuery.order("performed_at", { ascending: false }).limit(1).maybeSingle();
    if (lastError) throw lastError;
    let today: RoutinePreviewEntry["last"] = null;
    if (dayStart) {
      const { data: t, error: todayError } = await supabase
        .from("workout_logs")
        .select("weight_kg, reps, sets, performed_at")
        .eq("exercise", r.exercise)
        .gte("performed_at", dayStart)
        .order("performed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (todayError) throw todayError;
      today = t;
    }
    results.push({ exercise: r.exercise, muscleGroup: r.muscle_group, last, today });
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

// "trazioni" = "pull-up": i sinonimi italiani stanno in gym.ts (prima "Quanto faccio di trazioni" non trovava niente)
const tokens = exerciseTokens;

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

/** Ultimo valore registrato; con `beforeDayKey` solo quello di una sessione PRECEDENTE ("come l'ultima volta"). */
export async function getLastLogFor(exercise: string, beforeDayKey?: string): Promise<{ weight_kg: number; reps: number; sets: number } | null> {
  let q = supabase.from("workout_logs").select("weight_kg, reps, sets").eq("exercise", exercise);
  if (beforeDayKey) q = q.lt("performed_at", dayRangeUtc(beforeDayKey).from.toISOString());
  const { data, error } = await q.order("performed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { weight_kg: Number(data.weight_kg), reps: Number(data.reps), sets: Number(data.sets ?? 1) } : null;
}

/** Per ogni routine, i gruppi muscolari dei suoi esercizi (serve a capire che "petto e schiena" è una routine). */
export async function getRoutineGroups(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from("workout_routines").select("routine_name, muscle_group");
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const r of data ?? []) {
    const name = String(r.routine_name);
    const g = r.muscle_group ? String(r.muscle_group) : null;
    (out[name] ??= []);
    if (g && !out[name].includes(g)) out[name].push(g);
  }
  return out;
}

/**
 * La routine DI OGGI: se hai già registrato serie oggi è quella che stai facendo (in corso), non la successiva;
 * altrimenti la prossima del ciclo. (getNextRoutineToTrain da sola, a metà allenamento, già indicava il giorno dopo.)
 */
export async function getRoutineForToday(dayKey: string): Promise<string> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("muscle_group")
    .gte("performed_at", dayRangeUtc(dayKey).from.toISOString())
    .lt("performed_at", dayRangeUtc(dayKey).to.toISOString())
    .order("performed_at", { ascending: false });
  if (error) throw error;
  for (const row of data ?? []) {
    const routine = MUSCLE_GROUP_TO_ROUTINE[row.muscle_group as string];
    if (routine) return routine;
  }
  return getNextRoutineToTrain();
}
