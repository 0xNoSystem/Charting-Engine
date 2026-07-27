import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartProvider, { useChartContext } from "./chart/ChartContext";
import ChartContainer from "./chart/ChartContainer";
import { getTimeframeCache, peekTimeframeCache } from "./chart/candleCache";
import {
    DEFAULT_CANDLE_COLORS,
    DEFAULT_CHART_APPEARANCE,
    type ChartAppearance,
    type ChartSettingsValue,
    type CrosshairLineStyle,
} from "./chart/visual/ChartSettings";
import type { CandleData, TimeFrame } from "./types";
import { TIMEFRAME_CAMELCASE } from "./types";

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
const SETTINGS_STORAGE_PREFIX = "kwant-chart:settings:";

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

const cloneCandle = (candle: CandleData): CandleData => ({ ...candle });

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

function isValidCandle(candle: CandleData): boolean {
    const numericValues = [
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.start,
        candle.end,
        candle.volume,
        candle.trades,
    ];
    if (!numericValues.every(Number.isFinite) || candle.end <= candle.start) {
        return false;
    }
    if (candle.volume < 0 || candle.trades < 0) return false;
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
        return false;
    }
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
        return false;
    }
    return Boolean(candle.asset?.trim() && candle.interval);
}

function normalizeCandles(candles: CandleData[]) {
    const grouped = new Map<TimeFrame, Map<number, CandleData>>();

    for (const candle of candles) {
        const timeframe = TIMEFRAME_BY_INTERVAL.get(candle.interval);
        if (!timeframe || !isValidCandle(candle)) continue;
        let byTimestamp = grouped.get(timeframe);
        if (!byTimestamp) {
            byTimestamp = new Map();
            grouped.set(timeframe, byTimestamp);
        }
        // Later entries deliberately replace earlier corrections for the same bar.
        byTimestamp.set(candle.start, cloneCandle(candle));
    }

    return new Map(
        Array.from(grouped, ([timeframe, byTimestamp]) => [
            timeframe,
            Array.from(byTimestamp.values()).sort((a, b) => a.start - b.start),
        ])
    );
}

function getCachedCandles(sourceName: string, timeframe: TimeFrame) {
    return Array.from(
        peekTimeframeCache(sourceName, timeframe)?.values() ?? []
    ).sort((a, b) => a.start - b.start);
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
    /** Required caller-owned HLOCV candles. Intervals use values such as 1m, 1h, and 1d. */
    hlocv_data: CandleData[];
    /** Displayed in place of the former exchange/market controls and used as the cache namespace. */
    source_name?: string;
    /** Show the source name in the chart header. Defaults to false. */
    show_source?: boolean;
    /** Opt in to retained, timestamp-upserted candles for the named source. Defaults to false. */
    enable_caching?: boolean;
    /** Optional display label; defaults to the selected candle series' asset. */
    asset?: string;
    title?: string;
    width?: number | string;
    height?: number | string;
    backgroundColor?: string;
    gridColor?: string;
    secondaryColor?: string;
    crosshairColor?: string;
    crosshairLineStyle?: CrosshairLineStyle;
    /** Show the latest candle close as a dotted line and price-scale label. Defaults to false. */
    live_price?: boolean;
    /** Allow users to change runtime chart colors through the settings control. Defaults to true. */
    configurable?: boolean;
}

type KwantChartContentProps = Omit<KwantChartProps, "width" | "height"> & {
    width?: number | string;
    height?: number | string;
};

