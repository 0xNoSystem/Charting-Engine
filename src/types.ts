export const CANDLE_INTERVALS = [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
] as const;

export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export interface CandlePoint {
    start: number;
    end: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    trades?: number;
}

export interface CandleSeries {
    interval: CandleInterval;
    data: readonly CandlePoint[];
}

export interface LinePoint {
    x: number;
    y: number;
}

export type DataMode = "replace" | "upsert";
export type InvalidDataBehavior = "filter" | "throw";

export type DataIssueCode =
    | "duplicate-series"
    | "invalid-interval"
    | "invalid-number"
    | "invalid-time-range"
    | "invalid-ohlc"
    | "invalid-volume"
    | "duplicate-point";

export interface DataIssue {
    code: DataIssueCode;
    message: string;
    seriesIndex?: number;
    pointIndex?: number;
}

export interface DataIssueReport {
    /** At most the first 100 issues from the current input revision. */
    issues: readonly DataIssue[];
    total: number;
}

export class KwantDataError extends Error {
    readonly report: DataIssueReport;

    constructor(report: DataIssueReport) {
        super(`Kwant found ${report.total} data issue(s)`);
        this.name = "KwantDataError";
        this.report = report;
    }
}

export interface TimeRange {
    from: number;
    to: number;
}

export type ValueFormatter = (value: number) => string;
export type TimeFormatter = (value: number) => string;
export type TimeZoneMode = "UTC" | "local";

export interface KwantTheme {
    containerBackground: string;
    plotBackground: string;
    gridColor: string;
    accentColor: string;
    crosshairColor: string;
    crosshairLineStyle: "solid" | "dashed" | "dotted";
    upColor: string;
    downColor: string;
}

// Internal candle shape retained by the candlestick renderer. Public callers
// provide CandleSeries/CandlePoint, and KwantChart adds the series metadata.
export interface CandleData extends Required<CandlePoint> {
    asset: string;
    interval: CandleInterval;
}

export type TimeFrame =
    | "min1"
    | "min3"
    | "min5"
    | "min15"
    | "min30"
    | "hour1"
    | "hour2"
    | "hour4"
    | "hour12"
    | "day1"
    | "day3"
    | "week"
    | "month";

export const TIMEFRAME_CAMELCASE: Record<CandleInterval, TimeFrame> = {
    "1m": "min1",
    "3m": "min3",
    "5m": "min5",
    "15m": "min15",
    "30m": "min30",
    "1h": "hour1",
    "2h": "hour2",
    "4h": "hour4",
    "12h": "hour12",
    "1d": "day1",
    "3d": "day3",
    "1w": "week",
    "1M": "month",
};

export const TIMEFRAME_INTERVAL = Object.fromEntries(
    Object.entries(TIMEFRAME_CAMELCASE).map(([interval, timeframe]) => [
        timeframe,
        interval,
    ])
) as Record<TimeFrame, CandleInterval>;

export const TF_TO_MS: Record<TimeFrame, number> = {
    min1: 60_000,
    min3: 3 * 60_000,
    min5: 5 * 60_000,
    min15: 15 * 60_000,
    min30: 30 * 60_000,
    hour1: 60 * 60_000,
    hour2: 2 * 60 * 60_000,
    hour4: 4 * 60 * 60_000,
    hour12: 12 * 60 * 60_000,
    day1: 24 * 60 * 60_000,
    day3: 3 * 24 * 60 * 60_000,
    week: 7 * 24 * 60 * 60_000,
    month: 30 * 24 * 60 * 60_000,
};
