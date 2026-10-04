import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata = {
  title: "Second Brain",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div className="layout">
          <Sidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
