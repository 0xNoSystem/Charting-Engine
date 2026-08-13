import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["tests/core-entry.ts", "tests/components-entry.ts"],
    format: ["cjs"],
    platform: "node",
    target: "node18",
    dts: false,
    sourcemap: false,
    splitting: false,
    clean: true,
    outDir: ".test-dist",
    outExtension: () => ({ js: ".cjs" }),
    external: [
        "react",
        "react-dom",
    ],
});
