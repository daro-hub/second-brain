import { supabase } from "./supabase";
import { dayRangeUtc } from "./time";

interface HealthAutoExportPoint {
  date: string; // "yyyy-MM-dd HH:mm:ss Z", es. "2026-10-04 14:30:00 -0700"
  qty?: number;
  source?: string;
  [key: string]: unknown; // altri campi per metriche complesse (systolic/diastolic, sleep, ecc.)
}

interface HealthAutoExportMetric {
  name: string;
  units?: string;
  data: HealthAutoExportPoint[];
}

export interface HealthExportPayload {
  data?: {
    metrics?: HealthAutoExportMetric[];
  };
}

/**
 * Salva il body grezzo di una richiesta a /api/health quando il formato NON è riconosciuto,
 * così si può ispezionare e adattare il parser. Per i payload validi non serve (e riempirebbe
 * il database: ogni export contiene migliaia di punti).
 */
export async function saveRawDebugPayload(body: unknown): Promise<void> {
  const { error } = await supabase.from("health_debug_raw").insert({ body: body ?? {} });
  if (error) throw error;
}

// Health Auto Export usa "yyyy-MM-dd HH:mm:ss Z" (es. "2026-10-04 14:30:00 -0700") — non è
// ISO 8601 diretto per via dello spazio al posto della "T" e dell'offset senza ":", va
// normalizzato prima di passarlo a Date.
function parseHealthExportDate(raw: string): string {
  const isoLike = raw.replace(" ", "T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(isoLike);
  if (isNaN(d.getTime())) throw new Error(`Data non valida da Health Auto Export: "${raw}"`);
  return d.toISOString();
}

export interface IngestResult {
  metricsProcessed: number;
  pointsUpserted: number;
}

interface HealthRow {
  metric_name: string;
  units: string | null;
  recorded_at: string;
  source: string;
  value: number | null;
  payload: Record<string, unknown>;
}

// Il battito arriva a risoluzione di ~1 secondo (15k righe per una notte): si compatta a
// 1 minuto già in ingresso, altrimenti il database supererebbe il piano gratuito in pochi mesi.
const MINUTE_BUCKETED_METRICS = new Set(["heart_rate"]);

function bucketByMinute(rows: HealthRow[]): HealthRow[] {
  const groups = new Map<string, HealthRow[]>();
  for (const r of rows) {
    const key = r.recorded_at.slice(0, 16); // YYYY-MM-DDTHH:MM
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: HealthRow[] = [];
  for (const [key, g] of groups) {
    const avgs = g.map((r) => Number(r.payload.Avg ?? r.value)).filter((v) => Number.isFinite(v));
    const mins = g.map((r) => Number(r.payload.Min ?? r.value)).filter((v) => Number.isFinite(v));
    const maxs = g.map((r) => Number(r.payload.Max ?? r.value)).filter((v) => Number.isFinite(v));
    if (!avgs.length) continue;
    out.push({
      metric_name: g[0].metric_name,
      units: g[0].units,
      recorded_at: `${key}:00.000Z`,
      source: [...new Set(g.map((r) => r.source).filter(Boolean))].join("|"),
      value: null,
      payload: {
        Avg: Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10,
        Min: Math.min(...mins),
        Max: Math.max(...maxs),
        samples: g.length,
      },
    });
  }
  return out;
}

/**
 * Ingestione generica: qualunque metrica Apple Health esportata da Health Auto Export
 * (150+ tipi — nutrizione, sonno, battito, peso, ecc.) viene salvata senza bisogno di
 * codice dedicato per ogni tipo. "qty" (il caso comune) va in value; i campi extra delle
 * metriche più complesse (es. systolic/diastolic, fasi del sonno) restano in payload.
 */
export async function ingestHealthExport(payload: HealthExportPayload): Promise<IngestResult> {
  const metrics = payload.data?.metrics ?? [];
  let pointsUpserted = 0;

  for (const metric of metrics) {
    if (!metric.data?.length) continue;
    let rows: HealthRow[] = metric.data.map((point) => {
      const { date, qty, source, ...rest } = point;
      return {
        metric_name: metric.name,
        units: metric.units ?? null,
        recorded_at: parseHealthExportDate(date),
        // stringa vuota e non null: con NULL il vincolo unique non deduplica (NULL != NULL)
        // e un reinvio dello stesso export duplicherebbe le righe.
        source: source ?? "",
        value: typeof qty === "number" ? qty : null,
        payload: Object.keys(rest).length ? rest : {},
      };
    });
    if (MINUTE_BUCKETED_METRICS.has(metric.name)) rows = bucketByMinute(rows);

    // Upsert a blocchi: un export storico può contenere decine di migliaia di punti.
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      const { error } = await supabase
        .from("health_metrics")
        .upsert(chunk, { onConflict: "metric_name,recorded_at,source" });
      if (error) throw error;
    }
    pointsUpserted += rows.length;
  }

  return { metricsProcessed: metrics.length, pointsUpserted };
}

export interface SeriesBucket {
  bucket: string;
  n: number;
  total: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Serie a bucket (minuti) tra due istanti, aggregata lato database. */
export async function getHealthSeries(
  metric: string,
  from: Date,
  to: Date,
  bucketMinutes = 60,
): Promise<SeriesBucket[]> {
  const { data, error } = await supabase.rpc("health_series", {
    p_metric: metric,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_bucket_min: bucketMinutes,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    bucket: r.bucket as string,
    n: Number(r.n),
    total: num(r.total),
    avg: num(r.avg_val),
    min: num(r.min_val),
    max: num(r.max_val),
    avgHr: num(r.avg_hr),
    minHr: num(r.min_hr),
    maxHr: num(r.max_hr),
  }));
}

export interface DailyAggregate {
  day: string;
  n: number;
  total: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
}

/** Aggregati per giorno locale (Europe/Rome) tra due date incluse (YYYY-MM-DD). */
export async function getHealthDaily(metric: string, startKey: string, endKey: string): Promise<DailyAggregate[]> {
  const { data, error } = await supabase.rpc("health_daily", { p_metric: metric, p_start: startKey, p_end: endKey });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: String(r.day),
    n: Number(r.n),
    total: num(r.total),
    avg: num(r.avg_val),
    min: num(r.min_val),
    max: num(r.max_val),
    avgHr: num(r.avg_hr),
    minHr: num(r.min_hr),
    maxHr: num(r.max_hr),
  }));
}

