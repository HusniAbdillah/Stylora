import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/**/*": ["./src/prompts/*.md"] },
};

export default config;
