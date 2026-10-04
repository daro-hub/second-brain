import { redirect } from "next/navigation";

// Il bot e Aira sono lo stesso cervello: le informazioni di questa pagina vivono ora in /aira (vista "Cervello").
export default function BotPage() {
  redirect("/aira?view=brain");
}
