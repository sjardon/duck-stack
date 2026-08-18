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
    // The plugin's internal default (no errorHandler override) logs and
    // swallows source-map upload failures instead of throwing, so `vite
    // build` would exit 0 and the deploy would ship without maps. Rethrowing
    // here forces `vite build` to fail, which — under `deploy.sh`'s
    // `set -euo pipefail` — aborts the deploy before `wrangler pages deploy`
    // runs (EC001).
    errorHandler: (error: Error) => {
      throw error;
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
