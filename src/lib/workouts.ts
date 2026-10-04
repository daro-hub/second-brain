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
 * Suggerisce la prossima routine da allenare: quella la cui data più recente
 * tra i suoi esercizi è la più vecchia (euristica "meno allenata di recente"),
 * non un calendario fisso — Daro non ha indicato un giorno fisso per routine.
 */
export async function getNextRoutineToTrain(): Promise<string | null> {
  const { data: routines, error } = await supabase.from("workout_routines").select("routine_name, exercise");
  if (error) throw error;
  const routineNames = [...new Set((routines ?? []).map((r) => r.routine_name as string))];
  if (!routineNames.length) return null;

  let best: { name: string; lastTrained: number } | null = null;
  for (const name of routineNames) {
    const exercises = (routines ?? [])
      .filter((r) => r.routine_name === name)
      .map((r) => r.exercise as string);
    const { data: logs, error: logsError } = await supabase
      .from("workout_logs")
      .select("performed_at")
      .in("exercise", exercises)
      .order("performed_at", { ascending: false })
      .limit(1);
    if (logsError) throw logsError;
    const lastTrained = logs?.[0]?.performed_at ? new Date(logs[0].performed_at).getTime() : 0;
    if (!best || lastTrained < best.lastTrained) {
      best = { name, lastTrained };
    }
  }
  return best?.name ?? null;
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
