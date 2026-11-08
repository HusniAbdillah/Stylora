import type { NextConfig } from "next";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./src/prompts/*.md"] },
  agentRules: false,
  logging: { incomingRequests: false },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default config;
