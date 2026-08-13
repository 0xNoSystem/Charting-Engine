const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeCandleSeries,
    normalizeLineData,
    upsertSorted,
    paddedDomain,
    nearestIndex,
    downsampleLine,
    splitAtThreshold,
} = require("../.test-dist/core-entry.cjs");

test("paddedDomain contains negative extrema", () => {
    const domain = paddedDomain(-100, -50);
    assert.ok(domain.min < -100);
    assert.ok(domain.max > -50);
});

test("paddedDomain expands flat and zero domains", () => {
    const flat = paddedDomain(100, 100);
    assert.ok(flat.min < 100 && flat.max > 100);
    const zero = paddedDomain(0, 0);
    assert.ok(zero.min < 0 && zero.max > 0);
});

test("candle normalization groups, sorts, merges duplicates, and reports invalid bars", () => {
    const result = normalizeCandleSeries(
        [{ interval: "1m", data: [
            { start: 60, end: 120, open: 2, high: 3, low: 1, close: 2 },
            { start: 0, end: 60, open: 1, high: 2, low: 0, close: 1 },
            { start: 60, end: 120, open: 2, high: 4, low: 1, close: 3 },
            { start: 150, end: 140, open: 1, high: 2, low: 0, close: 1 },
        ] }],
        "TEST"
    );
    const candles = result.byInterval.get("1m");
    assert.deepEqual(candles.map((candle) => candle.start), [0, 60]);
    assert.equal(candles[1].high, 4);
    assert.equal(candles[0].volume, 0);
    assert.equal(result.report.total, 2);
});

test("candle normalization rejects unsupported runtime intervals", () => {
    const result = normalizeCandleSeries(
        [{ interval: "90m", data: [] }],
        "TEST"
    );
    assert.equal(result.byInterval.size, 0);
    assert.equal(result.report.total, 1);
    assert.equal(result.report.issues[0].code, "invalid-interval");
});

test("line normalization filters non-finite points and keeps the last duplicate", () => {
    const result = normalizeLineData([
        { x: 2, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 4 },
        { x: Number.NaN, y: 3 },
    ]);
    assert.deepEqual(result.data, [{ x: 1, y: 1 }, { x: 2, y: 4 }]);
    assert.equal(result.report.total, 2);
});

test("bounded upserts replace timestamps and trim oldest values", () => {
    const merged = upsertSorted(
        [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        [{ x: 2, y: 20 }, { x: 3, y: 3 }],
        (point) => point.x,
        2
    );
    assert.deepEqual(merged, [{ x: 2, y: 20 }, { x: 3, y: 3 }]);
    assert.equal(
        upsertSorted([], [{ x: 1 }, { x: 2 }], (point) => point.x, 0).length,
        1
    );
});

test("nearestIndex uses sorted coordinates", () => {
    const points = [{ x: 0 }, { x: 10 }, { x: 20 }];
    assert.equal(nearestIndex(points, 6, (point) => point.x), 1);
    assert.equal(nearestIndex(points, -5, (point) => point.x), 0);
    assert.equal(nearestIndex([], 0, () => 0), -1);
});

test("line downsampling preserves extrema and endpoints", () => {
    const points = Array.from({ length: 1_000 }, (_, x) => ({
        x,
        y: x === 510 ? -500 : x === 511 ? 900 : Math.sin(x / 20),
    }));
    const sampled = downsampleLine(points, 0, 999, 50);
    assert.deepEqual(sampled[0], points[0]);
    assert.deepEqual(sampled[sampled.length - 1], points[999]);
    assert.ok(sampled.some((point) => point.y === -500));
    assert.ok(sampled.some((point) => point.y === 900));
    assert.ok(sampled.length <= 200);
});

test("threshold splitting calculates the exact crossing", () => {
    const segments = splitAtThreshold({ x: 0, y: -10 }, { x: 10, y: 10 }, 0);
    assert.equal(segments.length, 2);
    assert.deepEqual(segments[0].to, { x: 5, y: 0 });
    assert.equal(segments[0].side, "below");
    assert.equal(segments[1].side, "above");
});
