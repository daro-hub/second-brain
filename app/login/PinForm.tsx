"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

const LEN = 6;

/** Ritorna solo percorsi interni: evita che ?next=//sito-esterno diventi un redirect aperto. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function PinForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [state, setState] = useState<"idle" | "busy" | "error" | "locked">("idle");
  const [message, setMessage] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  async function submit(pin: string) {
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      if (res.status === 429) {
        setState("locked");
        setMessage("Troppi tentativi. Riprova tra 15 minuti.");
      } else if (res.status === 401) {
        setState("error");
        setMessage("PIN errato");
      } else {
        setState("error");
        setMessage("Accesso non disponibile, riprova più tardi.");
      }
    } catch {
      setState("error");
      setMessage("Connessione assente.");
    }
    setDigits(Array(LEN).fill(""));
    refs.current[0]?.focus();
  }

  function fill(start: number, chars: string) {
    const next = [...digits];
    let i = start;
    for (const c of chars) {
      if (i >= LEN) break;
      next[i++] = c;
    }
    setDigits(next);
    const last = Math.min(i, LEN - 1);
    refs.current[last]?.focus();
    if (next.every(Boolean)) void submit(next.join(""));
  }

  function onChange(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) return;
    if (state === "error") setState("idle");
    fill(i, clean);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      setDigits(next);
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < LEN - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(0, e.clipboardData.getData("text").replace(/\D/g, ""));
  }

  const disabled = state === "busy" || state === "locked";
  return (
    <div className={`pin ${state}`}>
      <div className="pin-row">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="password"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            maxLength={LEN}
            value={d}
            disabled={disabled}
            aria-label={`Cifra ${i + 1} del PIN`}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
      <div className="pin-msg" role="status" aria-live="polite">
        {state === "busy" ? "Verifica…" : message}
      </div>
    </div>
  );
}
