import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const externallyManagedServer =
  process.env.QUANTFORGE_E2E_EXTERNAL_SERVER === "true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: "line",
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externallyManagedServer
    ? undefined
    : {
        command: "node server.mjs",
        env: { PORT: String(port) },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
