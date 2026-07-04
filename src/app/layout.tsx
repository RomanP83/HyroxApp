import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyrox Periodization Hub — Your plan to race day",
  description:
    "An adaptive 12-week Hyrox training plan built backward from your race date — and it recalibrates after every session. No random WOD feed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
