import { supabase } from "./supabase";

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
 * Fase di scoperta: salva il body grezzo di ogni richiesta a /api/health così com'è,
 * a prescindere dal formato — serve a vedere cosa manda davvero l'automazione di Daro
 * prima di dare per scontato lo schema documentato di Health Auto Export.
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
    const rows = metric.data.map((point) => {
      const { date, qty, source, ...rest } = point;
      return {
        metric_name: metric.name,
        units: metric.units ?? null,
        recorded_at: parseHealthExportDate(date),
        source: source ?? null,
        value: typeof qty === "number" ? qty : null,
        payload: Object.keys(rest).length ? rest : {},
      };
    });
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "metric_name,recorded_at,source" });
    if (error) throw error;
    pointsUpserted += rows.length;
  }

  return { metricsProcessed: metrics.length, pointsUpserted };
}

export interface HealthMetricPoint {
  recordedAt: string;
  value: number | null;
  units: string | null;
  payload: Record<string, unknown>;
}

// endDate è una data (YYYY-MM-DD): va estesa a fine giornata, altrimenti il confronto
// con recorded_at (timestamp) la tratterebbe come mezzanotte ed escluderebbe tutto il
// giorno stesso.
function endOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999`;
}

export async function getMetricForRange(
  metricName: string,
  startDate: string,
  endDate: string,
): Promise<HealthMetricPoint[]> {
  const { data, error } = await supabase
    .from("health_metrics")
    .select("recorded_at, value, units, payload")
    .eq("metric_name", metricName)
    .gte("recorded_at", startDate)
    .lte("recorded_at", endOfDay(endDate))
    .order("recorded_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    recordedAt: r.recorded_at,
    value: r.value,
    units: r.units,
    payload: r.payload,
  }));
}

export async function getDistinctMetricNames(): Promise<string[]> {
  const { data, error } = await supabase.from("health_metrics").select("metric_name");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.metric_name as string))];
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
 * Aggrega i punti di una metrica in un periodo. Calcola i numeri in codice (mai
 * lasciati all'LLM, stesso principio già usato per il passo delle corse Strava) —
 * la sintesi in linguaggio naturale della risposta resta compito del modello.
 * Gestisce le due forme più comuni: metriche con "qty" singolo (somma/media/min/max
 * sul valore) e metriche Min/Avg/Max già aggregate come heart_rate (media degli Avg,
 * min degli Min, max dei Max). Altre forme (es. sleep_analysis, blood_pressure) non
 * hanno ancora un'aggregazione dedicata: tornano solo il conteggio punti.
 */
export async function getMetricSummary(
  metricName: string,
  startDate: string,
  endDate: string,
): Promise<MetricSummary> {
  const points = await getMetricForRange(metricName, startDate, endDate);
  const units = points[0]?.units ?? null;
  const base: MetricSummary = { metricName, units, pointCount: points.length, sum: null, avg: null, min: null, max: null };
  if (!points.length) return base;

  const qtyValues = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (qtyValues.length) {
    const sum = qtyValues.reduce((a, b) => a + b, 0);
    return { ...base, sum, avg: sum / qtyValues.length, min: Math.min(...qtyValues), max: Math.max(...qtyValues) };
  }

  const avgs = points.map((p) => p.payload?.Avg).filter((v): v is number => typeof v === "number");
  const mins = points.map((p) => p.payload?.Min).filter((v): v is number => typeof v === "number");
  const maxs = points.map((p) => p.payload?.Max).filter((v): v is number => typeof v === "number");
  if (avgs.length) {
    return {
      ...base,
      avg: avgs.reduce((a, b) => a + b, 0) / avgs.length,
      min: mins.length ? Math.min(...mins) : null,
      max: maxs.length ? Math.max(...maxs) : null,
    };
  }

  return base;
}
