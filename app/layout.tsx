import { Suspense, type ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Topbar } from "./components/Topbar";
import { HubStage } from "./components/hub/HubStage";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "Second Brain",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="shell">
          <div className="content-col">
            <Suspense fallback={null}>
              <Topbar />
            </Suspense>
            <HubStage />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
