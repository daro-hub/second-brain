import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

/** Import non-solo-tipo con percorso relativo. */
const valueImports = (src: string) =>
  [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.[^"']+)["']/gm)].map((m) => m[1]);

const resolveTs = (from: string, spec: string) => {
  const base = resolve(dirname(from), spec);
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
};

/** Il modulo importa (anche indirettamente) il client Supabase con la service key? */
const reachesSupabase = (file: string, seen = new Set<string>()): boolean => {
  if (seen.has(file)) return false;
  seen.add(file);
  if (file.endsWith(join("src", "lib", "supabase.ts"))) return true;
  const src = readFileSync(file, "utf8");
  if (/^\s*["']use server["']/.test(src)) return false; // le server action nel browser diventano stub RPC
  return valueImports(src).some((spec) => {
    const next = resolveTs(file, spec);
    return next ? reachesSupabase(next, seen) : false;
  });
};

describe("bundle client", () => {
  // Regressione: ExamPlanner importava courseMeta da uniExams.ts (che importa supabase.ts) → nel browser
  // «supabaseUrl is required» al caricamento del modulo, e tutti i widget della pagina (Ore, Università…) cadevano.
  it("nessun componente 'use client' importa, nemmeno indirettamente, il client Supabase server", () => {
    const offenders = walk(join(ROOT, "app"))
      .filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")))
      .filter((f) => reachesSupabase(f));
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
