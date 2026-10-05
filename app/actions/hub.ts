"use server";

import { revalidatePath } from "next/cache";
import { KNOWLEDGE_AREAS, logKnowledge, logSocial, saveReflection, type KnowledgeArea } from "../../src/lib/knowledge";
import { reportError } from "../../src/lib/report";
import { todayKey } from "../../src/lib/time";

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function logKnowledgeAction(fd: FormData): Promise<void> {
  const area = text(fd, "area", 20) as KnowledgeArea;
  const minutes = Number(fd.get("minutes"));
  if (!KNOWLEDGE_AREAS.includes(area) || !Number.isFinite(minutes) || minutes < 1 || minutes > 600) return;
  try {
    await logKnowledge({ area, minutes, kind: text(fd, "kind", 30) || "lettura", note: text(fd, "note", 500) });
  } catch (err) {
    reportError("actions/logKnowledge", err);
    return;
  }
  revalidatePath("/");
}

export async function logSocialAction(fd: FormData): Promise<void> {
  try {
    await logSocial(text(fd, "kind", 30) || "uscita", text(fd, "note", 500));
  } catch (err) {
    reportError("actions/logSocial", err);
    return;
  }
  revalidatePath("/");
}

export async function saveReflectionAction(fd: FormData): Promise<void> {
  const body = text(fd, "body", 5000);
  if (!body) return;
  try {
    await saveReflection(todayKey().slice(0, 7), body);
  } catch (err) {
    reportError("actions/saveReflection", err);
    return;
  }
  revalidatePath("/");
}
