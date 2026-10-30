import type { NextConfig } from "next";

// The Datasette API has no CORS headers, so the browser talks to /api/* on
// this origin. In production Caddy already serves /api/*; in dev we proxy it.
const API_ORIGIN = process.env.API_ORIGIN ?? "https://hackalod.sbco.design";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
