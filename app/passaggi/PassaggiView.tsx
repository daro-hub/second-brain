import { listTransfers } from "../../src/lib/transfers";
import { PassaggiBoard, type BoardItem } from "./PassaggiBoard";

/** Testi, link e file da passare tra i dispositivi; ogni voce scade dopo 7 giorni. */
export async function PassaggiView() {
  let items: BoardItem[] = [];
  let failed = false;
  try {
    items = (await listTransfers()).map((t) => ({
      id: t.id,
      kind: t.kind,
      content: t.content,
      fileName: t.fileName,
      fileSize: t.fileSize,
      source: t.source,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
    }));
  } catch (err) {
    console.error("[passaggi] elenco non disponibile:", err);
    failed = true;
  }
  return <PassaggiBoard items={items} failed={failed} />;
}
