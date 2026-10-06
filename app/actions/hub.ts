"use server";

import { revalidatePath } from "next/cache";
import { KNOWLEDGE_AREAS, logKnowledge, logSocial, saveReflection, type KnowledgeArea } from "../../src/lib/knowledge";
import { reportError } from "../../src/lib/report";
import { addWork, deleteWork } from "../../src/lib/work";
import { saveMoodNote } from "../../src/lib/mood";
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

export async function addWorkAction(fd: FormData): Promise<void> {
  const hours = Number(String(fd.get("hours") ?? "").replace(",", "."));
  const task = text(fd, "task", 200);
  const day = text(fd, "day", 10);
  if (!task || !Number.isFinite(hours) || hours <= 0 || hours > 24 || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > todayKey()) return;
  try {
    await addWork({ day, minutes: Math.round(hours * 60), task, taskType: text(fd, "type", 40) || null });
  } catch (err) {
    reportError("actions/addWork", err);
    return;
  }
  revalidatePath("/");
}

export async function deleteWorkAction(fd: FormData): Promise<void> {
  const id = text(fd, "id", 60);
  if (!id) return;
  try {
    await deleteWork(id);
  } catch (err) {
    reportError("actions/deleteWork", err);
    return;
  }
  revalidatePath("/");
}

export async function saveMoodNoteAction(fd: FormData): Promise<void> {
  const note = text(fd, "note", 1000);
  try {
    await saveMoodNote(todayKey(), note);
  } catch (err) {
    reportError("actions/saveMoodNote", err);
    return;
  }
  revalidatePath("/");
}
