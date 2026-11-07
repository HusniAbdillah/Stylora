import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./src/prompts/*.md"] },
  agentRules: false,
  logging: { incomingRequests: false },
};

export default config;
