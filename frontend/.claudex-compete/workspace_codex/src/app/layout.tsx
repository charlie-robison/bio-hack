import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioSynth Dashboard",
  description:
    "Upload a biology research paper to generate synthetic analysis data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
