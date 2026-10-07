"use client";

import { useEffect, useState } from "react";
import { LIVE_MODES, readLiveMode, writeLiveMode, type LiveMode } from "../../../src/lib/liveTurns";

/** Sceglie come funziona la conversazione live con Aira (vale per questo dispositivo, dalla prossima sessione live). */
export function LiveModeCard() {
  // lo stato parte dal valore predefinito e si legge dal browser solo dopo il montaggio (niente errori di idratazione)
  const [mode, setMode] = useState<LiveMode>("realtime");
  useEffect(() => setMode(readLiveMode()), []);

  const choose = (m: LiveMode) => {
    setMode(m);
    writeLiveMode(m);
  };
  const current = LIVE_MODES.find((m) => m.value === mode)!;

  return (
    <div className="card live-mode">
      <div className="card-head">
        <h3>Conversazione live</h3>
        <span className="muted small">vale per questo dispositivo</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="Modalità della conversazione live">
        {LIVE_MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={mode === m.value ? "on" : ""} onClick={() => choose(m.value)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">{current.hint} Si applica alla prossima volta che avvii il live.</p>
    </div>
  );
}
