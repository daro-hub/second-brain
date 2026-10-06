"use client";

import { useCallback, useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Attiva/disattiva le notifiche push di questo dispositivo (su iPhone solo dall'app aggiunta alla home). */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      setState(/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      // il permesso va chiesto subito, dentro il tocco dell'utente (altrimenti iOS lo ignora)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/key");
      if (!keyRes.ok) throw new Error(keyRes.status === 503 ? "Le notifiche non sono ancora configurate sul server." : "Chiave non disponibile.");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      const save = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!save.ok) throw new Error("Registrazione non riuscita.");
      setState("on");
      setMsg("Attivate. Tocca «Notifica di prova» per controllare.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Attivazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { sent: number }) : null;
    setMsg(data ? (data.sent > 0 ? `Inviata a ${data.sent} dispositiv${data.sent === 1 ? "o" : "i"}.` : "Nessun dispositivo registrato.") : "Invio non riuscito.");
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Notifiche</h3>
        <span className="muted small">promemoria, riepiloghi e check-in anche sull&apos;app</span>
      </div>
      {state === "loading" && <p className="muted small">Controllo…</p>}
      {state === "unsupported" && <p className="muted small">Questo browser non supporta le notifiche push.</p>}
      {state === "needs-install" && (
        <p className="muted small">
          Su iPhone le notifiche funzionano solo dall&apos;app aggiunta alla home: in Safari tocca Condividi → «Aggiungi alla schermata Home», poi aprila da lì e torna qui.
        </p>
      )}
      {state === "denied" && <p className="muted small">Hai bloccato le notifiche: riattivale da Impostazioni → Notifiche → Aira, poi ricarica.</p>}
      {(state === "off" || state === "on") && (
        <div className="pass-row">
          {state === "off" ? (
            <button type="button" onClick={() => void enable()} disabled={busy}>Attiva notifiche</button>
          ) : (
            <>
              <button type="button" onClick={() => void test()} disabled={busy}>Notifica di prova</button>
              <button type="button" onClick={() => void disable()} disabled={busy}>Disattiva su questo dispositivo</button>
            </>
          )}
          <span className="pass-status">{msg || (state === "on" ? "Attive su questo dispositivo." : "")}</span>
        </div>
      )}
      {(state === "unsupported" || state === "needs-install" || state === "denied") && msg && <p className="muted small">{msg}</p>}
    </div>
  );
}
