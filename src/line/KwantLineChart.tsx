import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { normalizeLineData, upsertSorted } from "../core/data";
import { paddedDomain } from "../core/domain";
import { lowerBound, nearestIndex } from "../core/search";
import type {
    DataIssueReport,
    DataMode,
    InvalidDataBehavior,
    KwantTheme,
    LinePoint,
    TimeFormatter,
    TimeRange,
    TimeZoneMode,
    ValueFormatter,
} from "../types";
import { KwantDataError } from "../types";
import { downsampleLine, splitAtThreshold } from "./lineUtils";

export type LineScale = "time" | "linear";

export interface LineXAxisOptions {
    scale?: LineScale;
    label?: string;
    formatter?: TimeFormatter;
    domain?: readonly [number, number];
}

export interface LineYAxisOptions {
    label?: string;
    formatter?: ValueFormatter;
    domain?: readonly [number, number];
    includeZero?: boolean;
}

export type LineColorMode =
    | { type: "solid"; color: string }
    | {
          type: "threshold";
          value: number;
          aboveColor: string;
          belowColor: string;
          showThresholdLine?: boolean;
      };

export interface KwantLineChartProps {
    data: readonly LinePoint[];
    name?: string;
    title?: string;
    width?: number | string;
    height?: number | string;
    className?: string;
    ariaLabel?: string;
    layout?: "full" | "compact";
    variant?: "default" | "pnl";
    xAxis?: LineXAxisOptions;
    yAxis?: LineYAxisOptions;
    colorMode?: LineColorMode;
    strokeWidth?: number;
    areaFill?: false | { opacity?: number };
    hover?: boolean;
    dataMode?: DataMode;
    dataKey?: string | number;
    maxPoints?: number;
    invalidDataBehavior?: InvalidDataBehavior;
    onDataIssues?: (report: DataIssueReport) => void;
    onHover?: (point: LinePoint | null) => void;
    onVisibleRangeChange?: (range: TimeRange) => void;
    theme?: Partial<KwantTheme>;
    locale?: string;
    timeZone?: TimeZoneMode;
}

const DEFAULT_THEME: KwantTheme = {
    containerBackground: "#101217",
    plotBackground: "#111212",
    gridColor: "rgba(148, 163, 184, 0.24)",
    accentColor: "#f97316",
    crosshairColor: "#ffffff",
    crosshairLineStyle: "dashed",
    upColor: "#22c55e",
    downColor: "#ef4444",
};

const normalizeSize = (value: number | string | undefined, fallback: string) =>
    value === undefined
        ? fallback
        : typeof value === "number"
          ? `${value}px`
          : value;

const xToPx = (x: number, min: number, max: number, left: number, width: number) =>
    left + ((x - min) / Math.max(max - min, Number.EPSILON)) * width;

const yToPx = (y: number, min: number, max: number, top: number, height: number) =>
    top + height - ((y - min) / Math.max(max - min, Number.EPSILON)) * height;

function normalizeDomain(
    domain: readonly [number, number]
): readonly [number, number] | null {
    const [first, second] = domain;
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    if (first === second) {
        const expanded = paddedDomain(first, second, { paddingRatio: 0.01 });
        return [expanded.min, expanded.max];
    }
    return first < second ? domain : [second, first];
}

function formatNumeric(value: number, locale: string) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(
        value
    );
}

function formatTime(value: number, locale: string, timeZone: TimeZoneMode) {
    return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timeZone === "UTC" ? "UTC" : undefined,
    }).format(value);
}

function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const update = (width: number, height: number) =>
            setSize((current) =>
                current.width === width && current.height === height
                    ? current
                    : { width, height }
            );
        const rect = node.getBoundingClientRect();
        update(rect.width, rect.height);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) =>
            update(entry.contentRect.width, entry.contentRect.height)
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, size] as const;
}

