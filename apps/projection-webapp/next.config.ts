import type { NextConfig } from "next";

// Secrets (OPENAI_API_KEY) live in one .env at the repo root, shared by the
// apps; never in code. Missing on a fresh clone, which is fine for the wall.
try {
  process.loadEnvFile("../../.env");
} catch {}

// The Datasette API has no CORS headers, so the browser talks to /api/* on
// this origin. In production Caddy already serves /api/*; in dev we proxy it.
const API_ORIGIN = process.env.API_ORIGIN ?? "https://hackalod.sbco.design";

const nextConfig: NextConfig = {
  // `pnpm dev:phone` tunnels the dev server to an https URL for camera + mic.
  allowedDevOrigins: ["*.trycloudflare.com"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
