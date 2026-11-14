import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ISS Mission Dashboard",
  description: "Initial project setup for the ISS mission dashboard demo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
