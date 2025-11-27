import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  minify: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  injectStyle: true,
  css: true,
  target: "es2019",
  platform: "browser",
  treeshake: true,
  outDir: "dist",
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  external: ["react", "react-dom"]
});
