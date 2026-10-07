"use server";

import { revalidatePath } from "next/cache";
import { KNOWLEDGE_AREAS, logKnowledge, logSocial, saveReflection, type KnowledgeArea } from "../../src/lib/knowledge";
import { reportError } from "../../src/lib/report";
import { addPayment, addWork, deletePayment, deleteWork, setHourlyRate, setWorkMinutes } from "../../src/lib/work";
import { setProfileFact } from "../../src/lib/profile";
import { MOOD_ASPECTS, saveMoodAnswer, saveMoodNote, type MoodKey } from "../../src/lib/mood";
import { decideProposal } from "../../src/lib/kbProposals";
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

/** Voce a importo senza ore: trasferta (+, forfait al giorno), extra (+) o detrazione (−, es. telefono aziendale). */
export async function addExtraAction(fd: FormData): Promise<void> {
  const kind = text(fd, "kind", 20);
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  const day = text(fd, "day", 10);
  if (!["Trasferta", "Extra", "Detrazione"].includes(kind) || !Number.isFinite(amount) || amount <= 0 || amount > 100_000 || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > todayKey()) return;
  const note = text(fd, "note", 200);
  try {
    await addWork({ day, minutes: 0, task: note ? `${kind}: ${note}` : kind, taskType: kind, extraEur: kind === "Detrazione" ? -amount : amount });
  } catch (err) {
    reportError("actions/addExtra", err);
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

/** Ritorna true se salvata: il pannello client mostra «Salvato» solo in quel caso. */
export async function saveMoodNoteAction(note: string): Promise<boolean> {
  try {
    await saveMoodNote(todayKey(), note.trim().slice(0, 1000));
  } catch (err) {
    reportError("actions/saveMoodNote", err);
    return false;
  }
  revalidatePath("/");
  return true;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function addPaymentAction(fd: FormData): Promise<void> {
  const paidOn = text(fd, "paidOn", 10);
  const coversUntil = text(fd, "coversUntil", 10);
  const raw = text(fd, "amount", 20).replace(",", ".");
  const amount = raw === "" ? null : Number(raw);
  if (!isDay(paidOn) || !isDay(coversUntil) || (amount !== null && !Number.isFinite(amount))) return;
  try {
    await addPayment({ paidOn, amountEur: amount, coversUntil, note: text(fd, "note", 200) });
  } catch (err) {
    reportError("actions/addPayment", err);
    return;
  }
  revalidatePath("/");
}

export async function deletePaymentAction(fd: FormData): Promise<void> {
  const id = text(fd, "id", 60);
  if (!id) return;
  try {
    await deletePayment(id);
  } catch (err) {
    reportError("actions/deletePayment", err);
    return;
  }
  revalidatePath("/");
}

export async function setRateAction(fd: FormData): Promise<void> {
  const rate = Number(text(fd, "rate", 10).replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 500) return;
  try {
    await setHourlyRate(rate);
  } catch (err) {
    reportError("actions/setRate", err);
    return;
  }
  revalidatePath("/");
}

export async function setWorkHoursAction(fd: FormData): Promise<void> {
  const id = text(fd, "id", 60);
  const hours = Number(text(fd, "hours", 10).replace(",", "."));
  if (!id || !Number.isFinite(hours) || hours < 0 || hours > 24) return;
  try {
    await setWorkMinutes(id, Math.round(hours * 60));
  } catch (err) {
    reportError("actions/setWorkHours", err);
    return;
  }
  revalidatePath("/");
}

export async function setProfileFactAction(fd: FormData): Promise<void> {
  const key = text(fd, "key", 40);
  if (!key) return;
  try {
    await setProfileFact(key, text(fd, "value", 500));
  } catch (err) {
    reportError("actions/setProfileFact", err);
    return;
  }
  revalidatePath("/");
}

/** Una risposta del diario di oggi (1-5): sostituisce i bottoni del check-in su Telegram. */
export async function saveMoodScoreAction(key: MoodKey, value: number): Promise<boolean> {
  if (!MOOD_ASPECTS.some((a) => a.key === key) || !Number.isInteger(value) || value < 1 || value > 5) return false;
  try {
    await saveMoodAnswer(todayKey(), key, value);
  } catch (err) {
    reportError("actions/saveMoodScore", err);
    return false;
  }
  revalidatePath("/");
  return true;
}

/** Conferma o scarta una nota proposta da Aira (prima c'erano i bottoni su Telegram). */
export async function decideProposalAction(fd: FormData): Promise<void> {
  const id = text(fd, "id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await decideProposal(id, fd.get("accept") === "1");
  } catch (err) {
    reportError("actions/decideProposal", err);
    return;
  }
  revalidatePath("/");
}
