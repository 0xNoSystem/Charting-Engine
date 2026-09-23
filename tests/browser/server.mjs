import { build } from "tsup";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

await build({
    config: false,
    entry: ["tests/browser/fixture.tsx"],
    outDir: ".test-browser",
    format: ["iife"],
    outExtension: () => ({ js: ".js" }),
    platform: "browser",
    target: "es2020",
    noExternal: [/.*/],
    define: { "process.env.NODE_ENV": '"development"' },
    clean: true,
});

createServer(async (request, response) => {
    const path = request.url?.split("?")[0];
    if (path === "/fixture.js" || path === "/fixture.css") {
        response.setHeader("content-type", path.endsWith("js") ? "application/javascript" : "text/css");
        response.end(await readFile(`.test-browser${path}`));
    } else {
        response.setHeader("content-type", "text/html");
        response.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body style="margin:20px;background:#111;color:white"><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
}).listen(4178, "127.0.0.1");
