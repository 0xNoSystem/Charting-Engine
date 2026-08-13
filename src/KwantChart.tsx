import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartProvider, { useChartContext } from "./chart/ChartContext";
import ChartContainer from "./chart/ChartContainer";
import { normalizeCandleSeries, upsertSorted } from "./core/data";
import {
    DEFAULT_CANDLE_COLORS,
    DEFAULT_CHART_APPEARANCE,
    type ChartAppearance,
    type ChartSettingsValue,
} from "./chart/visual/ChartSettings";
import type {
    CandleData,
    CandleInterval,
    CandlePoint,
    CandleSeries,
    DataIssueReport,
    DataMode,
    InvalidDataBehavior,
    KwantTheme,
    TimeFormatter,
    TimeFrame,
    TimeRange,
    TimeZoneMode,
    ValueFormatter,
} from "./types";
import {
    KwantDataError,
    TIMEFRAME_CAMELCASE,
    TIMEFRAME_INTERVAL,
} from "./types";
import { nearestIndex } from "./core/search";
import { xToTime } from "./chart/utils";

type RangePreset = "24H" | "7D" | "30D" | "YTD" | "CUSTOM";

const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
    { id: "24H", label: "24H" },
    { id: "7D", label: "7D" },
    { id: "30D", label: "30D" },
    { id: "YTD", label: "YTD" },
    { id: "CUSTOM", label: "Custom" },
];

const TIMEFRAME_ORDER = Object.values(TIMEFRAME_CAMELCASE) as TimeFrame[];
const TIMEFRAME_BY_INTERVAL = new Map<string, TimeFrame>(
    Object.entries(TIMEFRAME_CAMELCASE).map(([interval, timeframe]) => [
        interval,
        timeframe,
    ])
);
const EMPTY_CANDLES: CandleData[] = [];
const SETTINGS_STORAGE_PREFIX = "kwant:v3:settings:";

const RANGE_PRESET_BUTTON_CLASSES = {
    active: "kwant-secondary-border kwant-secondary-text kwant-secondary-hover rounded border transition",
    inactive:
        "rounded border transition border-white/30 text-white/70 hover:border-white/60",
} as const;

const TIMEFRAME_LABEL_CLASSES = {
    active: "kwant-secondary-text font-bold",
    inactive: "text-white/70",
    disabled: "text-white/30",
} as const;

const normalizeSize = (value?: number | string, fallback = "100%") => {
    if (value === undefined) return fallback;
    return typeof value === "number" ? `${value}px` : value;
};