function KwantChartContent({
    hlocv_data,
    source_name,
    show_source = false,
    enable_caching = false,
    asset,
    title,
    width,
    height,
    backgroundColor,
    gridColor,
    secondaryColor,
    crosshairColor,
    crosshairLineStyle,
    live_price = false,
    configurable = true,
}: KwantChartContentProps) {
    const {
        startTime,
        endTime,
        setTimeRange,
        candleColor,
        setCandleColor,
    } = useChartContext();
    const [timeframe, setTimeframe] = useState<TimeFrame>("hour4");
    const [rangePreset, setRangePreset] = useState<RangePreset>("30D");
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [cacheRevision, setCacheRevision] = useState(0);
    const defaultAppearance = useMemo<ChartAppearance>(
        () => ({
            backgroundColor:
                backgroundColor ?? DEFAULT_CHART_APPEARANCE.backgroundColor,
            gridColor: gridColor ?? DEFAULT_CHART_APPEARANCE.gridColor,
            secondaryColor:
                secondaryColor ?? DEFAULT_CHART_APPEARANCE.secondaryColor,
            crosshairColor:
                crosshairColor ?? DEFAULT_CHART_APPEARANCE.crosshairColor,
            crosshairLineStyle:
                crosshairLineStyle ??
                DEFAULT_CHART_APPEARANCE.crosshairLineStyle,
        }),
        [
            backgroundColor,
            crosshairColor,
            crosshairLineStyle,
            gridColor,
            secondaryColor,
        ]
    );
    const [appearance, setAppearance] = useState<ChartAppearance>(
        defaultAppearance
    );
    const previousTimeframe = useRef<TimeFrame | null>(null);

    useEffect(() => {
        setAppearance(defaultAppearance);
    }, [defaultAppearance]);

    const normalizedSourceName = source_name?.trim() || "";
    const sourceNameCharacters = Array.from(normalizedSourceName);
    const sourceNameLabel =
        sourceNameCharacters.length > 10
            ? `${sourceNameCharacters.slice(0, 10).join("")}...`
            : normalizedSourceName;
    const settingsScope =
        normalizedSourceName ||
        asset?.trim() ||
        hlocv_data[0]?.asset?.trim() ||
        "default";
    const settingsStorageKey = `${SETTINGS_STORAGE_PREFIX}${settingsScope}`;
    const developerSettings = useMemo<ChartSettingsValue>(
        () => ({
            candles: DEFAULT_CANDLE_COLORS,
            appearance: defaultAppearance,
        }),
        [defaultAppearance]
    );
    const applySettings = useCallback(
        (value: ChartSettingsValue) => {
            setCandleColor(value.candles.up, value.candles.down);
            setAppearance(value.appearance);
        },
        [setCandleColor]
    );

    useEffect(() => {
        if (!configurable || typeof window === "undefined") {
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
        configurable,
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

    const canUseCache = enable_caching && Boolean(normalizedSourceName);
    const normalizedCandles = useMemo(
        () => normalizeCandles(hlocv_data),
        [hlocv_data]
    );

    useEffect(() => {
        if (!canUseCache) return;

        for (const [frame, candles] of normalizedCandles) {
            const cache = getTimeframeCache(normalizedSourceName, frame);
            for (const candle of candles) {
                cache.set(candle.start, cloneCandle(candle));
            }
        }
        setCacheRevision((revision) => revision + 1);
    }, [canUseCache, normalizedCandles, normalizedSourceName]);

    const candlesByTimeframe = useMemo(() => {
        if (!canUseCache) return normalizedCandles;

        return new Map(
            Array.from(normalizedCandles.keys(), (frame) => [
                frame,
                getCachedCandles(normalizedSourceName, frame),
            ])
        );
    }, [cacheRevision, canUseCache, normalizedCandles, normalizedSourceName]);

    const supportedTimeframes = useMemo(
        () => TIMEFRAME_ORDER.filter((frame) => candlesByTimeframe.has(frame)),
        [candlesByTimeframe]
    );

    useEffect(() => {
        if (
            supportedTimeframes.length > 0 &&
            !supportedTimeframes.includes(timeframe)
        ) {
            setTimeframe(supportedTimeframes[0]);
        }
    }, [supportedTimeframes, timeframe]);

    const candleData = candlesByTimeframe.get(timeframe) ?? [];
    const assetLabel = asset?.trim() || candleData[0]?.asset || "Chart";

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
        ["--kwant-secondary" as string]: appearance.secondaryColor,
        ["--kwant-secondary-text" as string]: appearance.secondaryColor,
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
                className="mb-30 flex h-full w-full flex-grow flex-col rounded-lg px-3 py-3 tracking-widest"
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
                        {show_source && normalizedSourceName && (
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

                <div className="flex flex-1 flex-col px-3 py-3">
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
                                    onClick={() => setTimeframe(frame)}
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
                        className="z-1 flex-1 overflow-hidden border-black/30"
                        style={{
                            backgroundColor: "var(--kwant-grid-color, #111212)",
                        }}
                    >
                        <ChartContainer
                            asset={assetLabel}
                            tf={timeframe}
                            settingInterval={false}
                            candleData={candleData}
                            livePrice={live_price}
                            configurable={configurable}
                            settingsValue={{
                                candles: candleColor,
                                appearance,
                            }}
                            defaultSettingsValue={{
                                candles: DEFAULT_CANDLE_COLORS,
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

    return (
        <div style={{ width: containerWidth, height: containerHeight }}>
            <ChartProvider>
                <KwantChartContent {...props} width="100%" height="100%" />
            </ChartProvider>
        </div>
    );
}
