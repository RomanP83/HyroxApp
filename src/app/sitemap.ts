import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now = new Date();
  return [
    { url: base, lastModified: now, priority: 1 },
    { url: `${base}/demo`, lastModified: now, priority: 0.8 },
    { url: `${base}/de`, lastModified: now, priority: 0.9 },
    { url: `${base}/de/hyrox-trainingsplan-8-wochen`, lastModified: now, priority: 0.8 },
    { url: `${base}/de/hyrox-trainingsplan-12-wochen`, lastModified: now, priority: 0.9 },
    { url: `${base}/de/hyrox-trainingsplan-16-wochen`, lastModified: now, priority: 0.8 },
  ];
}