export interface Meal {
  at: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Pasti di un giorno: Yazio scrive ogni pasto come un gruppo di valori con lo stesso
 * timestamp (energia + macro). Si ricostruiscono raggruppando per istante.
 */
export async function getMeals(dayKey: string): Promise<Meal[]> {
  const { from, to } = dayRangeUtc(dayKey);
  const { data, error } = await supabase
    .from("health_metrics")
    .select("metric_name, recorded_at, value")
    .in("metric_name", ["dietary_energy", "protein", "carbohydrates", "total_fat"])
    .gte("recorded_at", from.toISOString())
    .lt("recorded_at", to.toISOString())
    .order("recorded_at", { ascending: true });
  if (error) throw error;

  const byTime = new Map<string, Meal>();
  for (const r of data ?? []) {
    const at = r.recorded_at as string;
    const meal = byTime.get(at) ?? { at, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    const v = Number(r.value ?? 0);
    if (r.metric_name === "dietary_energy") meal.kcal += v / 4.184; // arriva in kJ
    else if (r.metric_name === "protein") meal.proteinG += v;
    else if (r.metric_name === "carbohydrates") meal.carbsG += v;
    else if (r.metric_name === "total_fat") meal.fatG += v;
    byTime.set(at, meal);
  }
  return [...byTime.values()].filter((m) => m.kcal > 0).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Peso più recente: prima da Apple Health (weight_body_mass), altrimenti dalla nota profilo
 * nella knowledge base ("ultimo dato disponibile 64,5 kg") — finché non arriva lo storico.
 */
export async function getLatestWeightKg(): Promise<{ kg: number; source: "apple_health" | "knowledge_base" } | null> {
  const { data } = await supabase
    .from("health_metrics")
    .select("value")
    .eq("metric_name", "weight_body_mass")
    .not("value", "is", null)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.value) return { kg: Number(data.value), source: "apple_health" };

  const { data: docs } = await supabase
    .from("documents")
    .select("content")
    .ilike("content", "%Storico peso%")
    .limit(1);
  const m = docs?.[0]?.content?.match(/ultimo dato disponibile\s+([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
  if (m) return { kg: Number(m[1].replace(",", ".")), source: "knowledge_base" };
  return null;
}

export interface MetricSummary {
  metricName: string;
  units: string | null;
  pointCount: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Riepilogo di una metrica in un periodo, calcolato dal database in ora italiana (mai su righe
 * grezze scaricate: PostgREST le tronca a 1000 e il battito ne ha decine di migliaia). I numeri
 * sono calcolati in codice, la sintesi in linguaggio naturale resta compito del modello.
 * Gestisce metriche con "qty" (somma/media/min/max) e Min/Avg/Max come heart_rate.
 */
export async function getMetricSummary(metricName: string, startKey: string, endKey: string): Promise<MetricSummary> {
  const days = await getHealthDaily(metricName, startKey, endKey);
  const { data: unitRow } = await supabase
    .from("health_metrics")
    .select("units")
    .eq("metric_name", metricName)
    .limit(1)
    .maybeSingle();
  const base: MetricSummary = {
    metricName,
    units: (unitRow?.units as string | null) ?? null,
    pointCount: days.reduce((a, d) => a + d.n, 0),
    sum: null,
    avg: null,
    min: null,
    max: null,
  };
  if (!days.length) return base;

  const totalN = base.pointCount;
  if (days.some((d) => d.total !== null)) {
    const sum = days.reduce((a, d) => a + (d.total ?? 0), 0);
    return {
      ...base,
      sum,
      avg: sum / totalN,
      min: Math.min(...days.map((d) => d.min ?? Infinity)),
      max: Math.max(...days.map((d) => d.max ?? -Infinity)),
    };
  }
  if (days.some((d) => d.avgHr !== null)) {
    const weighted = days.reduce((a, d) => a + (d.avgHr ?? 0) * d.n, 0) / totalN;
    return {
      ...base,
      avg: weighted,
      min: Math.min(...days.map((d) => d.minHr ?? Infinity)),
      max: Math.max(...days.map((d) => d.maxHr ?? -Infinity)),
    };
  }
  return base;
}

