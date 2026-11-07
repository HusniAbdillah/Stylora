import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  logging: { incomingRequests: false },
};

export default config;
