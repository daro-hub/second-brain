import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const BW_ENTRY = path.join(process.cwd(), "node_modules", "@bitwarden", "cli", "build", "bw.js");

function bwEnv() {
  return {
    ...process.env,
    BITWARDENCLI_APPDATA_DIR: path.join(os.tmpdir(), "bw-cli"),
  };
}

async function run(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [BW_ENTRY, ...args], { env: bwEnv() });
  return stdout.trim();
}

export async function getPassword(itemName: string): Promise<string | null> {
  await run(["login", "--apikey"]).catch(() => {
    // già loggato in precedenza: ok, procediamo
  });

  const session = await run(["unlock", "--passwordenv", "BW_MASTER_PASSWORD", "--raw"]);
  await run(["sync", "--session", session]);

  try {
    const password = await run(["get", "password", itemName, "--session", session]);
    return password || null;
  } catch {
    return null;
  } finally {
    await run(["lock"]).catch(() => {});
  }
}
