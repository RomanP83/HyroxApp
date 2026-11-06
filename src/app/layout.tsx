import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

// Archivo over the usual grotesks: it holds its shapes at 11px, where most of
// this interface lives, and reads as equipment rather than as a document.
// Self-hosted (src/app/fonts, SIL Open Font License): next/font/google fetches
// the files at build time, and an incomplete answer from Google failed the
// build. The files are the Latin subset Google serves for these weights.
const ui = localFont({
  src: [
    { path: "./fonts/archivo-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/archivo-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ui",
  display: "swap",
});

// Every split, pace and weight in this sport is read off a clock or a plate.
// Monospaced figures keep a changing number from shifting the layout under it.
const data = localFont({
  src: [
    { path: "./fonts/jetbrainsmono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrainsmono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrainsmono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hyrox Hub — your training week",
  description: "The training week, on the device that goes to the gym.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Hyrox Hub" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0d1114",
  // The app is installed to a phone and read one-handed mid-session; letting a
  // stray pinch zoom the layout out from under a set is not a feature.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${data.variable}`}>
      <body>
        <ServiceWorker />
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
