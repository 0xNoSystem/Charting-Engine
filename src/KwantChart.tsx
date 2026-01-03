import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartProvider, { useChartContext } from "./chart/ChartContext";
import ChartContainer from "./chart/ChartContainer";
import { getTimeframeCache } from "./chart/candleCache";
import { fetchCandles, isTimeframeSupported } from "./chart/dataSources";
import type { CandleData } from "./types";
import {
    DEFAULT_DATA_SOURCE,
    DEFAULT_QUOTE_ASSET,
    TIMEFRAME_CAMELCASE,
    TF_TO_MS,
    type DataSource,
    type ExchangeId,
    type MarketType,
    type TimeFrame,
} from "./types";

type RangePreset = "24H" | "7D" | "30D" | "YTD" | "CUSTOM";

const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
    { id: "24H", label: "24H" },
    { id: "7D", label: "7D" },
    { id: "30D", label: "30D" },
    { id: "YTD", label: "YTD" },
    { id: "CUSTOM", label: "Custom" },
];

const EXCHANGE_OPTIONS: {
    value: ExchangeId;
    label: string;
    markets: MarketType[];
}[] = [
    { value: "binance", label: "Binance", markets: ["spot", "futures"] },
    { value: "bybit", label: "Bybit", markets: ["spot", "futures"] },
    { value: "okx", label: "OKX", markets: ["spot", "futures"] },
    { value: "coinbase", label: "Coinbase", markets: ["spot"] },
    { value: "kraken", label: "Kraken", markets: ["spot", "futures"] },
    { value: "kucoin", label: "KuCoin", markets: ["spot", "futures"] },
    { value: "bitget", label: "Bitget", markets: ["spot", "futures"] },
    { value: "gateio", label: "Gate.io", markets: ["spot", "futures"] },
    { value: "htx", label: "HTX", markets: ["spot", "futures"] },
    { value: "mexc", label: "MEXC", markets: ["spot", "futures"] },
];

const MARKET_OPTIONS: { value: MarketType; label: string }[] = [
    { value: "spot", label: "Spot" },
    { value: "futures", label: "Futures" },
];

const DEFAULT_MARKETS = MARKET_OPTIONS.map((option) => option.value);

const getMarketsForExchange = (exchange: ExchangeId): MarketType[] => {
    const match = EXCHANGE_OPTIONS.find((item) => item.value === exchange);
    return match ? match.markets : DEFAULT_MARKETS;
};

const PRESET_DEFAULT_TF: Partial<Record<RangePreset, TimeFrame>> = {
    "24H": "hour1",
    "7D": "hour1",
    "30D": "hour4",
    YTD: "day1",
};

const RANGE_PRESET_BUTTON_CLASSES = {
    active: "kwant-secondary-border kwant-secondary-text kwant-secondary-hover rounded border px-3 py-1 text-sm transition",
    inactive:
        "rounded border px-3 py-1 text-sm transition border-white/30 text-white/70 hover:border-white/60",
} as const;

const APPLY_BUTTON_CLASSES = {
    enabled:
        "kwant-secondary-border kwant-secondary-text kwant-secondary-hover self-start rounded border px-3 py-1 text-xs font-semibold transition",
    disabled:
        "self-start rounded border px-3 py-1 text-xs font-semibold transition cursor-not-allowed border-white/20 text-white/30",
} as const;

const TIMEFRAME_LABEL_CLASSES = {
    active: "kwant-secondary-text px-2 text-center text-sm font-bold",
    inactive: "px-2 text-center text-sm text-white/70",
    disabled: "px-2 text-center text-sm text-white/30",
} as const;

const TIMEFRAME_ORDER = Object.values(TIMEFRAME_CAMELCASE) as TimeFrame[];

