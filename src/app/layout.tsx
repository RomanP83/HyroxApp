import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Archivo over the usual grotesks: it holds its shapes at 11px, where most of
// this interface lives, and reads as equipment rather than as a document.
const ui = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

// Every split, pace and weight in this sport is read off a clock or a plate.
// Monospaced figures keep a changing number from shifting the layout under it.
const data = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hyrox Periodization Hub — Your plan to race day",
  description:
    "An adaptive 12-week Hyrox training plan built backward from your race date — and it recalibrates after every session. No random WOD feed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${data.variable}`}>
      <body>
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
