// Richiede una Admin API key separata da OPENAI_API_KEY: le Usage/Costs API di OpenAI sono
// a livello di organizzazione, una chiave di progetto normale non basta (vedi README per come
// crearla). Senza OPENAI_ADMIN_API_KEY la pagina mostra uno stato "non configurato" invece di
// rompersi — non è un segreto necessario al funzionamento del bot, solo per questa dashboard.

interface UsageBucketResult {
  input_tokens?: number;
  output_tokens?: number;
  num_model_requests?: number;
  model?: string;
}

interface UsageBucket {
  start_time: number;
  results: UsageBucketResult[];
}

interface CostBucketResult {
  amount?: { value?: number; currency?: string };
}

interface CostBucket {
  start_time: number;
  results: CostBucketResult[];
}

async function fetchAllPages<T extends { start_time: number }>(path: string, startTime: number): Promise<T[]> {
  const key = process.env.OPENAI_ADMIN_API_KEY;
  if (!key) throw new Error("OPENAI_ADMIN_API_KEY non configurata");

  const out: T[] = [];
  let page: string | null = null;
  do {
    const url = new URL(`https://api.openai.com/v1/organization/${path}`);
    url.searchParams.set("start_time", String(startTime));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`OpenAI usage API error (${path}): ${res.status} ${await res.text()}`);
    const data = await res.json();
    out.push(...(data.data ?? []));
    page = data.has_more ? data.next_page : null;
  } while (page);

  return out;
}

const USAGE_ENDPOINTS = ["usage/completions", "usage/embeddings", "usage/audio_speeches", "usage/audio_transcriptions"];

export interface DailyUsage {
  dayKey: string;
  tokens: number;
  costUsd: number;
}

export interface ModelUsage {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface OpenAiUsageSummary {
  configured: boolean;
  days: DailyUsage[];
  byModel: ModelUsage[];
  totalTokens30d: number;
  totalCostUsd30d: number;
  totalCostUsdToday: number;
  totalCostUsd7d: number;
  creditTotalUsd: number | null;
  creditRemainingUsd: number | null;
}

function dayKeyFromUnix(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export async function getOpenAiUsageSummary(days = 30): Promise<OpenAiUsageSummary> {
  const empty: OpenAiUsageSummary = {
    configured: false,
    days: [],
    byModel: [],
    totalTokens30d: 0,
    totalCostUsd30d: 0,
    totalCostUsdToday: 0,
    totalCostUsd7d: 0,
    creditTotalUsd: null,
    creditRemainingUsd: null,
  };
  if (!process.env.OPENAI_ADMIN_API_KEY) return empty;

  const startTime = Math.floor(Date.now() / 1000) - days * 86400;

  const usageBuckets = (
    await Promise.all(USAGE_ENDPOINTS.map((p) => fetchAllPages<UsageBucket>(p, startTime)))
  ).flat();
  const costBuckets = await fetchAllPages<CostBucket>("costs", startTime);

  const tokensByDay = new Map<string, number>();
  const modelAgg = new Map<string, ModelUsage>();
  for (const bucket of usageBuckets) {
    const dayKey = dayKeyFromUnix(bucket.start_time);
    for (const r of bucket.results) {
      const tok = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      tokensByDay.set(dayKey, (tokensByDay.get(dayKey) ?? 0) + tok);
      if (r.model) {
        const m = modelAgg.get(r.model) ?? { model: r.model, requests: 0, inputTokens: 0, outputTokens: 0 };
        m.requests += r.num_model_requests ?? 0;
        m.inputTokens += r.input_tokens ?? 0;
        m.outputTokens += r.output_tokens ?? 0;
        modelAgg.set(r.model, m);
      }
    }
  }

  const costByDay = new Map<string, number>();
  for (const bucket of costBuckets) {
    const dayKey = dayKeyFromUnix(bucket.start_time);
    const cost = bucket.results.reduce((sum, r) => sum + (r.amount?.value ?? 0), 0);
    costByDay.set(dayKey, (costByDay.get(dayKey) ?? 0) + cost);
  }

  const allDayKeys = [...new Set([...tokensByDay.keys(), ...costByDay.keys()])].sort();
  const dailyUsage: DailyUsage[] = allDayKeys.map((dayKey) => ({
    dayKey,
    tokens: tokensByDay.get(dayKey) ?? 0,
    costUsd: costByDay.get(dayKey) ?? 0,
  }));

  const todayKey = new Date().toISOString().slice(0, 10);
  const sevenDaysAgoKey = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const totalCostUsd30d = dailyUsage.reduce((s, d) => s + d.costUsd, 0);
  const totalCostUsd7d = dailyUsage.filter((d) => d.dayKey >= sevenDaysAgoKey).reduce((s, d) => s + d.costUsd, 0);
  const totalCostUsdToday = dailyUsage.find((d) => d.dayKey === todayKey)?.costUsd ?? 0;
  const totalTokens30d = dailyUsage.reduce((s, d) => s + d.tokens, 0);

  // OpenAI non espone un'API pubblica per il credito residuo prepagato (è dashboard-only,
  // nessun endpoint REST documentato): se Daro ci dice quanto ha ricaricato l'ultima volta,
  // calcoliamo "residuo = totale - spesa dal giorno della ricarica" come stima, non un dato live.
  const creditTotalUsd = process.env.OPENAI_CREDIT_TOTAL_USD ? Number(process.env.OPENAI_CREDIT_TOTAL_USD) : null;
  const creditRemainingUsd = creditTotalUsd !== null ? creditTotalUsd - totalCostUsd30d : null;

  return {
    configured: true,
    days: dailyUsage,
    byModel: [...modelAgg.values()].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    totalTokens30d,
    totalCostUsd30d,
    totalCostUsdToday,
    totalCostUsd7d,
    creditTotalUsd,
    creditRemainingUsd,
  };
}
