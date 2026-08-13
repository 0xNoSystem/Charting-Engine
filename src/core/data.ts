import type {
    CandleData,
    CandleInterval,
    CandlePoint,
    CandleSeries,
    DataIssue,
    DataIssueReport,
    LinePoint,
} from "../types";
import { CANDLE_INTERVALS } from "../types";

const MAX_REPORTED_ISSUES = 100;
const VALID_CANDLE_INTERVALS = new Set<string>(CANDLE_INTERVALS);

class IssueCollector {
    private readonly collected: DataIssue[] = [];
    private count = 0;

    add(issue: DataIssue) {
        this.count += 1;
        if (this.collected.length < MAX_REPORTED_ISSUES) {
            this.collected.push(issue);
        }
    }

    report(): DataIssueReport | null {
        return this.count
            ? { issues: this.collected, total: this.count }
            : null;
    }
}

const finite = (value: number) => Number.isFinite(value);

function validCandle(point: CandlePoint) {
    const numeric = [
        point.start,
        point.end,
        point.open,
        point.high,
        point.low,
        point.close,
    ];
    if (!numeric.every(finite)) return "invalid-number" as const;
    if (point.end <= point.start) return "invalid-time-range" as const;
    if (
        point.high < Math.max(point.open, point.close, point.low) ||
        point.low > Math.min(point.open, point.close, point.high)
    ) {
        return "invalid-ohlc" as const;
    }
    if (
        (point.volume !== undefined &&
            (!finite(point.volume) || point.volume < 0)) ||
        (point.trades !== undefined &&
            (!finite(point.trades) || point.trades < 0))
    ) {
        return "invalid-volume" as const;
    }
    return null;
}

export interface NormalizedCandles {
    byInterval: Map<CandleInterval, CandleData[]>;
    report: DataIssueReport | null;
}

export function normalizeCandleSeries(
    series: readonly CandleSeries[],
    asset: string
): NormalizedCandles {
    const issues = new IssueCollector();
    const grouped = new Map<CandleInterval, Map<number, CandleData>>();
    const seenSeries = new Set<CandleInterval>();

    series.forEach((inputSeries, seriesIndex) => {
        if (!VALID_CANDLE_INTERVALS.has(inputSeries.interval)) {
            issues.add({
                code: "invalid-interval",
                message: `Unsupported candle interval ${String(inputSeries.interval)}`,
                seriesIndex,
            });
            return;
        }
        if (seenSeries.has(inputSeries.interval)) {
            issues.add({
                code: "duplicate-series",
                message: `Multiple series use interval ${inputSeries.interval}; their points were merged`,
                seriesIndex,
            });
        }
        seenSeries.add(inputSeries.interval);

        let points = grouped.get(inputSeries.interval);
        if (!points) {
            points = new Map();
            grouped.set(inputSeries.interval, points);
        }

        inputSeries.data.forEach((point, pointIndex) => {
            const invalid = validCandle(point);
            if (invalid) {
                issues.add({
                    code: invalid,
                    message: `Invalid candle at ${inputSeries.interval}[${pointIndex}]`,
                    seriesIndex,
                    pointIndex,
                });
                return;
            }
            if (points!.has(point.start)) {
                issues.add({
                    code: "duplicate-point",
                    message: `Duplicate candle timestamp ${point.start}; the later value was used`,
                    seriesIndex,
                    pointIndex,
                });
            }
            points!.set(point.start, {
                ...point,
                volume: point.volume ?? 0,
                trades: point.trades ?? 0,
                asset,
                interval: inputSeries.interval,
            });
        });
    });

    return {
        byInterval: new Map(
            Array.from(grouped, ([interval, points]) => [
                interval,
                Array.from(points.values()).sort((a, b) => a.start - b.start),
            ])
        ),
        report: issues.report(),
    };
}

export interface NormalizedLine {
    data: LinePoint[];
    report: DataIssueReport | null;
}

export function normalizeLineData(data: readonly LinePoint[]): NormalizedLine {
    const issues = new IssueCollector();
    const points = new Map<number, LinePoint>();

    data.forEach((point, pointIndex) => {
        if (!finite(point.x) || !finite(point.y)) {
            issues.add({
                code: "invalid-number",
                message: `Line point ${pointIndex} contains a non-finite coordinate`,
                pointIndex,
            });
            return;
        }
        if (points.has(point.x)) {
            issues.add({
                code: "duplicate-point",
                message: `Duplicate x value ${point.x}; the later value was used`,
                pointIndex,
            });
        }
        points.set(point.x, { x: point.x, y: point.y });
    });

    return {
        data: Array.from(points.values()).sort((a, b) => a.x - b.x),
        report: issues.report(),
    };
}

export function upsertSorted<T>(
    previous: readonly T[],
    incoming: readonly T[],
    key: (value: T) => number,
    maximum: number
) {
    const merged = new Map<number, T>();
    previous.forEach((value) => merged.set(key(value), value));
    incoming.forEach((value) => merged.set(key(value), value));
    const sorted = Array.from(merged.values()).sort(
        (a, b) => key(a) - key(b)
    );
    const limit = Number.isFinite(maximum)
        ? Math.max(1, Math.floor(maximum))
        : 50_000;
    return sorted.length > limit ? sorted.slice(sorted.length - limit) : sorted;
}
