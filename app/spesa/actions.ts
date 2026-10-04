"use server";

import { revalidatePath } from "next/cache";
import { addShoppingItems, checkOffShoppingItem } from "../../src/lib/shoppingList";

export async function checkOffAction(formData: FormData) {
  const id = String(formData.get("id"));
  await checkOffShoppingItem(id);
  revalidatePath("/spesa");
}

export async function addItemAction(formData: FormData) {
  const raw = String(formData.get("item") ?? "").trim();
  if (!raw) return;
  await addShoppingItems([raw]);
  revalidatePath("/spesa");
}
