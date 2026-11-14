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
  title: "SOTERIA",
  description: "SOTERIA mission operations interface.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={bebasNeue.variable}>{children}</body>
    </html>
  );
}
