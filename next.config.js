/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep a page the athlete has just looked at in the browser's router cache
    // for 30 seconds, so flipping back to a tab seen a moment ago is instant
    // instead of another full server render. Every write in the app ends in
    // router.refresh(), which empties this cache, so a change is never hidden
    // behind it; what can lag by up to 30 s is only data that changed
    // elsewhere (a watch sync arriving in the background).
    staleTimes: { dynamic: 30 },
  },
};

module.exports = nextConfig;