function getContrastTextColor(color: string) {
    const value = color.trim();
    const hexMatch = value.match(
        /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i
    );
    let channels: number[] | null = null;

    if (hexMatch) {
        const raw = hexMatch[1];
        const expanded =
            raw.length <= 4
                ? raw
                      .split("")
                      .map((part) => `${part}${part}`)
                      .join("")
                : raw;
        channels = [0, 2, 4].map((offset) =>
            Number.parseInt(expanded.slice(offset, offset + 2), 16)
        );
    } else {
        const rgbMatch = value.match(
            /^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)/i
        );
        if (rgbMatch) {
            channels = rgbMatch.slice(1, 4).map(Number);
        }
    }

    if (!channels || channels.some((channel) => !Number.isFinite(channel))) {
        return "#ffffff";
    }

    const [red, green, blue] = channels.map((channel) => {
        const normalized = Math.min(255, Math.max(0, channel)) / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const whiteContrast = 1.05 / (luminance + 0.05);
    const darkContrast = (luminance + 0.05) / 0.05;

    return darkContrast > whiteContrast ? "#090b10" : "#ffffff";
}

function isChartSettingsValue(value: unknown): value is ChartSettingsValue {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ChartSettingsValue>;
    return Boolean(
        candidate.candles &&
            typeof candidate.candles.up === "string" &&
            typeof candidate.candles.down === "string" &&
            candidate.appearance &&
            typeof candidate.appearance.backgroundColor === "string" &&
            typeof candidate.appearance.gridColor === "string" &&
            typeof candidate.appearance.secondaryColor === "string" &&
            typeof candidate.appearance.crosshairColor === "string" &&
            (candidate.appearance.crosshairLineStyle === "solid" ||
                candidate.appearance.crosshairLineStyle === "dashed" ||
                candidate.appearance.crosshairLineStyle === "dotted")
    );
}

function getSeriesBounds(candles: CandleData[]) {
    let start = Infinity;
    let end = -Infinity;
    for (const candle of candles) {
        start = Math.min(start, candle.start);
        end = Math.max(end, candle.end);
    }
    return { start, end };
}

const toDateTimeLocal = (ms: number) => {
    const date = new Date(ms);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export interface KwantChartProps {
    /** Caller-owned candle series grouped by interval. */
    series: readonly CandleSeries[];
    /** Optional source label. */
    sourceName?: string;
    /** Show the source name in the chart header. Defaults to false. */
    showSource?: boolean;
    asset?: string;
    title?: string;
    width?: number | string;
    height?: number | string;
    theme?: Partial<KwantTheme>;
    /** Show the latest candle close as a dotted line and price-scale label. Defaults to false. */
    livePrice?: boolean;
    /** Show runtime appearance settings. Defaults to true. */
    showSettings?: boolean;
    interval?: CandleInterval;
    defaultInterval?: CandleInterval;
    onIntervalChange?: (interval: CandleInterval) => void;
    dataMode?: DataMode;
    dataKey?: string | number;
    maxPointsPerSeries?: number;
    invalidDataBehavior?: InvalidDataBehavior;
    onDataIssues?: (report: DataIssueReport) => void;
    onVisibleRangeChange?: (range: TimeRange) => void;
    onCrosshairChange?: (candle: CandlePoint | null) => void;
    priceFormatter?: ValueFormatter;
    volumeFormatter?: ValueFormatter;
    timeFormatter?: TimeFormatter;
    locale?: string;
    timeZone?: TimeZoneMode;
}

type KwantChartContentProps = Omit<KwantChartProps, "width" | "height"> & {
    width?: number | string;
    height?: number | string;
};

function KwantChartContent({
    series,
    sourceName,
    showSource = false,
    asset,
    title,
    width,
    height,
    theme,
    livePrice = false,
    showSettings = true,
    interval,
    defaultInterval,
    onIntervalChange,
    dataMode = "replace",
    dataKey,
    maxPointsPerSeries = 50_000,
    invalidDataBehavior = "filter",
    onDataIssues,
    onVisibleRangeChange,
    onCrosshairChange,
    priceFormatter,
    volumeFormatter,
    timeFormatter,
    locale = "en-US",
    timeZone = "UTC",
}: KwantChartContentProps) {
    const {
        startTime,
        endTime,
        setTimeRange,
        candleColor,
        setCandleColor,
        crosshairX,
        width: chartWidth,
        mouseOnChart,
    } = useChartContext();
    const [uncontrolledTimeframe, setUncontrolledTimeframe] =
        useState<TimeFrame>(() =>
            (defaultInterval
                ? TIMEFRAME_CAMELCASE[defaultInterval]
                : undefined) ??
            (series[0]
                ? TIMEFRAME_CAMELCASE[series[0].interval]
                : undefined) ??
            "hour4"
        );
    const timeframe = interval
        ? TIMEFRAME_CAMELCASE[interval]
        : uncontrolledTimeframe;
    const selectTimeframe = useCallback(
        (next: TimeFrame) => {
            if (!interval) setUncontrolledTimeframe(next);
            onIntervalChange?.(TIMEFRAME_INTERVAL[next]);
        },
        [interval, onIntervalChange]
    );
    const [rangePreset, setRangePreset] = useState<RangePreset>("30D");
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const defaultAppearance = useMemo<ChartAppearance>(
        () => ({
            backgroundColor:
                theme?.containerBackground ??
                DEFAULT_CHART_APPEARANCE.backgroundColor,
            gridColor:
                theme?.plotBackground ?? DEFAULT_CHART_APPEARANCE.gridColor,
            secondaryColor:
                theme?.accentColor ?? DEFAULT_CHART_APPEARANCE.secondaryColor,
            crosshairColor:
                theme?.crosshairColor ??
                DEFAULT_CHART_APPEARANCE.crosshairColor,
            crosshairLineStyle:
                theme?.crosshairLineStyle ??
                DEFAULT_CHART_APPEARANCE.crosshairLineStyle,
        }),
        [
            theme?.accentColor,
            theme?.containerBackground,
            theme?.crosshairColor,
            theme?.crosshairLineStyle,
            theme?.plotBackground,
        ]
    );
    const [appearance, setAppearance] = useState<ChartAppearance>(
        defaultAppearance
    );
    const previousTimeframe = useRef<TimeFrame | null>(null);

    useEffect(() => {
        setAppearance(defaultAppearance);
    }, [defaultAppearance]);

    const normalizedSourceName = sourceName?.trim() || "";
    const sourceNameCharacters = Array.from(normalizedSourceName);
    const sourceNameLabel =
        sourceNameCharacters.length > 20
            ? `${sourceNameCharacters.slice(0, 20).join("")}...`
            : normalizedSourceName;
    const settingsScope =
        normalizedSourceName ||
        asset?.trim() ||
        "default";
    const settingsStorageKey = `${SETTINGS_STORAGE_PREFIX}${settingsScope}`;
    const developerSettings = useMemo<ChartSettingsValue>(
        () => ({
            candles: {
                up: theme?.upColor ?? DEFAULT_CANDLE_COLORS.up,
                down: theme?.downColor ?? DEFAULT_CANDLE_COLORS.down,
            },
            appearance: defaultAppearance,
        }),
        [defaultAppearance, theme?.downColor, theme?.upColor]
    );
    const applySettings = useCallback(
        (value: ChartSettingsValue) => {
            setCandleColor(value.candles.up, value.candles.down);
            setAppearance(value.appearance);
        },
        [setCandleColor]
    );

    useEffect(() => {
        if (!showSettings || typeof window === "undefined") {
            applySettings(developerSettings);
            return;
        }

        try {
            const stored = window.localStorage.getItem(settingsStorageKey);
            if (!stored) {
                applySettings(developerSettings);
                return;
            }
            const parsed: unknown = JSON.parse(stored);
            if (isChartSettingsValue(parsed)) {
                applySettings(parsed);
            } else {
                window.localStorage.removeItem(settingsStorageKey);
                applySettings(developerSettings);
            }
        } catch {
            applySettings(developerSettings);
        }
    }, [
        applySettings,
        showSettings,
        developerSettings,
        settingsStorageKey,
    ]);

    const saveSettings = useCallback(() => {
        if (typeof window === "undefined") return false;
        try {
            window.localStorage.setItem(
                settingsStorageKey,
                JSON.stringify({
                    candles: candleColor,
                    appearance,
                } satisfies ChartSettingsValue)
            );
            return true;
        } catch {
            return false;
        }
    }, [appearance, candleColor, settingsStorageKey]);

    const resetSettings = useCallback(() => {
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem(settingsStorageKey);
            } catch {
                // Storage may be unavailable; resetting the live chart still works.
            }
        }
        applySettings(developerSettings);
    }, [applySettings, developerSettings, settingsStorageKey]);

    const assetLabel = asset?.trim() || "Chart";
    const normalizedInput = useMemo(
        () => normalizeCandleSeries(series, assetLabel),
        [assetLabel, series]
    );
    if (normalizedInput.report && invalidDataBehavior === "throw") {
        throw new KwantDataError(normalizedInput.report);
    }
    useEffect(() => {
        if (normalizedInput.report) onDataIssues?.(normalizedInput.report);
    }, [normalizedInput.report, onDataIssues]);

    const normalizedCandles = useMemo(
        () =>
            new Map<TimeFrame, CandleData[]>(
                Array.from(normalizedInput.byInterval, ([short, candles]) => [
                    TIMEFRAME_BY_INTERVAL.get(short)!,
                    candles,
                ])
            ),
        [normalizedInput.byInterval]
    );
    const [retainedCandles, setRetainedCandles] = useState(
        () =>
            new Map<TimeFrame, CandleData[]>(
                Array.from(normalizedCandles, ([frame, candles]) => [
                    frame,
                    dataMode === "upsert"
                        ? upsertSorted(
                              [],
                              candles,
                              (candle) => candle.start,
                              maxPointsPerSeries
                          )
                        : candles,
                ])
            )
    );
    const retainedDataKey = useRef(dataKey);
    useEffect(() => {
        setRetainedCandles((previous) => {
            const reset = retainedDataKey.current !== dataKey;
            retainedDataKey.current = dataKey;
            if (dataMode === "replace" || reset) {
                return new Map(normalizedCandles);
            }
            const next = new Map(previous);
            for (const [frame, candles] of normalizedCandles) {
                next.set(
                    frame,
                    upsertSorted(
                        previous.get(frame) ?? [],
                        candles,
                        (candle) => candle.start,
                        maxPointsPerSeries
                    )
                );
            }
            return next;
        });
    }, [dataKey, dataMode, maxPointsPerSeries, normalizedCandles]);

    const candlesByTimeframe =
        dataMode === "replace" ? normalizedCandles : retainedCandles;

    const supportedTimeframes = useMemo(
        () => TIMEFRAME_ORDER.filter((frame) => candlesByTimeframe.has(frame)),
        [candlesByTimeframe]
    );

    useEffect(() => {
        if (
            supportedTimeframes.length > 0 &&
            !supportedTimeframes.includes(timeframe)
        ) {
            if (!interval) selectTimeframe(supportedTimeframes[0]);
        }
    }, [interval, selectTimeframe, supportedTimeframes, timeframe]);

    const candleData =
        candlesByTimeframe.get(timeframe) ?? EMPTY_CANDLES;

    useEffect(() => {
        if (
            !onCrosshairChange ||
            !mouseOnChart ||
            crosshairX === null ||
            chartWidth <= 0 ||
            endTime <= startTime ||
            !candleData.length
        ) {
            onCrosshairChange?.(null);
            return;
        }
        const time = xToTime(crosshairX, startTime, endTime, chartWidth);
        const index = nearestIndex(
            candleData,
            time,
            (candle) => (candle.start + candle.end) / 2
        );
        onCrosshairChange(index >= 0 ? candleData[index] : null);
    }, [
        candleData,
        chartWidth,
        crosshairX,
        endTime,
        mouseOnChart,
        onCrosshairChange,
        startTime,
    ]);

    useEffect(() => {
        if (endTime > startTime) {
            onVisibleRangeChange?.({ from: startTime, to: endTime });
        }
    }, [endTime, onVisibleRangeChange, startTime]);

    const applyPresetTimeRange = useCallback(
        (preset: Exclude<RangePreset, "CUSTOM">, data = candleData) => {
            if (!data.length) return;

            const { start: first, end: last } = getSeriesBounds(data);
            let start = first;
            if (preset === "24H") start = last - 24 * 60 * 60 * 1000;
            if (preset === "7D") start = last - 7 * 24 * 60 * 60 * 1000;
            if (preset === "30D") start = last - 30 * 24 * 60 * 60 * 1000;
            if (preset === "YTD") {
                const date = new Date(last);
                start = Date.UTC(date.getUTCFullYear(), 0, 1);
            }
            setTimeRange(Math.max(first, start), last);
        },
        [candleData, setTimeRange]
    );

    useEffect(() => {
        if (!candleData.length) return;

        const { start: first, end: last } = getSeriesBounds(candleData);
        const timeframeChanged = previousTimeframe.current !== timeframe;
        const outsideData = endTime <= startTime || endTime < first || startTime > last;
        if (rangePreset !== "CUSTOM" && (timeframeChanged || outsideData)) {
            applyPresetTimeRange(rangePreset, candleData);
        }
        previousTimeframe.current = timeframe;
    }, [
        applyPresetTimeRange,
        candleData,
        endTime,
        rangePreset,
        startTime,
        timeframe,
    ]);

    const selectPreset = (preset: RangePreset) => {
        setRangePreset(preset);
        setShowDatePicker(preset === "CUSTOM");
        if (preset !== "CUSTOM") applyPresetTimeRange(preset);
        if (preset === "CUSTOM" && candleData.length) {
            const { start, end } = getSeriesBounds(candleData);
            setCustomStart(toDateTimeLocal(start));
            setCustomEnd(toDateTimeLocal(end));
        }
    };

    const applyCustomRange = () => {
        const start = new Date(customStart).getTime();
        const end = new Date(customEnd).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            setTimeRange(start, end);
            setShowDatePicker(false);
        }
    };

    const containerStyle = {
        width: normalizeSize(width),
        height: normalizeSize(height),
        maxWidth: "100%",
        maxHeight: "100%",
        minHeight: height === undefined ? "70vh" : undefined,
        ["--kwant-chart-container-bg" as string]: appearance.backgroundColor,
        ["--kwant-grid-color" as string]: appearance.gridColor,
        ["--kwant-axis-grid-color" as string]:
            theme?.gridColor ?? "rgba(148, 163, 184, 0.24)",
        ["--kwant-secondary" as string]: appearance.secondaryColor,
        ["--kwant-secondary-text" as string]: appearance.secondaryColor,
        ["--kwant-secondary-contrast" as string]:
            getContrastTextColor(appearance.secondaryColor),
        ["--kwant-secondary-soft" as string]: `color-mix(in srgb, ${appearance.secondaryColor} 20%, transparent)`,
        ["--kwant-crosshair-color" as string]: appearance.crosshairColor,
        ["--kwant-crosshair-dash" as string]:
            appearance.crosshairLineStyle === "solid"
                ? "none"
                : appearance.crosshairLineStyle === "dotted"
                  ? "1 4"
                  : "6 4",
    };

    return (
        <div className="kwant-chart" style={containerStyle}>
            <div
                className="kwant-chart-shell mb-30 flex h-full w-full flex-grow flex-col rounded-lg px-3 py-3 tracking-widest"
                style={{
                    backgroundColor:
                        "var(--kwant-chart-container-bg, rgba(255,255,255,0.1))",
                }}
            >
                <div className="kwant-chart-header flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="kwant-chart-heading flex items-center gap-3">
                        <div className="kwant-secondary-text rounded bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                            {title || "Kwant Chart"}
                        </div>
                        <h2 className="kwant-secondary-text text-xl font-semibold tracking-wide">
                            {assetLabel}
                        </h2>
                    </div>
                    <div className="kwant-header-controls flex items-center gap-2">
                        {showSource && normalizedSourceName && (
                            <span
                                className="rounded border border-white/30 bg-black/70 px-2 py-1 text-xs tracking-wide text-white/70"
                                title={normalizedSourceName}
                            >
                                {sourceNameLabel}
                            </span>
                        )}
                        <div className="kwant-duration-presets">
                            {RANGE_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className={`kwant-duration-button ${
                                        RANGE_PRESET_BUTTON_CLASSES[
                                            rangePreset === preset.id
                                                ? "active"
                                                : "inactive"
                                        ]
                                    }`}
                                    onClick={() => selectPreset(preset.id)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {rangePreset === "CUSTOM" && showDatePicker && (
                    <div className="flex flex-wrap items-end gap-3 border-b border-white/10 bg-black/50 px-4 py-3 text-sm text-white">
                        <label className="flex flex-col gap-1 text-xs text-white/60">
                            Start
                            <input
                                type="datetime-local"
                                value={customStart}
                                onChange={(event) => setCustomStart(event.target.value)}
                                className="rounded border border-white/30 bg-black/70 p-1 text-white"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-white/60">
                            End
                            <input
                                type="datetime-local"
                                value={customEnd}
                                onChange={(event) => setCustomEnd(event.target.value)}
                                className="rounded border border-white/30 bg-black/70 p-1 text-white"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={applyCustomRange}
                            className="kwant-secondary-border kwant-secondary-text kwant-secondary-hover rounded border px-3 py-1 text-xs font-semibold transition"
                        >
                            Apply
                        </button>
                    </div>
                )}

                <div className="kwant-chart-content flex flex-1 flex-col px-3 py-3">
                    <div className="kwant-timeframe-bar z-5 bg-black/70 text-center tracking-normal">
                        {Object.entries(TIMEFRAME_CAMELCASE).map(([short, frame]) => {
                            const supported = supportedTimeframes.includes(frame);
                            const state = !supported
                                ? "disabled"
                                : timeframe === frame
                                  ? "active"
                                  : "inactive";
                            return (
                                <button
                                    key={short}
                                    type="button"
                                    disabled={!supported}
                                    title={
                                        supported
                                            ? undefined
                                            : "Not present in supplied data"
                                    }
                                    className={
                                        supported
                                            ? "kwant-timeframe-button cursor-pointer hover:bg-black"
                                            : "kwant-timeframe-button cursor-not-allowed"
                                    }
                                    onClick={() => selectTimeframe(frame)}
                                >
                                    <span
                                        className={`kwant-timeframe-label ${TIMEFRAME_LABEL_CLASSES[state]}`}
                                    >
                                        {short}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div
                        className="kwant-chart-plot z-1 flex-1 overflow-hidden border-black/30"
                        style={{
                            backgroundColor: "var(--kwant-grid-color, #111212)",
                        }}
                    >
                        <ChartContainer
                            asset={assetLabel}
                            tf={timeframe}
                            settingInterval={false}
                            candleData={candleData}
                            livePrice={livePrice}
                            configurable={showSettings}
                            settingsValue={{
                                candles: candleColor,
                                appearance,
                            }}
                            defaultSettingsValue={{
                                candles: developerSettings.candles,
                                appearance: defaultAppearance,
                            }}
                            onApplySettings={applySettings}
                            onResetSettings={resetSettings}
                            onSaveSettings={saveSettings}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
}

export default function KwantChart(props: KwantChartProps) {
    const containerWidth = normalizeSize(props.width, "100%");
    const containerHeight = normalizeSize(props.height, "70vh");
    const frameStyle = {
        width: containerWidth,
        ["--kwant-chart-frame-height" as string]: containerHeight,
    };

    return (
        <div className="kwant-chart-frame" style={frameStyle}>
            <ChartProvider
                locale={props.locale}
                timeZone={props.timeZone}
                priceFormatter={props.priceFormatter}
                volumeFormatter={props.volumeFormatter}
                timeFormatter={props.timeFormatter}
            >
                <KwantChartContent {...props} width="100%" height="100%" />
            </ChartProvider>
        </div>
    );
}
