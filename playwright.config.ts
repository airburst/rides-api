import { defineConfig } from "@playwright/test";
import { apiUrl, appUrl, localEnv } from "./e2e/environment.js";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: appUrl,
    browserName: "chromium",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun src/index.ts",
      url: `${apiUrl}/health`,
      env: localEnv,
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --host localhost --port 3000 --strictPort",
      cwd: new URL("../rides", import.meta.url).pathname,
      url: appUrl,
      env: {
        VITE_API_URL: apiUrl,
        VITE_AUTH_PROVIDER: "better-auth",
        VITE_AUTH0_DOMAIN: "invalid.example",
        VITE_AUTH0_CLIENT_ID: "local-incident",
        VITE_AUTH0_AUDIENCE: "local-incident",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
