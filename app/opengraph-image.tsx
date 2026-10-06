import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aira, il second brain di Daro";

/** Anteprima quando il link viene condiviso: logo + nome. */
export default function OpengraphImage() {
  const svg = readFileSync(path.join(process.cwd(), "app/icon.svg"));
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 56, background: "#070a10", color: "#e6edf3" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={360} height={360} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 150, fontWeight: 600, letterSpacing: -4, color: "#9af0ff" }}>Aira</div>
          <div style={{ fontSize: 40, color: "#8b98a8", marginTop: 8 }}>Il second brain di Daro</div>
        </div>
      </div>
    ),
    size,
  );
}
