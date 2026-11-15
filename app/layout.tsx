import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";

import "./globals.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas-neue",
  display: "swap",
});

export const metadata: Metadata = {
  title: "S.L.O.T.H.",
  description: "S.L.O.T.H. mission operations interface.",
  other: { "ai-use": "AI-assisted code and synthetic demo data; SI-generated visuals; AI-generated responses and synthetic voice. See ai-use.json." },
  icons: {
    icon: "/sloth-face.png",
    shortcut: "/sloth-face.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={bebasNeue.variable}>
        {children}
        <aside style={{ position: "fixed", bottom: 4, right: 6, zIndex: 2147483647, padding: "4px 7px", borderRadius: 4, background: "#081821", color: "#fff", font: "11px Arial, sans-serif", pointerEvents: "none" }}>
          SI-generated visuals · AI-generated text &amp; voice
        </aside>
      </body>
    </html>
  );
}
