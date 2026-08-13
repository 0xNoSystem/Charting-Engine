import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import React from "react";
import { renderToString } from "react-dom/server";

const require = createRequire(import.meta.url);

test("ESM and CJS entries expose v3 components", async () => {
    const esm = await import("../dist/index.mjs");
    const cjs = require("../dist/index.cjs");
    const line = await import("../dist/line.mjs");
    assert.equal(typeof esm.KwantChart, "function");
    assert.equal(typeof esm.KwantLineChart, "function");
    assert.equal(typeof cjs.KwantChart, "function");
    assert.equal(typeof line.KwantLineChart, "function");
    assert.equal(typeof line.KwantDataError, "function");
});

test("built modules are SSR-safe and do not inject styles", async () => {
    const { KwantLineChart } = await import("../dist/line.mjs");
    const html = renderToString(React.createElement(KwantLineChart, {
        data: [{ x: 0, y: 0 }], layout: "compact",
    }));
    assert.match(html, /kwant-line-compact/);
    const source = await readFile(new URL("../dist/index.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /styleInject|createElement\(["']style/);
});

test("line subpath remains independent and bundle budgets hold", async () => {
    const line = await readFile(new URL("../dist/line.mjs", import.meta.url));
    const root = await readFile(new URL("../dist/index.mjs", import.meta.url));
    assert.doesNotMatch(line.toString("utf8"), /react-colorful|HexColorPicker/);
    assert.ok(gzipSync(line).length <= 15 * 1024);
    assert.ok(gzipSync(root).length <= 50 * 1024);
    assert.ok((await stat(new URL("../dist/styles.css", import.meta.url))).size > 0);
    assert.ok((await stat(new URL("../dist/line.css", import.meta.url))).size > 0);
});