type CustomDateParts = {
    year: number;
    month: number; // 1-based
    day: number;
    time: string; // HH:MM (24h)
};

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from(
    { length: CURRENT_YEAR - 2016 + 1 },
    (_, idx) => 2016 + idx
);
const MONTHS = [
    { value: 1, label: "Jan" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Apr" },
    { value: 5, label: "May" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Aug" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Oct" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Dec" },
];

function getDaysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateToParts(date: Date): CustomDateParts {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return { year, month, day, time: `${hours}:${minutes}` };
}

function partsToMs(parts: CustomDateParts): number {
    const [hours, minutes] = parts.time.split(":").map((n) => Number(n) || 0);
    return Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes);
}

function sanitizeTime(value: string): string {
    if (!value) return "00:00";
    const [hours = "0", minutes = "0"] = value.split(":");
    const h = Math.min(23, Math.max(0, Number(hours)));
    const m = Math.min(59, Math.max(0, Number(minutes)));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeParts(parts: CustomDateParts): CustomDateParts {
    const maxDay = getDaysInMonth(parts.year, parts.month);
    const day = Math.min(parts.day, maxDay);
    return { ...parts, day, time: sanitizeTime(parts.time) };
}

function normalizeRange(
    startMs: number,
    endMs: number,
    candleIntervalMs: number
) {
    const clampedStart = Math.max(0, startMs);
    const normalizedStart = clampedStart - (clampedStart % candleIntervalMs);
    const normalizedEnd = Math.max(
        normalizedStart + candleIntervalMs,
        Math.ceil(endMs / candleIntervalMs) * candleIntervalMs
    );

    return { normalizedStart, normalizedEnd };
}

function collectCachedCandles(
    tfCache: Map<number, CandleData>,
    asset: string,
    normalizedStart: number,
    normalizedEnd: number,
    candleIntervalMs: number
) {
    const cached: CandleData[] = [];
    const missing: { start: number; end: number }[] = [];

    let gapStart: number | null = null;

    for (let ts = normalizedStart; ts < normalizedEnd; ts += candleIntervalMs) {
        const candle = tfCache.get(ts);

        if (candle && candle.asset === asset) {
            cached.push(candle);
            if (gapStart !== null) {
                missing.push({ start: gapStart, end: ts });
                gapStart = null;
            }
        } else if (gapStart === null) {
            gapStart = ts;
        }
    }

    if (gapStart !== null) {
        missing.push({ start: gapStart, end: normalizedEnd });
    }

    return { cached, missing };
}

function cacheToArray(tfCache: Map<number, CandleData>, asset: string) {
    return Array.from(tfCache.values())
        .filter((c) => c.asset === asset)
        .sort((a, b) => a.start - b.start);
}

function buildCustomRangeISO(
    startParts: CustomDateParts,
    endParts: CustomDateParts
) {
    const now = Date.now();
    const startMsRaw = partsToMs(startParts);
    const endMsRaw = partsToMs(endParts);

    const startMs = Math.min(startMsRaw, now);
    let endMs = Math.min(endMsRaw, now);

    if (endMs <= startMs) {
        endMs = Math.min(now, startMs + 60 * 60 * 1000);
    }

    return {
        start: new Date(startMs).toISOString().slice(0, 16),
        end: new Date(endMs).toISOString().slice(0, 16),
    };
}

async function loadCandles(
    source: DataSource,
    tf: TimeFrame,
    startMs: number,
    endMs: number,
    asset: string,
    quoteAsset: string,
    setCached?: (c: CandleData[]) => void,
    signal?: AbortSignal
): Promise<CandleData[]> {
    if (!asset?.trim()) return [];

    const normalizedAsset = asset.trim().toUpperCase();
    const normalizedQuote =
        quoteAsset.trim().toUpperCase() || DEFAULT_QUOTE_ASSET;

    const candleIntervalMs = TF_TO_MS[tf];
    const prefetchBuffer = 200 * candleIntervalMs;

    let rangeStart = Math.max(0, startMs - prefetchBuffer);
    let rangeEnd = Math.min(Date.now(), endMs + prefetchBuffer);

    if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) {
        rangeEnd = Date.now();
        rangeStart = rangeEnd - 30 * 24 * 60 * 60 * 1000;
    }

    const { normalizedStart, normalizedEnd } = normalizeRange(
        rangeStart,
        rangeEnd,
        candleIntervalMs
    );
    const expectedCandles = Math.ceil(
        (normalizedEnd - normalizedStart) / candleIntervalMs
    );
    const tfCache = getTimeframeCache(
        source,
        normalizedAsset,
        normalizedQuote,
        tf
    );
    const { cached, missing } = collectCachedCandles(
        tfCache,
        normalizedAsset,
        normalizedStart,
        normalizedEnd,
        candleIntervalMs
    );
    const fullCache = cacheToArray(tfCache, normalizedAsset);
    if (setCached) {
        setCached(fullCache);
    }

    // Serve straight from cache when we already have full coverage
    if (missing.length === 0 && cached.length > 0) {
        return fullCache;
    }

    const abortError = () =>
        typeof DOMException === "undefined"
            ? new Error("Aborted")
            : new DOMException("Aborted", "AbortError");

    for (const segment of missing) {
        if (signal?.aborted) throw abortError();
        const data = await fetchCandles(
            source,
            normalizedAsset,
            normalizedQuote,
            segment.start,
            segment.end,
            tf,
            signal
        );

        for (const candle of data) {
            tfCache.set(candle.start, candle);
        }
    }

    const merged = cacheToArray(tfCache, normalizedAsset);

    return merged;
}

type KwantChartContentProps = {
    asset?: string;
    dataSource?: DataSource;
    quoteAsset?: string;
    title?: string;
    width?: number | string;
    height?: number | string;
    backgroundColor?: string;
    gridColor?: string;
    secondaryColor?: string;
    crosshairColor?: string;
};

const normalizeSize = (value?: number | string, fallback = "100%") => {
    if (value === undefined) return fallback;
    return typeof value === "number" ? `${value}px` : value;
};

function KwantChartContent({
    asset = "BTC",
    dataSource = DEFAULT_DATA_SOURCE,
    quoteAsset = DEFAULT_QUOTE_ASSET,
    title,
    width,
    height,
    backgroundColor,
    gridColor,
    secondaryColor,
    crosshairColor,
}: KwantChartContentProps) {
    const { startTime, endTime, setTimeRange } = useChartContext();

    const defaultStartParts = useMemo(
        () => dateToParts(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        []
    );
    const defaultEndParts = useMemo(() => dateToParts(new Date()), []);

    const [timeframe, setTimeframe] = useState<TimeFrame>("hour4");
    const [candleData, setCandleData] = useState<CandleData[]>([]);
    const [showDatePicker, setShowDatePicker] = useState(true);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
        "idle"
    );
    const [loadError, setLoadError] = useState("");
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [selectedExchange, setSelectedExchange] = useState<ExchangeId>(
        dataSource.exchange
    );
    const [selectedMarket, setSelectedMarket] = useState<MarketType>(
        dataSource.market
    );

    const [rangePreset, setRangePreset] = useState<RangePreset>("30D");
    const [customStartParts, setCustomStartParts] =
        useState<CustomDateParts>(defaultStartParts);
    const [customEndParts, setCustomEndParts] =
        useState<CustomDateParts>(defaultEndParts);
    const [committedStartParts, setCommittedStartParts] =
        useState<CustomDateParts>(defaultStartParts);
    const [committedEndParts, setCommittedEndParts] =
        useState<CustomDateParts>(defaultEndParts);
    const updateStartParts = (updates: Partial<CustomDateParts>) => {
        setCustomStartParts((prev) => normalizeParts({ ...prev, ...updates }));
    };
    const updateEndParts = (updates: Partial<CustomDateParts>) => {
        setCustomEndParts((prev) => normalizeParts({ ...prev, ...updates }));
    };
    const confirmCustomRange = () => {
        const range = buildCustomRangeISO(customStartParts, customEndParts);
        setCommittedStartParts(customStartParts);
        setCommittedEndParts(customEndParts);
        const startMs = new Date(range.start).getTime();
        const endMs = new Date(range.end).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
            setTimeRange(startMs, endMs);
        }
    };

    const applyPresetTimeRange = useCallback(
        (preset: RangePreset) => {
            const now = Date.now();
            switch (preset) {
                case "24H":
                    setTimeRange(now - 24 * 60 * 60 * 1000, now);
                    break;
                case "7D":
                    setTimeRange(now - 7 * 24 * 60 * 60 * 1000, now);
                    break;
                case "30D":
                    setTimeRange(now - 30 * 24 * 60 * 60 * 1000, now);
                    break;
                case "YTD": {
                    const current = new Date();
                    const startOfYear = Date.UTC(
                        current.getUTCFullYear(),
                        0,
                        1
                    );
                    setTimeRange(startOfYear, now);
                    break;
                }
                default:
                    // CUSTOM handled separately
                    break;
            }
        },
        [setTimeRange]
    );

    const handlePresetSelect = (preset: RangePreset) => {
        if (preset === rangePreset) return;
        setRangePreset(preset);

        const tfForPreset = PRESET_DEFAULT_TF[preset];
        if (tfForPreset) {
            setTimeframe(tfForPreset);
        }

        if (preset !== "CUSTOM") {
            applyPresetTimeRange(preset);
        }
    };

    useEffect(() => {
        const markets = getMarketsForExchange(dataSource.exchange);
        setSelectedExchange(dataSource.exchange);
        setSelectedMarket(
            markets.includes(dataSource.market)
                ? dataSource.market
                : markets[0] ?? DEFAULT_DATA_SOURCE.market
        );
    }, [dataSource.exchange, dataSource.market]);

    const handleExchangeChange = (
        event: React.ChangeEvent<HTMLSelectElement>
    ) => {
        const nextExchange = event.target.value as ExchangeId;
        const supportedMarkets = getMarketsForExchange(nextExchange);
        setSelectedExchange(nextExchange);
        setSelectedMarket((current) =>
            supportedMarkets.includes(current)
                ? current
                : supportedMarkets[0] ?? DEFAULT_DATA_SOURCE.market
        );
    };

    const handleMarketChange = (
        event: React.ChangeEvent<HTMLSelectElement>
    ) => {
        setSelectedMarket(event.target.value as MarketType);
    };

    const selectedExchangeMarkets = useMemo(
        () => getMarketsForExchange(selectedExchange),
        [selectedExchange]
    );

    const selectedDataSource = useMemo(
        () => ({
            exchange: selectedExchange,
            market: selectedMarket,
        }),
        [selectedExchange, selectedMarket]
    );

    const supportedTimeframes = useMemo(
        () =>
            TIMEFRAME_ORDER.filter((tf) =>
                isTimeframeSupported(selectedDataSource, tf)
            ),
        [selectedDataSource]
    );

    useEffect(() => {
        if (supportedTimeframes.length === 0) return;
        if (supportedTimeframes.includes(timeframe)) return;

        const currentMs = TF_TO_MS[timeframe];
        let closest = supportedTimeframes[0];
        let bestDiff = Math.abs(TF_TO_MS[closest] - currentMs);
        for (const candidate of supportedTimeframes) {
            const diff = Math.abs(TF_TO_MS[candidate] - currentMs);
            if (diff < bestDiff) {
                bestDiff = diff;
                closest = candidate;
            }
        }
        if (closest !== timeframe) {
            setTimeframe(closest);
        }
    }, [supportedTimeframes, timeframe]);

    const startDayOptions = getDaysInMonth(
        customStartParts.year,
        customStartParts.month
    );
    const endDayOptions = getDaysInMonth(
        customEndParts.year,
        customEndParts.month
    );
    const customRows = [
        {
            label: "Start",
            parts: customStartParts,
            update: updateStartParts,
            dayCount: startDayOptions,
        },
        {
            label: "End",
            parts: customEndParts,
            update: updateEndParts,
            dayCount: endDayOptions,
        },
    ] as const;

    const isCustomDirty = useMemo(() => {
        if (rangePreset !== "CUSTOM") return false;
        const partsEqual = (a: CustomDateParts, b: CustomDateParts) =>
            a.year === b.year &&
            a.month === b.month &&
            a.day === b.day &&
            a.time === b.time;

        return (
            !partsEqual(customStartParts, committedStartParts) ||
            !partsEqual(customEndParts, committedEndParts)
        );
    }, [
        rangePreset,
        customStartParts,
        committedStartParts,
        customEndParts,
        committedEndParts,
    ]);
    const applyButtonState: keyof typeof APPLY_BUTTON_CLASSES = isCustomDirty
        ? "enabled"
        : "disabled";

    useEffect(() => {
        if (rangePreset !== "CUSTOM") {
            applyPresetTimeRange(rangePreset);
        }
    }, [applyPresetTimeRange, rangePreset]);

    useEffect(() => {
        if (!asset) return;
        if (startTime <= 0 || endTime <= startTime) return;

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const requestId = ++requestIdRef.current;
        const isStale = () =>
            requestId !== requestIdRef.current || controller.signal.aborted;

        setLoadState("loading");
        setLoadError("");

        const timer = setTimeout(() => {
            (async () => {
                try {
                    const data = await loadCandles(
                        selectedDataSource,
                        timeframe,
                        startTime,
                        endTime,
                        asset,
                        quoteAsset,
                        (cached) => {
                            if (!isStale()) {
                                setCandleData(cached);
                            }
                        },
                        controller.signal
                    );
                    if (isStale()) return;
                    setCandleData(data);
                    setLoadState("idle");
                } catch (error) {
                    if (isStale()) return;
                    const isAbortError =
                        (typeof DOMException !== "undefined" &&
                            error instanceof DOMException &&
                            error.name === "AbortError") ||
                        (error instanceof Error &&
                            error.name === "AbortError");
                    if (isAbortError) return;
                    const message =
                        error instanceof Error && error.message
                            ? error.message
                            : "Failed to load data";
                    setLoadError(
                        message.length > 80
                            ? `${message.slice(0, 77)}...`
                            : message
                    );
                    setLoadState("error");
                }
            })();
        }, 200);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [
        startTime,
        endTime,
        timeframe,
        asset,
        quoteAsset,
        selectedDataSource,
    ]);

    const containerStyle = {
        width: normalizeSize(width),
        height: normalizeSize(height),
        minHeight: height === undefined ? "70vh" : undefined,
        ...(backgroundColor
            ? {
                  ["--kwant-chart-container-bg" as string]: backgroundColor,
              }
            : {}),
        ...(gridColor
            ? { ["--kwant-grid-color" as string]: gridColor }
            : {}),
        ...(secondaryColor
            ? {
                  ["--kwant-secondary" as string]: secondaryColor,
                  ["--kwant-secondary-text" as string]: secondaryColor,
                  ["--kwant-secondary-soft" as string]: `color-mix(in srgb, ${secondaryColor} 20%, transparent)`,
              }
            : {}),
        ...(crosshairColor
            ? { ["--kwant-crosshair-color" as string]: crosshairColor }
            : {}),
    };

    return (
        <div className="kwant-chart" style={containerStyle}>
            <div
                className="mb-30 flex h-full w-full flex-grow flex-col rounded-lg p-4 tracking-widest"
                style={{
                    backgroundColor:
                        "var(--kwant-chart-container-bg, rgba(255,255,255,0.1))",
                }}
            >
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="kwant-secondary-text rounded bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                            {title || "Kwant Chart"}
                        </div>
                        <h2 className="text-xl font-semibold tracking-wide">
                            {asset}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded border border-white/30 bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                            <select
                                aria-label="Exchange"
                                value={selectedExchange}
                                onChange={handleExchangeChange}
                                className="rounded border border-white/30 bg-black/70 px-2 py-1 text-xs uppercase tracking-[0.2em] text-white"
                            >
                                {EXCHANGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label="Market"
                                value={selectedMarket}
                                onChange={handleMarketChange}
                                className="rounded border border-white/30 bg-black/70 px-2 py-1 text-xs uppercase tracking-[0.2em] text-white"
                            >
                                {MARKET_OPTIONS.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        disabled={
                                            !selectedExchangeMarkets.includes(
                                                option.value
                                            )
                                        }
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {RANGE_PRESETS.map((preset) => {
                            const presetState: keyof typeof RANGE_PRESET_BUTTON_CLASSES =
                                rangePreset === preset.id ? "active" : "inactive";
                            return (
                                <button
                                    key={preset.id}
                                    className={RANGE_PRESET_BUTTON_CLASSES[presetState]}
                                    onClick={() => {
                                        handlePresetSelect(preset.id);
                                        setShowDatePicker(true);
                                    }}
                                >
                                    {preset.label}
                                </button>
                            );
                        })}
                        {loadState !== "idle" && (
                            <div
                                aria-live="polite"
                                title={loadState === "error" ? loadError : undefined}
                                className={
                                    loadState === "loading"
                                        ? "kwant-status kwant-status-loading"
                                        : "kwant-status kwant-status-error"
                                }
                            >
                                <span className="kwant-status-dot" />
                                <span>
                                    {loadState === "loading"
                                        ? "Loading"
                                        : "Data error"}
                                </span>
                            </div>
                        )}
                </div>
            </div>
            </div>

            {rangePreset === "CUSTOM" && showDatePicker && (
                <div className="flex flex-wrap gap-4 border-b border-white/10 bg-black/50 px-4 py-3 text-sm text-white">
                    {customRows.map((item) => (
                        <div
                            key={item.label}
                            className="flex flex-wrap items-center gap-2"
                        >
                            <span className="w-14 text-xs tracking-wide text-white/60 uppercase">
                                {item.label}
                            </span>
                            <select
                                value={item.parts.year}
                                onChange={(e) =>
                                    item.update({ year: Number(e.target.value) })
                                }
                                className="rounded border border-white/30 bg-black/70 p-1"
                            >
                                {YEARS.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={item.parts.month}
                                onChange={(e) =>
                                    item.update({
                                        month: Number(e.target.value),
                                    })
                                }
                                className="rounded border border-white/30 bg-black/70 p-1"
                            >
                                {MONTHS.map((month) => (
                                    <option key={month.value} value={month.value}>
                                        {month.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={item.parts.day}
                                onChange={(e) =>
                                    item.update({ day: Number(e.target.value) })
                                }
                                className="rounded border border-white/30 bg-black/70 p-1"
                            >
                                {Array.from(
                                    { length: item.dayCount },
                                    (_, idx) => idx + 1
                                ).map((day) => (
                                    <option key={day} value={day}>
                                        {day}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="time"
                                value={item.parts.time}
                                onChange={(e) =>
                                    item.update({ time: e.target.value })
                                }
                                className="w-[115px] rounded border border-white/30 bg-gray-600/70 p-1"
                            />
                            <span className="text-xs text-white/50">UTC</span>
                        </div>
                    ))}

                    <button
                        onClick={() => {
                            confirmCustomRange();
                            setShowDatePicker(false);
                        }}
                        disabled={!isCustomDirty}
                        className={APPLY_BUTTON_CLASSES[applyButtonState]}
                    >
                        Apply
                    </button>
                </div>
            )}

            <div className="flex flex-1 flex-col p-4">
                <div className="z-5 grid w-full grid-cols-13 bg-black/70 text-center tracking-normal">
                    {Object.entries(TIMEFRAME_CAMELCASE).map(([short, tf]) => {
                        const isSupported = supportedTimeframes.includes(tf);
                        const labelState: keyof typeof TIMEFRAME_LABEL_CLASSES =
                            !isSupported
                                ? "disabled"
                                : timeframe === tf
                                  ? "active"
                                  : "inactive";
                        const cellClasses = isSupported
                            ? "cursor-pointer border-b-2 border-black py-2 hover:bg-black"
                            : "cursor-not-allowed border-b-2 border-black py-2 text-white/30";
                        return (
                            <div
                                className={cellClasses}
                                key={short}
                                aria-disabled={!isSupported}
                                title={
                                    isSupported
                                        ? undefined
                                        : "Not supported by selected source"
                                }
                                onClick={() => {
                                    if (isSupported) {
                                        setTimeframe(tf);
                                    }
                                }}
                            >
                                <span
                                    className={TIMEFRAME_LABEL_CLASSES[labelState]}
                                >
                                    {short}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div
                    className="flex-1 rounded-b-lg border-2 border-black/30 z-1"
                    style={{
                        backgroundColor:
                            "var(--kwant-grid-color, #111212)",
                    }}
                >
                    <ChartContainer
                        asset={asset}
                        tf={timeframe}
                        settingInterval={false}
                        candleData={candleData}
                    />
                </div>
            </div>
        </div>
    );
}

type KwantChartProps = {
    asset?: string;
    dataSource?: DataSource;
    quoteAsset?: string;
    title?: string;
    width?: number | string;
    height?: number | string;
    backgroundColor?: string;
    gridColor?: string;
    secondaryColor?: string;
    crosshairColor?: string;
};

export default function KwantChart({
    asset,
    dataSource,
    quoteAsset,
    title,
    width=1200,
    height=700,
    backgroundColor,
    gridColor,
    secondaryColor,
    crosshairColor,
}: KwantChartProps) {
    return (
        <ChartProvider>
            <KwantChartContent
                asset={asset}
                dataSource={dataSource}
                quoteAsset={quoteAsset}
                title={title}
                width={width}
                height={height}
                backgroundColor={backgroundColor}
                gridColor={gridColor}
                secondaryColor={secondaryColor}
                crosshairColor={crosshairColor}
            />
        </ChartProvider>
    );
}
