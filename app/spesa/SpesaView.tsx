import { getActiveShoppingList } from "../../src/lib/shoppingList";
import { addItemAction, checkOffAction } from "./actions";

export async function SpesaView() {
  const items = await getActiveShoppingList();

  return (
    <>
      <h2>🛒 Lista della spesa</h2>

      <div className="card">
        <form action={addItemAction} style={{ display: "flex", gap: 8, marginBottom: items.length ? 16 : 0 }}>
          <input type="text" name="item" placeholder="Aggiungi un articolo…" autoComplete="off" />
          <button type="submit">Aggiungi</button>
        </form>

        {items.length === 0 ? (
          <p style={{ color: "#9aa0a6" }}>Lista vuota — niente da comprare.</p>
        ) : (
          <ul className="checklist">
            {items.map((item) => (
              <li key={item.id} className="checklist-item">
                <form action={checkOffAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="checkbox-btn" aria-label={`Segna ${item.item} come comprato`} />
                </form>
                <span>{item.item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
