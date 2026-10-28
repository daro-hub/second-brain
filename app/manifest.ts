import type { MetadataRoute } from "next";
import { OWNER } from "../src/lib/owner";

/** Serve alle notifiche push su iPhone: la web app sulla home deve avere un manifest con display "standalone". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aira · Second Brain",
    short_name: "Aira",
    description: `Aira, il second brain di ${OWNER}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#070a10",
    theme_color: "#070a10",
    lang: "it",
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
