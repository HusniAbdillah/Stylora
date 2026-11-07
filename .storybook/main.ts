import type { StorybookConfig } from "@storybook/nextjs-vite";

import { mergeConfig } from "vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/**/*.stories.{ts,tsx}"],
  staticDirs: ["../public"],
  viteFinal: (config) =>
    mergeConfig(config, {
      server: { watch: { ignored: ["**/storybook-static/**", "**/.next/**"] } },
    }),
};
export default config;
