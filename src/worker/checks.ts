import { execFile } from "node:child_process";
import { agentEnv } from "./policy";

/** Controlli per repo, eseguiti dal worker (mai da una shell dell'agente). Per i repo AmuseUp il gate e2e resta a mano. */
export const CHECKS: Record<string, string[][]> = {
  "second-brain": [["npx", "tsc", "--noEmit"], ["npm", "test"]],
  "amuseapp-backoffice": [["npx", "tsc", "--noEmit"]],
  "amuse3-webapp": [["npx", "tsc", "--noEmit"]],
  "amuse-mobile": [["npx", "tsc", "--noEmit"], ["npm", "test"]],
};

export interface CheckStep {
  cmd: string;
  ok: boolean;
  tail: string;
}
export interface CheckResult {
  ok: boolean;
  steps: CheckStep[];
}

const TAIL = 1500;

function runStep(argv: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CheckStep> {
  const [bin, ...args] = argv;
  return new Promise((resolve) => {
    // su Windows npm/npx sono .cmd: servono shell, ma gli argomenti sono costanti scritte qui, non input dell'agente
    execFile(bin, args, { cwd, env, timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024, shell: process.platform === "win32" }, (err, stdout, stderr) => {
      const out = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
      resolve({ cmd: argv.join(" "), ok: !err, tail: out.slice(-TAIL) });
    });
  });
}

/** Esegue i controlli in sequenza fermandosi al primo che fallisce. Ambiente senza segreti (stesso filtro dell'agente). */
export async function runChecks(repo: string, dir: string, commands: string[][] | undefined = CHECKS[repo]): Promise<CheckResult> {
  if (!commands?.length) return { ok: false, steps: [{ cmd: "(nessuno)", ok: false, tail: `nessun controllo configurato per ${repo}` }] };
  const env = { ...agentEnv(process.env), CI: "1" } as unknown as NodeJS.ProcessEnv;
  const steps: CheckStep[] = [];
  for (const argv of commands) {
    const step = await runStep(argv, dir, env);
    steps.push(step);
    if (!step.ok) return { ok: false, steps };
  }
  return { ok: true, steps };
}
