"use client";

import { useEffect, useRef } from "react";

export type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  phase: Phase;
  /** livello audio corrente 0..1 (microfono mentre ascolta, voce di Aira mentre parla) */
  getLevel: () => number;
  onClick?: () => void;
}

const PALETTE: Record<Phase, { a: [number, number, number]; b: [number, number, number] }> = {
  idle: { a: [10, 132, 255], b: [191, 90, 242] },
  listening: { a: [100, 210, 255], b: [10, 132, 255] },
  thinking: { a: [191, 90, 242], b: [94, 92, 230] },
  speaking: { a: [255, 55, 95], b: [255, 159, 10] },
};

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Aira come una sfera morbida in stile Siri: tre macchie di colore che ruotano dentro un cerchio e un alone che respira.
 * Reagisce al livello audio (microfono o voce) e cambia colore con lo stato. Disegnata a mano su canvas.
 */
export function Orb({ phase, getLevel, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const levelFn = useRef(getLevel);
  phaseRef.current = phase;
  levelFn.current = getLevel;

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

    let level = 0;
    let colA: [number, number, number] = [...PALETTE.idle.a];
    let colB: [number, number, number] = [...PALETTE.idle.b];
    const t0 = performance.now();
    // Riduci movimento: la sfera resta ferma (si ridisegna solo quando cambia stato o livello audio)
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = reduceMotion ? 0 : (now - t0) / 1000;
      const ph = phaseRef.current;
      const pal = PALETTE[ph];
      for (let i = 0; i < 3; i++) {
        colA[i] = lerp(colA[i], pal.a[i], 0.06);
        colB[i] = lerp(colB[i], pal.b[i], 0.06);
      }

      // livello: reale se c'è audio, sintetico quando "pensa" o è a riposo
      let target = levelFn.current();
      if (ph === "thinking") target = 0.35 + 0.25 * Math.sin(t * 4);
      if (ph === "idle") target = 0.1 + 0.05 * Math.sin(t * 1.2);
      level = lerp(level, target, 0.2);

      const w = canvas.width;
      const c = w / 2;
      const R = w * 0.31 * (1 + level * 0.12);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, w);
      ctx.translate(c, c);

      // alone morbido
      const glow = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.9);
      glow.addColorStop(0, rgba(colA, 0.32 + level * 0.25));
      glow.addColorStop(1, rgba(colB, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // sfera: base scura e tre macchie colorate che si muovono dentro
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#0b0b14";
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.globalCompositeOperation = "lighter";
      const speed = 0.5 + level * 1.5;
      for (let i = 0; i < 3; i++) {
        const ang = t * speed * (i % 2 ? -0.7 : 0.9) + (i * Math.PI * 2) / 3;
        const x = Math.cos(ang) * R * 0.38;
        const y = Math.sin(ang * 1.3) * R * 0.38;
        const r = R * (0.85 + level * 0.25);
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, rgba(i === 1 ? colB : colA, 0.85));
        blob.addColorStop(1, rgba(i === 1 ? colB : colA, 0));
        ctx.fillStyle = blob;
        ctx.fillRect(-R, -R, R * 2, R * 2);
      }
      ctx.restore();

      // riflesso in alto
      const shine = ctx.createLinearGradient(0, -R, 0, R * 0.2);
      shine.addColorStop(0, "rgba(255,255,255,0.2)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.5, R * 0.58, R * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`orb orb-${phase}`} onClick={onClick} aria-label={`Aira, stato: ${phase}`} />;
}
