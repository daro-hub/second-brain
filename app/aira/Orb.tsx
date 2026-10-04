"use client";

import { useEffect, useRef } from "react";

export type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  phase: Phase;
  /** livello audio corrente 0..1 (microfono mentre ascolta, voce di Aira mentre parla) */
  getLevel: () => number;
  /** spettro corrente (0..255), opzionale */
  getSpectrum: () => Uint8Array | null;
  onClick?: () => void;
}

const PALETTE: Record<Phase, { a: [number, number, number]; b: [number, number, number] }> = {
  idle: { a: [94, 234, 212], b: [122, 162, 255] },
  listening: { a: [77, 225, 255], b: [94, 234, 212] },
  thinking: { a: [183, 140, 255], b: [122, 162, 255] },
  speaking: { a: [255, 122, 217], b: [183, 140, 255] },
};

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Nucleo olografico di Aira: anelli rotanti, barre spettrali e nucleo luminoso che reagiscono
 * all'audio. Disegnato a mano su canvas (nessuna libreria), il colore cambia con lo stato.
 */
export function Orb({ phase, getLevel, getSpectrum, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const levelFn = useRef(getLevel);
  const specFn = useRef(getSpectrum);
  phaseRef.current = phase;
  levelFn.current = getLevel;
  specFn.current = getSpectrum;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let size = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = rect.width;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.width * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const BARS = 72;
    const bars = new Float32Array(BARS);
    let level = 0;
    let colA: [number, number, number] = [...PALETTE.idle.a];
    let colB: [number, number, number] = [...PALETTE.idle.b];
    let energy = 0.25;
    const t0 = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = (now - t0) / 1000;
      const ph = phaseRef.current;
      const pal = PALETTE[ph];
      for (let i = 0; i < 3; i++) {
        colA[i] = lerp(colA[i], pal.a[i], 0.06);
        colB[i] = lerp(colB[i], pal.b[i], 0.06);
      }

      // livello: reale se c'è audio, sintetico quando "pensa" o è a riposo
      let target = levelFn.current();
      if (ph === "thinking") target = 0.35 + 0.25 * Math.sin(t * 5);
      if (ph === "idle") target = 0.12 + 0.05 * Math.sin(t * 1.4);
      level = lerp(level, target, 0.25);
      energy = lerp(energy, ph === "idle" ? 0.25 : ph === "thinking" ? 0.9 : 0.6 + level, 0.05);

      const spec = specFn.current();
      for (let i = 0; i < BARS; i++) {
        let v: number;
        if (spec && (ph === "listening" || ph === "speaking")) {
          const idx = Math.floor(Math.pow(i / BARS, 1.6) * Math.min(spec.length - 1, 96));
          v = spec[idx] / 255;
        } else {
          v = 0.18 + 0.15 * Math.sin(t * (ph === "thinking" ? 6 : 1.6) + i * 0.5) * (ph === "idle" ? 0.5 : 1);
        }
        bars[i] = lerp(bars[i], v, 0.35);
      }

      const w = canvas.width;
      const c = w / 2;
      const R = w * 0.2 * (1 + level * 0.1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, w);
      ctx.translate(c, c);
      ctx.lineCap = "round";

      // alone
      const glow = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 2.3);
      glow.addColorStop(0, rgba(colA, 0.28 + level * 0.3));
      glow.addColorStop(0.45, rgba(colB, 0.1 + level * 0.1));
      glow.addColorStop(1, rgba(colB, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 2.3, 0, Math.PI * 2);
      ctx.fill();

      // barre spettrali radiali
      for (let i = 0; i < BARS; i++) {
        const ang = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const inner = R * 1.18;
        const len = R * (0.08 + bars[i] * 0.55);
        ctx.strokeStyle = rgba(i % 2 ? colA : colB, 0.35 + bars[i] * 0.6);
        ctx.lineWidth = Math.max(1.5, w * 0.004);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
        ctx.lineTo(Math.cos(ang) * (inner + len), Math.sin(ang) * (inner + len));
        ctx.stroke();
      }

      // anelli rotanti a segmenti
      const rings = [
        { r: 1.0, n: 3, gap: 0.5, speed: 0.35, lw: 0.008, a: 0.9 },
        { r: 1.5, n: 5, gap: 0.55, speed: -0.22, lw: 0.005, a: 0.55 },
        { r: 1.95, n: 24, gap: 0.75, speed: 0.12, lw: 0.0035, a: 0.35 },
      ];
      for (const [k, ring] of rings.entries()) {
        const rot = t * ring.speed * (0.6 + energy) + k;
        const seg = (Math.PI * 2) / ring.n;
        ctx.strokeStyle = rgba(k % 2 ? colB : colA, ring.a);
        ctx.lineWidth = w * ring.lw;
        for (let s = 0; s < ring.n; s++) {
          const a0 = rot + s * seg;
          ctx.beginPath();
          ctx.arc(0, 0, R * ring.r, a0, a0 + seg * (1 - ring.gap));
          ctx.stroke();
        }
      }

      // tacche del quadrante
      ctx.strokeStyle = rgba(colA, 0.25);
      ctx.lineWidth = Math.max(1, w * 0.002);
      for (let i = 0; i < 120; i++) {
        const ang = (i / 120) * Math.PI * 2 + t * 0.03;
        const long = i % 10 === 0;
        const r0 = R * 2.2;
        const r1 = r0 + R * (long ? 0.12 : 0.05);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }

      // nucleo
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * (0.95 + level * 0.15));
      core.addColorStop(0, rgba([255, 255, 255], 0.95));
      core.addColorStop(0.18, rgba(colA, 0.9));
      core.addColorStop(0.65, rgba(colB, 0.35));
      core.addColorStop(1, rgba(colB, 0.04));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.95 + level * 0.15), 0, Math.PI * 2);
      ctx.fill();

      // particelle orbitanti
      for (let i = 0; i < 26; i++) {
        const sp = 0.25 + (i % 5) * 0.08;
        const ang = t * sp * (i % 2 ? 1 : -1) + i * 2.399;
        const rr = R * (1.05 + ((i * 37) % 100) / 100 * 0.9) + Math.sin(t * 2 + i) * R * 0.04;
        ctx.fillStyle = rgba(i % 3 ? colA : colB, 0.35 + 0.4 * Math.abs(Math.sin(t + i)));
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, Math.max(1.2, w * 0.0035), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`orb orb-${phase}`} onClick={onClick} aria-label={`Aira, stato: ${phase}`} />;
}
