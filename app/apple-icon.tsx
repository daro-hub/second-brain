import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icona per "Aggiungi a Home" su iOS: lo stesso logo di app/icon.svg, reso in PNG. */
export default function AppleIcon() {
  const svg = readFileSync(path.join(process.cwd(), "app/icon.svg"));
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={180} height={180} alt="Aira" />
    ),
    size,
  );
}
