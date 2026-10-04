import { supabase } from "./supabase";
import { getRecentActivities } from "./strava";

export async function getRecentLogs(limit = 15) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise, weight_kg, reps, sets, muscle_group, performed_at")
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getDistinctExercises(): Promise<string[]> {
  const { data, error } = await supabase.from("workout_logs").select("exercise");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.exercise as string))].sort();
}

export interface ProgressionPoint {
  performedAt: string;
  weightKg: number;
  reps: number;
  estimatedOneRm: number;
}

export async function getProgressionSeries(exercise: string): Promise<ProgressionPoint[]> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("weight_kg, reps, performed_at")
    .eq("exercise", exercise)
    .order("performed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    performedAt: r.performed_at,
    weightKg: r.weight_kg,
    reps: r.reps,
    estimatedOneRm: r.weight_kg * (1 + r.reps / 30),
  }));
}

export interface DocumentPoint {
  id: string;
  source: string;
  content: string;
  embedding: number[];
}

export async function getDocumentPoints(): Promise<DocumentPoint[]> {
  const { data, error } = await supabase.from("documents").select("id, source, content, embedding");
  if (error) throw error;
  return (data ?? [])
    .filter((d) => d.embedding)
    .map((d) => ({
      id: d.id,
      source: d.source,
      content: d.content,
      embedding: typeof d.embedding === "string" ? JSON.parse(d.embedding) : d.embedding,
    }));
}

export async function getWebhookStatus() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { active: false, url: null };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const json = await res.json();
    return {
      active: Boolean(json.result?.url),
      url: json.result?.url ?? null,
      pendingUpdateCount: json.result?.pending_update_count ?? 0,
    };
  } catch {
    return { active: false, url: null };
  }
}

export interface RunningStats {
  totalRuns: number;
  totalDistanceKm: number;
  totalMovingTimeMin: number;
  avgPaceMinPerKm: number;
  recentRuns: Array<{ date: string; distanceKm: number; movingTimeMin: number; name: string }>;
}

export async function getRunningStats(limit = 30): Promise<RunningStats> {
  const activities = await getRecentActivities(limit);
  const runs = activities.filter((a) => a.type === "Run");
  const totalDistanceKm = runs.reduce((sum, r) => sum + r.distanceKm, 0);
  const totalMovingTimeMin = runs.reduce((sum, r) => sum + r.movingTimeMin, 0);
  return {
    totalRuns: runs.length,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalMovingTimeMin,
    avgPaceMinPerKm: totalDistanceKm > 0 ? Math.round((totalMovingTimeMin / totalDistanceKm) * 10) / 10 : 0,
    recentRuns: runs.map((r) => ({ date: r.startDate, distanceKm: r.distanceKm, movingTimeMin: r.movingTimeMin, name: r.name })),
  };
}

export interface WeightSessionCrossRef {
  date: string;
  stravaName: string;
  stravaMovingTimeMin: number;
  loggedExercises: number;
}

export async function getWeightTrainingCrossReference(limit = 30): Promise<WeightSessionCrossRef[]> {
  const activities = await getRecentActivities(limit);
  const weightSessions = activities.filter((a) => a.type === "WeightTraining");

  const { data: logs, error } = await supabase
    .from("workout_logs")
    .select("performed_at")
    .order("performed_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  return weightSessions.map((s) => {
    const date = s.startDate.slice(0, 10);
    const loggedExercises = (logs ?? []).filter((l) => (l.performed_at as string).slice(0, 10) === date).length;
    return {
      date,
      stravaName: s.name,
      stravaMovingTimeMin: s.movingTimeMin,
      loggedExercises,
    };
  });
}

export async function getWorkoutStats() {
  const { count: totalLogs } = await supabase
    .from("workout_logs")
    .select("*", { count: "exact", head: true });
  const { count: totalDocuments } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });
  return {
    totalLogs: totalLogs ?? 0,
    totalDocuments: totalDocuments ?? 0,
  };
}
