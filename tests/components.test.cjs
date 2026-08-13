const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToString } = require("react-dom/server");
const {
    KwantLineChart,
    KwantChart,
    KwantDataError,
} = require("../.test-dist/components-entry.cjs");

test("generic line chart renders full and compact server markup", () => {
    const data = [{ x: 0, y: -1 }, { x: 1, y: 2 }];
    const full = renderToString(React.createElement(KwantLineChart, {
        data, name: "Return", title: "Performance",
        xAxis: { scale: "linear", label: "Iteration" },
        yAxis: { label: "Return" },
    }));
    assert.match(full, /kwant-line-full/);
    assert.match(full, /Performance/);
    const compact = renderToString(React.createElement(KwantLineChart, {
        data, layout: "compact", variant: "pnl",
    }));
    assert.match(compact, /kwant-line-compact/);
    assert.match(compact, /data-variant="pnl"/);
});

test("strict line validation throws KwantDataError", () => {
    assert.throws(() => renderToString(React.createElement(KwantLineChart, {
        data: [{ x: 0, y: Number.NaN }], invalidDataBehavior: "throw",
    })), KwantDataError);
});

test("v3 candlestick chart renders grouped series on the server", () => {
    const html = renderToString(React.createElement(KwantChart, {
        asset: "ACME", width: 640, height: 360,
        series: [{ interval: "1m", data: [{
            start: 0, end: 60_000, open: 10, high: 12, low: 9, close: 11,
        }] }],
    }));
    assert.match(html, /kwant-chart-frame/);
    assert.match(html, /ACME/);
});
