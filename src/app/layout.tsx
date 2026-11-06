import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

// The box whiteboard (docs/design.md): one plain grotesk for everything you
// read or press, one heavy condensed grotesk for titles and every number that
// decides something. Self-hosted, Latin, SIL Open Font License.
const ui = localFont({
  src: [
    { path: "./fonts/barlow-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlow-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ui",
  display: "swap",
});

const data = localFont({
  src: [
    { path: "./fonts/barlow-condensed-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-condensed-800.woff2", weight: "800", style: "normal" },
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
  themeColor: "#b6bbbe",
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
        <div className="app-shell mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6">{children}</div>
      </body>
    </html>
  );
}
