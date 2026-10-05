// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiraConsole } from "../app/aira/AiraConsole";
import { useAiraVoice, type AiraVoice } from "../app/aira/useAiraVoice";

let voice: AiraVoice;
function Harness() {
  voice = useAiraVoice();
  return createElement(AiraConsole, { voice, active: true, onClose: () => {} });
}

const chatCalls: string[] = [];
beforeEach(() => {
  chatCalls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (String(url).includes("/api/aira/chat")) {
      chatCalls.push(JSON.parse(init!.body!).text);
      // risposta "sensibile": non viene letta a voce, così il test non ha bisogno dell'audio
      return new Response(JSON.stringify({ t: "reply", html: "Ciao Daro!", speech: "Ciao Daro", sensitive: true }) + "\n");
    }
    throw new Error(`fetch inatteso: ${url}`);
  });
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("modalità live: dalla trascrizione alla risposta", () => {
  it("dopo la trascrizione (fase 'elaboro') il testo arriva davvero a Aira e la fase torna libera", async () => {
    render(createElement(Harness));
    // è ciò che fa transcribeAndSend: mette 'elaboro' PRIMA di consegnare il testo a send()
    await act(async () => {
      voice.setPhaseBoth("thinking");
      await voice.onHeardRef.current!("ciao aira");
    });
    expect(chatCalls).toEqual(["ciao aira"]); // prima del fix: send() usciva subito e non chiamava Aira
    expect(voice.phaseRef.current).not.toBe("thinking"); // prima del fix restava 'elaboro' per sempre
  });

  it("due invii ravvicinati: il secondo viene ignorato finché il primo non è finito", async () => {
    render(createElement(Harness));
    await act(async () => {
      const a = voice.onHeardRef.current!("primo");
      const b = voice.onHeardRef.current!("secondo");
      await Promise.all([a, b]);
    });
    expect(chatCalls).toEqual(["primo"]);
  });
});
