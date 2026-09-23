import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "tests/browser",
    testMatch: "*.spec.ts",
    workers: 2,
    use: { baseURL: "http://127.0.0.1:4178", viewport: { width: 1100, height: 700 }, hasTouch: true },
    webServer: { command: "node tests/browser/server.mjs", url: "http://127.0.0.1:4178", reuseExistingServer: !process.env.CI },
});
