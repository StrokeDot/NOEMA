import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const data = mkdtempSync(join(tmpdir(), "noema-e2e-"));
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    actionTimeout: 15000,
    launchOptions: {
      executablePath: process.env.NOEMA_CHROMIUM,
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command:
        "cargo run --manifest-path crates/noema-core/Cargo.toml --example test_bridge",
      url: "http://127.0.0.1:4318/health",
      env: { NOEMA_TEST_DATA: data },
      timeout: 120000,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:1420",
      env: { VITE_NOEMA_TEST_BRIDGE: "1" },
      timeout: 60000,
    },
  ],
});
