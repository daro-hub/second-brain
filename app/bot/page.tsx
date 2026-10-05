import { redirect } from "next/navigation";

// Il bot e Aira sono lo stesso cervello: stato del webhook e contatori sono nello Status.
export default function BotPage() {
  redirect("/?p=aira&detail=1");
}
