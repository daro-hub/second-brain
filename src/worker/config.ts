import dotenv from "dotenv";
import os from "node:os";
import path from "node:path";
import { AGENT_REPOS } from "../lib/agentCore";

// .env.worker (fuori da git) sta nella root del repo e ha la precedenza su .env.local/.env
dotenv.config({ path: path.resolve(process.cwd(), ".env.worker") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

export interface WorkerConfig {
  id: string;
  priority: number;
  devRoot: string;
  repos: string[];
  model: string;
  maxTurns: number;
  jobTimeoutMs: number;
  pollMs: number;
  heartbeatMs: number;
  staleSeconds: number;
}

function int(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== "" && process.env[name] !== undefined ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_ID"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variabili mancanti in .env.worker: ${missing.join(", ")}`);
  return {
    id: env.WORKER_ID || os.hostname().toLowerCase(),
    priority: int("WORKER_PRIORITY", 0),
    devRoot: path.resolve(env.DEV_ROOT || path.join(os.homedir(), "Desktop", "dev")),
    repos: env.AGENT_REPOS ? env.AGENT_REPOS.split(",").map((s) => s.trim()).filter(Boolean) : [...AGENT_REPOS],
    model: env.AGENT_MODEL || "sonnet",
    maxTurns: int("AGENT_MAX_TURNS", 40),
    jobTimeoutMs: int("AGENT_JOB_TIMEOUT_MIN", 15) * 60_000,
    pollMs: int("WORKER_POLL_MS", 5_000),
    heartbeatMs: int("WORKER_HEARTBEAT_MS", 15_000),
    staleSeconds: int("WORKER_STALE_SECONDS", 180),
  };
}