export default function KwantLineChart({
    data,
    name,
    title,
    width,
    height,
    className,
    ariaLabel,
    layout = "full",
    variant = "default",
    xAxis,
    yAxis,
    colorMode,
    strokeWidth = 2,
    areaFill,
    hover = true,
    dataMode = "replace",
    dataKey,
    maxPoints = 50_000,
    invalidDataBehavior = "filter",
    onDataIssues,
    onHover,
    onVisibleRangeChange,
    theme,
    locale = "en-US",
    timeZone = "UTC",
}: KwantLineChartProps) {
    const resolvedTheme = useMemo(
        () => ({ ...DEFAULT_THEME, ...theme }),
        [
            theme?.accentColor,
            theme?.containerBackground,
            theme?.crosshairColor,
            theme?.crosshairLineStyle,
            theme?.downColor,
            theme?.gridColor,
            theme?.plotBackground,
            theme?.upColor,
        ]
    );
    const normalized = useMemo(() => normalizeLineData(data), [data]);
    if (normalized.report && invalidDataBehavior === "throw") {
        throw new KwantDataError(normalized.report);
    }
    useEffect(() => {
        if (normalized.report) onDataIssues?.(normalized.report);
    }, [normalized.report, onDataIssues]);

    const [retained, setRetained] = useState<LinePoint[]>(() =>
        dataMode === "upsert"
            ? upsertSorted([], normalized.data, (point) => point.x, maxPoints)
            : normalized.data
    );
    const retainedKey = useRef(dataKey);
    useEffect(() => {
        setRetained((previous) => {
            const reset = retainedKey.current !== dataKey;
            retainedKey.current = dataKey;
            if (dataMode === "replace" || reset) return normalized.data;
            return upsertSorted(
                previous,
                normalized.data,
                (point) => point.x,
                maxPoints
            );
        });
    }, [dataKey, dataMode, maxPoints, normalized.data]);
    const points = dataMode === "replace" ? normalized.data : retained;

    const [rootRef, size] = useElementSize<HTMLDivElement>();
    const baseCanvas = useRef<HTMLCanvasElement>(null);
    const overlayCanvas = useRef<HTMLCanvasElement>(null);
    const pointerFrame = useRef<number | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState(-1);
    const [visibleX, setVisibleX] = useState<readonly [number, number] | null>(
        null
    );
    const drag = useRef<{ pointerId: number; x: number; range: [number, number] } | null>(null);
    const activePointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{
        distance: number;
        range: [number, number];
        anchorRatio: number;
    } | null>(null);

    const dataX = useMemo<readonly [number, number]>(() => {
        if (!points.length) return [0, 1];
        const first = points[0].x;
        const last = points[points.length - 1].x;
        if (first === last) return [first - 0.5, last + 0.5];
        return [first, last];
    }, [points]);

    const controlledXDomain = useMemo(
        () => (xAxis?.domain ? normalizeDomain(xAxis.domain) : null),
        [xAxis?.domain?.[0], xAxis?.domain?.[1]]
    );
    useEffect(() => {
        setVisibleX(null);
    }, [controlledXDomain?.[0], controlledXDomain?.[1], dataKey]);

    const xDomain = controlledXDomain ?? visibleX ?? dataX;
    const full = layout === "full";
    const plot = useMemo(() => {
        const margins = full
            ? {
                  left: 72,
                  right: 18,
                  top: title || name ? 42 : 18,
                  bottom: 48,
              }
            : { left: 2, right: 2, top: 2, bottom: 2 };
        return {
            left: margins.left,
            top: margins.top,
            width: Math.max(0, size.width - margins.left - margins.right),
            height: Math.max(0, size.height - margins.top - margins.bottom),
        };
    }, [full, name, size.height, size.width, title]);

    useEffect(() => {
        const node = rootRef.current;
        if (!node || !full) return;

        const blockPageScroll = (event: WheelEvent) => event.preventDefault();
        node.addEventListener("wheel", blockPageScroll, { passive: false });
        return () => node.removeEventListener("wheel", blockPageScroll);
    }, [full, rootRef]);

    const visiblePoints = useMemo(() => {
        const first = Math.max(0, lowerBound(points, xDomain[0], (p) => p.x) - 1);
        const last = Math.min(
            points.length,
            lowerBound(points, xDomain[1], (p) => p.x) + 1
        );
        return points.slice(first, last);
    }, [points, xDomain]);

    const thresholdDefault = variant === "pnl";
    const resolvedColor = useMemo<LineColorMode>(
        () =>
            colorMode ??
            (thresholdDefault
                ? {
                      type: "threshold",
                      value: 0,
                      aboveColor: resolvedTheme.upColor,
                      belowColor: resolvedTheme.downColor,
                      showThresholdLine: true,
                  }
                : { type: "solid", color: resolvedTheme.accentColor }),
        [
            colorMode,
            resolvedTheme.accentColor,
            resolvedTheme.downColor,
            resolvedTheme.upColor,
            thresholdDefault,
        ]
    );
    const resolvedFill = useMemo(
        () =>
            areaFill === undefined
                ? thresholdDefault
                    ? { opacity: 0.16 }
                    : false
                : areaFill,
        [areaFill, thresholdDefault]
    );
    const includeZero = yAxis?.includeZero ?? thresholdDefault;
    const yDomain = useMemo<readonly [number, number]>(() => {
        if (yAxis?.domain) {
            const explicit = normalizeDomain(yAxis.domain);
            if (explicit) return explicit;
        }
        let min = Infinity;
        let max = -Infinity;
        for (const point of visiblePoints) {
            if (point.y < min) min = point.y;
            if (point.y > max) max = point.y;
        }
        const padded = paddedDomain(min, max, {
            paddingRatio: full ? 0.06 : 0.08,
            include: includeZero ? 0 : undefined,
        });
        return [padded.min, padded.max];
    }, [
        full,
        includeZero,
        visiblePoints,
        yAxis?.domain?.[0],
        yAxis?.domain?.[1],
    ]);

    const sampled = useMemo(
        () =>
            downsampleLine(
                visiblePoints,
                xDomain[0],
                xDomain[1],
                plot.width
            ),
        [visiblePoints, xDomain, plot.width]
    );

    const prepareCanvas = useCallback(
        (canvas: HTMLCanvasElement | null) => {
            if (!canvas || size.width <= 0 || size.height <= 0) return null;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const targetWidth = Math.floor(size.width * dpr);
            const targetHeight = Math.floor(size.height * dpr);
            if (canvas.width !== targetWidth) canvas.width = targetWidth;
            if (canvas.height !== targetHeight) canvas.height = targetHeight;
            canvas.style.width = `${size.width}px`;
            canvas.style.height = `${size.height}px`;
            const context = canvas.getContext("2d");
            if (!context) return null;
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, size.width, size.height);
            return context;
        },
        [size]
    );

    const xFormat = useCallback(
        (value: number) =>
            xAxis?.formatter?.(value) ??
            ((xAxis?.scale ?? "time") === "time"
                ? formatTime(value, locale, timeZone)
                : formatNumeric(value, locale)),
        [locale, timeZone, xAxis]
    );
    const yFormat = useCallback(
        (value: number) =>
            yAxis?.formatter?.(value) ?? formatNumeric(value, locale),
        [locale, yAxis]
    );

    useEffect(() => {
        const context = prepareCanvas(baseCanvas.current);
        if (!context || plot.width <= 0 || plot.height <= 0) return;
        context.fillStyle = resolvedTheme.plotBackground;
        context.fillRect(plot.left, plot.top, plot.width, plot.height);
        context.save();
        context.beginPath();
        context.rect(plot.left, plot.top, plot.width, plot.height);
        context.clip();

        if (full) {
            context.strokeStyle = resolvedTheme.gridColor;
            context.lineWidth = 1;
            for (let index = 0; index <= 4; index++) {
                const x = plot.left + (plot.width * index) / 4;
                const y = plot.top + (plot.height * index) / 4;
                context.beginPath();
                context.moveTo(x, plot.top);
                context.lineTo(x, plot.top + plot.height);
                context.stroke();
                context.beginPath();
                context.moveTo(plot.left, y);
                context.lineTo(plot.left + plot.width, y);
                context.stroke();
            }
        }

        const baseline =
            resolvedColor.type === "threshold" ? resolvedColor.value : yDomain[0];
        const baselineY = yToPx(
            baseline,
            yDomain[0],
            yDomain[1],
            plot.top,
            plot.height
        );
        const path = new Path2D();
        sampled.forEach((point, index) => {
            const x = xToPx(point.x, xDomain[0], xDomain[1], plot.left, plot.width);
            const y = yToPx(point.y, yDomain[0], yDomain[1], plot.top, plot.height);
            if (index === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        });

        if (resolvedFill && sampled.length > 1) {
            const fillPath = new Path2D(path);
            const last = sampled[sampled.length - 1];
            const first = sampled[0];
            fillPath.lineTo(
                xToPx(last.x, xDomain[0], xDomain[1], plot.left, plot.width),
                baselineY
            );
            fillPath.lineTo(
                xToPx(first.x, xDomain[0], xDomain[1], plot.left, plot.width),
                baselineY
            );
            fillPath.closePath();
            const opacity = Math.max(0, Math.min(1, resolvedFill.opacity ?? 0.16));
            context.globalAlpha = opacity;
            if (resolvedColor.type === "threshold") {
                context.save();
                context.beginPath();
                context.rect(plot.left, plot.top, plot.width, baselineY - plot.top);
                context.clip();
                context.fillStyle = resolvedColor.aboveColor;
                context.fill(fillPath);
                context.restore();
                context.save();
                context.beginPath();
                context.rect(
                    plot.left,
                    baselineY,
                    plot.width,
                    plot.top + plot.height - baselineY
                );
                context.clip();
                context.fillStyle = resolvedColor.belowColor;
                context.fill(fillPath);
                context.restore();
            } else {
                context.fillStyle = resolvedColor.color;
                context.fill(fillPath);
            }
            context.globalAlpha = 1;
        }

        if (
            resolvedColor.type === "threshold" &&
            resolvedColor.showThresholdLine !== false &&
            baselineY >= plot.top &&
            baselineY <= plot.top + plot.height
        ) {
            context.strokeStyle = resolvedTheme.gridColor;
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(plot.left, baselineY);
            context.lineTo(plot.left + plot.width, baselineY);
            context.stroke();
            context.setLineDash([]);
        }

        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = Math.max(0.5, strokeWidth);
        if (resolvedColor.type === "solid") {
            context.strokeStyle = resolvedColor.color;
            context.stroke(path);
        } else {
            for (let index = 1; index < sampled.length; index++) {
                const pieces = splitAtThreshold(
                    sampled[index - 1],
                    sampled[index],
                    resolvedColor.value
                );
                for (const piece of pieces) {
                    context.strokeStyle =
                        piece.side === "above"
                            ? resolvedColor.aboveColor
                            : resolvedColor.belowColor;
                    context.beginPath();
                    context.moveTo(
                        xToPx(piece.from.x, xDomain[0], xDomain[1], plot.left, plot.width),
                        yToPx(piece.from.y, yDomain[0], yDomain[1], plot.top, plot.height)
                    );
                    context.lineTo(
                        xToPx(piece.to.x, xDomain[0], xDomain[1], plot.left, plot.width),
                        yToPx(piece.to.y, yDomain[0], yDomain[1], plot.top, plot.height)
                    );
                    context.stroke();
                }
            }
        }
        if (sampled.length === 1) {
            const point = sampled[0];
            context.fillStyle =
                resolvedColor.type === "solid"
                    ? resolvedColor.color
                    : point.y >= resolvedColor.value
                      ? resolvedColor.aboveColor
                      : resolvedColor.belowColor;
            context.beginPath();
            context.arc(
                xToPx(point.x, xDomain[0], xDomain[1], plot.left, plot.width),
                yToPx(point.y, yDomain[0], yDomain[1], plot.top, plot.height),
                Math.max(2.5, strokeWidth * 1.5),
                0,
                Math.PI * 2
            );
            context.fill();
        }
        context.restore();

        if (full) {
            context.fillStyle = "rgba(226,232,240,0.72)";
            context.font = "11px ui-sans-serif, system-ui, sans-serif";
            context.textAlign = "right";
            context.textBaseline = "middle";
            for (let index = 0; index <= 4; index++) {
                const value = yDomain[1] - ((yDomain[1] - yDomain[0]) * index) / 4;
                const y = plot.top + (plot.height * index) / 4;
                context.fillText(yFormat(value), plot.left - 8, y);
            }
            context.textAlign = "center";
            context.textBaseline = "top";
            for (let index = 0; index <= 4; index++) {
                const value = xDomain[0] + ((xDomain[1] - xDomain[0]) * index) / 4;
                const x = plot.left + (plot.width * index) / 4;
                context.fillText(xFormat(value), x, plot.top + plot.height + 8);
            }
            if (xAxis?.label) {
                context.fillStyle = "rgba(248,250,252,0.88)";
                context.fillText(xAxis.label, plot.left + plot.width / 2, size.height - 16);
            }
            if (yAxis?.label) {
                context.save();
                context.translate(14, plot.top + plot.height / 2);
                context.rotate(-Math.PI / 2);
                context.fillStyle = "rgba(248,250,252,0.88)";
                context.textBaseline = "top";
                context.fillText(yAxis.label, 0, 0);
                context.restore();
            }
        }
    }, [
        full,
        plot,
        prepareCanvas,
        resolvedColor,
        resolvedFill,
        resolvedTheme,
        sampled,
        size.height,
        strokeWidth,
        xAxis?.label,
        xDomain,
        xFormat,
        yAxis?.label,
        yDomain,
        yFormat,
    ]);

    const hovered =
        hover && hoveredIndex >= 0 ? (points[hoveredIndex] ?? null) : null;
    useEffect(() => {
        const context = prepareCanvas(overlayCanvas.current);
        if (!context || !hovered || plot.width <= 0 || plot.height <= 0) return;
        const x = xToPx(hovered.x, xDomain[0], xDomain[1], plot.left, plot.width);
        const y = yToPx(hovered.y, yDomain[0], yDomain[1], plot.top, plot.height);
        context.strokeStyle = resolvedTheme.crosshairColor;
        context.globalAlpha = 0.55;
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(x, plot.top);
        context.lineTo(x, plot.top + plot.height);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
        context.fillStyle = resolvedTheme.containerBackground;
        context.strokeStyle = resolvedTheme.crosshairColor;
        context.beginPath();
        context.arc(x, y, 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    }, [hovered, plot, prepareCanvas, resolvedTheme, xDomain, yDomain]);

    useEffect(() => onHover?.(hovered), [hovered, onHover]);

    const setRange = useCallback(
        (next: readonly [number, number]) => {
            if (controlledXDomain || next[1] <= next[0]) return;
            setVisibleX(next);
        },
        [controlledXDomain]
    );
    useEffect(() => {
        onVisibleRangeChange?.({ from: xDomain[0], to: xDomain[1] });
    }, [onVisibleRangeChange, xDomain[0], xDomain[1]]);

    const inspectAt = useCallback(
        (clientX: number) => {
            if (!hover || !points.length || plot.width <= 0) return;
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const px = Math.max(plot.left, Math.min(plot.left + plot.width, clientX - rect.left));
            const value = xDomain[0] + ((px - plot.left) / plot.width) * (xDomain[1] - xDomain[0]);
            setHoveredIndex(nearestIndex(points, value, (point) => point.x));
        },
        [hover, plot, points, rootRef, xDomain]
    );

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (activePointers.current.has(event.pointerId)) {
            activePointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
        }
        if (pinch.current && activePointers.current.size >= 2 && full) {
            const [first, second] = Array.from(activePointers.current.values());
            const distance = Math.max(
                1,
                Math.hypot(second.x - first.x, second.y - first.y)
            );
            const initialSpan = pinch.current.range[1] - pinch.current.range[0];
            const nextSpan = initialSpan * (pinch.current.distance / distance);
            const anchor =
                pinch.current.range[0] +
                initialSpan * pinch.current.anchorRatio;
            setRange([
                anchor - nextSpan * pinch.current.anchorRatio,
                anchor + nextSpan * (1 - pinch.current.anchorRatio),
            ]);
        } else if (drag.current && full) {
            const dx = event.clientX - drag.current.x;
            const span = drag.current.range[1] - drag.current.range[0];
            const shift = plot.width > 0 ? (dx / plot.width) * span : 0;
            setRange([
                drag.current.range[0] - shift,
                drag.current.range[1] - shift,
            ]);
        }
        if (pointerFrame.current !== null) cancelAnimationFrame(pointerFrame.current);
        const clientX = event.clientX;
        pointerFrame.current = requestAnimationFrame(() => {
            pointerFrame.current = null;
            inspectAt(clientX);
        });
    };

    useEffect(
        () => () => {
            if (pointerFrame.current !== null) cancelAnimationFrame(pointerFrame.current);
        },
        []
    );

    return (
        <div
            ref={rootRef}
            className={`kwant-line-chart kwant-line-${layout}${className ? ` ${className}` : ""}`}
            data-variant={variant}
            style={{
                width: normalizeSize(width, "100%"),
                height: normalizeSize(height, full ? "420px" : "96px"),
                background: resolvedTheme.containerBackground,
            }}
            role="application"
            aria-label={ariaLabel ?? name ?? title ?? "Line chart"}
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
                if (!drag.current) setHoveredIndex(-1);
            }}
            onPointerDown={(event) => {
                if (!full || event.button !== 0 || controlledXDomain) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                activePointers.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                drag.current = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    range: [xDomain[0], xDomain[1]],
                };
                if (activePointers.current.size >= 2) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const [first, second] = Array.from(
                        activePointers.current.values()
                    );
                    const center = (first.x + second.x) / 2 - rect.left;
                    pinch.current = {
                        distance: Math.max(
                            1,
                            Math.hypot(
                                second.x - first.x,
                                second.y - first.y
                            )
                        ),
                        range: [xDomain[0], xDomain[1]],
                        anchorRatio: Math.max(
                            0,
                            Math.min(1, (center - plot.left) / Math.max(1, plot.width))
                        ),
                    };
                    drag.current = null;
                }
            }}
            onPointerUp={(event) => {
                activePointers.current.delete(event.pointerId);
                pinch.current = null;
                if (drag.current?.pointerId === event.pointerId) drag.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }
            }}
            onPointerCancel={() => {
                drag.current = null;
                pinch.current = null;
                activePointers.current.clear();
            }}
            onWheel={(event) => {
                if (!full) return;
                event.stopPropagation();
                if (controlledXDomain || plot.width <= 0) return;
                const rect = rootRef.current?.getBoundingClientRect();
                if (!rect) return;
                const ratio = Math.max(
                    0,
                    Math.min(1, (event.clientX - rect.left - plot.left) / plot.width)
                );
                const span = xDomain[1] - xDomain[0];
                const factor = Math.max(0.1, 1 + event.deltaY * 0.0015);
                const nextSpan = Math.max(Number.EPSILON, span * factor);
                const anchor = xDomain[0] + span * ratio;
                setRange([
                    anchor - nextSpan * ratio,
                    anchor + nextSpan * (1 - ratio),
                ]);
            }}
            onKeyDown={(event) => {
                if (!points.length) return;
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    const direction = event.key === "ArrowLeft" ? -1 : 1;
                    setHoveredIndex((current) =>
                        Math.max(
                            0,
                            Math.min(points.length - 1, current < 0 ? 0 : current + direction)
                        )
                    );
                }
                if (event.key === "Escape") setHoveredIndex(-1);
            }}
        >
            {full && (title || name) && (
                <div className="kwant-line-heading">
                    {title && <span className="kwant-line-title">{title}</span>}
                    {name && <span className="kwant-line-name">{name}</span>}
                </div>
            )}
            <canvas ref={baseCanvas} className="kwant-line-canvas" />
            <canvas ref={overlayCanvas} className="kwant-line-canvas kwant-line-overlay" />
            {!points.length && (
                <div className="kwant-line-empty">No chart data</div>
            )}
            {hovered && hover && (
                <div
                    className="kwant-line-tooltip"
                    style={{
                        left: Math.max(
                            8,
                            Math.min(
                                size.width - 150,
                                xToPx(
                                    hovered.x,
                                    xDomain[0],
                                    xDomain[1],
                                    plot.left,
                                    plot.width
                                ) + 10
                            )
                        ),
                        top: Math.max(
                            8,
                            yToPx(
                                hovered.y,
                                yDomain[0],
                                yDomain[1],
                                plot.top,
                                plot.height
                            ) - 42
                        ),
                    }}
                >
                    {name && <strong>{name}</strong>}
                    <span>{xFormat(hovered.x)}</span>
                    <span>{yFormat(hovered.y)}</span>
                </div>
            )}
            <span className="kwant-visually-hidden" aria-live="polite">
                {hovered
                    ? `${name ?? "Series"}, ${xFormat(hovered.x)}, ${yFormat(hovered.y)}`
                    : ""}
            </span>
        </div>
    );
}
