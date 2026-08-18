import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const sourceMapsEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

function resolveSentryVitePluginOptions() {
  return {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    url: process.env.SENTRY_URL,
    release: { name: process.env.VITE_RELEASE },
    sourcemaps: {
      filesToDeleteAfterUpload: ["**/*.map"],
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    sourceMapsEnabled && sentryVitePlugin(resolveSentryVitePluginOptions()),
  ].filter(Boolean),
  build: {
    sourcemap: sourceMapsEnabled,
  },
});
