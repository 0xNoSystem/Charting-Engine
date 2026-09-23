import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChartContext } from "./ChartContextStore";
import { constrainPrice, validatePriceLines, type PriceLine, type PriceLineProps } from "../priceLines";

export type ResolvedPriceLine = { key: string; line: PriceLine };

type Drag = {
    line: PriceLine;
    value: number;
    acknowledgedValue: number;
    pendingValues: number[];
    pointerId: number;
    element: SVGGElement;
    startY: number;
    anchorY: number;
    anchorPrice: number;
    pendingY: number;
    moved: boolean;
    pricePerPixel: number;
    width: number;
    height: number;
    minPrice: number;
    maxPrice: number;
    scope: string;
};

type PriceLinesContextValue = {
    lines: ResolvedPriceLine[];
    activeId?: string;
    interaction: (line: PriceLine) => React.SVGProps<SVGGElement>;
    remove: (id: string) => void;
};

const PriceLinesContext = createContext<PriceLinesContextValue | null>(null);
const PriceLineInteractionContext = createContext<{ dragging: boolean; isDragging: () => boolean }>({
    dragging: false,
    isDragging: () => false,
});
const EMPTY_LINES: readonly PriceLine[] = [];

/** Chart gestures subscribe only to drag start/end, not every price preview. */
export const usePriceLineInteraction = () => useContext(PriceLineInteractionContext);

export function usePriceLines() {
    const context = useContext(PriceLinesContext);
    if (!context) throw new Error("Price lines require PriceLinesProvider");
    return context;
}

export function PriceLinesProvider({
    children, priceLines = EMPTY_LINES, livePrice, scope, removalScope,
}: PriceLineProps & { children: React.ReactNode; livePrice: boolean; scope: string; removalScope: string }) {
    const chart = useChartContext();
    const { width, height, minPrice, maxPrice, candles, candleColor, setCrosshair, setMouseOnChart } = chart;
    const drag = useRef<Drag | null>(null);
    const frame = useRef<number | null>(null);
    const [preview, setPreview] = useState<{ id: string; value: number } | null>(null);
    const [dismissed, setDismissed] = useState(() => ({ scope: removalScope, ids: new Set<string>() }));
    const dismissedRef = useRef(dismissed);
    dismissedRef.current = dismissed;
    const current = useRef({ priceLines, scope, width, height, minPrice, maxPrice });
    current.current = { priceLines, scope, width, height, minPrice, maxPrice };

    useMemo(() => validatePriceLines(priceLines), [priceLines]);

    // Recreating objects/values or switching intervals must not resurrect a removed line.
    // Removing an ID from props releases it for a later explicit re-add.
    useEffect(() => {
        const previous = dismissedRef.current;
        const present = new Set(priceLines.map((line) => line.id));
        const ids = previous.scope === removalScope
            ? new Set([...previous.ids].filter((id) => present.has(id)))
            : new Set<string>();
        if (previous.scope !== removalScope || ids.size !== previous.ids.size) {
            const next = { scope: removalScope, ids };
            dismissedRef.current = next;
            setDismissed(next);
        }
    }, [priceLines, removalScope]);

    const release = (state: Drag) => {
        if (state.element.hasPointerCapture(state.pointerId)) {
            state.element.releasePointerCapture(state.pointerId);
        }
    };

    const callbacks = useCallback((state: Drag) =>
        (current.current.scope === state.scope && current.current.priceLines.find((line) => line.id === state.line.id)?.draggable)
            || state.line.draggable || {}, []);

    const clearFrame = useCallback(() => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
    }, []);

    const cancel = useCallback((restore = true) => {
        const state = drag.current;
        if (!state) return;
        clearFrame();
        drag.current = null;
        setPreview(null);
        release(state);
        const options = callbacks(state);
        if (restore && state.value !== state.line.value) options.onChange?.(state.line.value);
        options.onCancel?.();
    }, [callbacks, clearFrame]);

    const remove = (id: string) => {
        const line = current.current.priceLines.find((item) => item.id === id);
        if (!line?.draggable || !line.draggable.removable) return;
        const previous = dismissedRef.current;
        if (previous.scope === removalScope && previous.ids.has(id)) return;
        const ids = new Set(previous.scope === removalScope ? previous.ids : []);
        ids.add(id);
        const next = { scope: removalScope, ids };
        dismissedRef.current = next;
        setDismissed(next);
        if (drag.current?.line.id === id) cancel(false);
        line.draggable.onRemove?.();
    };

    const isCurrent = useCallback((state: Drag) => {
        if (!state.element.isConnected) return false;
        const next = current.current;
        const line = next.priceLines.find((item) => item.id === state.line.id);
        const before = state.line.draggable;
        const after = line?.draggable;
        if (!line) return false;
        // React may commit a controlled update after another pointer sample arrives.
        // Accept our queued echoes without mistaking them for an external edit.
        if (line.value !== state.acknowledgedValue) {
            const acknowledged = state.pendingValues.indexOf(line.value);
            if (acknowledged < 0) return false;
            state.pendingValues.splice(0, acknowledged + 1);
            state.acknowledgedValue = line.value;
        }
        return Boolean(before && after &&
            before.min === after.min && before.max === after.max && before.step === after.step &&
            state.scope === next.scope && state.width === next.width && state.height === next.height &&
            state.minPrice === next.minPrice && state.maxPrice === next.maxPrice);
    }, []);

    const isDragging = useCallback(() => drag.current !== null, []);

    // External edits, removal, disabling, resizing, or a new asset/interval cancel a gesture.
    useEffect(() => {
        if (drag.current && !isCurrent(drag.current)) cancel(false);
    }, [priceLines, scope, width, height, minPrice, maxPrice, cancel, isCurrent]);

    useEffect(() => {
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }
        };
        const blur = () => cancel();
        window.addEventListener("keydown", escape, true);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", escape, true);
            window.removeEventListener("blur", blur);
            const state = drag.current;
            drag.current = null;
            clearFrame();
            if (state) {
                release(state);
                callbacks(state).onCancel?.();
            }
        };
    }, [cancel, callbacks, clearFrame]);

    const applyMove = () => {
        const state = drag.current;
        if (!state) return;
        if (!isCurrent(state)) { cancel(false); return; }
        const clientY = state.pendingY;
        if (!state.moved && clientY === state.startY) return;
        state.moved = true;
        // Preserve the grab offset, including when grabbing the wider invisible hit area.
        const options = state.line.draggable || {};
        const lower = constrainPrice(state.minPrice, options);
        const upper = constrainPrice(state.maxPrice, options);
        const raw = state.anchorPrice - (clientY - state.anchorY) * state.pricePerPixel;
        const value = constrainPrice(Math.max(lower, Math.min(upper, raw)), options);
        // Discard overshoot at bounds so reversing direction responds immediately.
        // Retain fractional movement between ticks while inside the bounds.
        if (raw < lower || raw > upper) {
            state.anchorY = clientY;
            state.anchorPrice = value;
        }
        if (!Number.isFinite(value) || value === state.value) return;
        state.value = value;
        state.pendingValues.push(value);
        setPreview({ id: state.line.id, value });
        callbacks(state).onChange?.(value);
    };

    const move = (event: React.PointerEvent<SVGGElement>) => {
        const state = drag.current;
        if (!state || event.pointerId !== state.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        state.pendingY = event.clientY;
        if (frame.current === null) {
            frame.current = requestAnimationFrame(() => {
                frame.current = null;
                applyMove();
            });
        }
    };

    const interaction = (line: PriceLine): React.SVGProps<SVGGElement> => {
        const options = line.draggable;
        if (!options) return { pointerEvents: "none" };
        const stop = (event: React.SyntheticEvent) => event.stopPropagation();
        return {
            role: "slider",
            tabIndex: 0,
            "aria-label": line.name || line.id,
            "aria-orientation": "vertical",
            "aria-valuenow": line.value,
            "aria-valuemin": options.min ?? Math.min(minPrice, line.value),
            "aria-valuemax": options.max ?? Math.max(maxPrice, line.value),
            "aria-valuetext": chart.priceFormatter?.(line.value) ?? String(line.value),
            pointerEvents: "all",
            style: { cursor: "ns-resize", touchAction: "none" },
            onMouseDown: stop,
            onTouchStart: stop,
            onTouchMove: stop,
            onTouchEnd: stop,
            onTouchCancel: stop,
            onPointerEnter: () => { setCrosshair(null, null); setMouseOnChart(false); },
            onPointerDown: (event) => {
                event.stopPropagation();
                event.preventDefault();
                if (drag.current || !event.isPrimary || event.button !== 0 || height <= 0 || maxPrice <= minPrice) return;
                const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (!rect?.height) return;
                const original = current.current.priceLines.find((item) => item.id === line.id);
                if (!original?.draggable) return;
                event.currentTarget.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                    line: { ...original, draggable: { ...original.draggable } },
                    value: original.value,
                    acknowledgedValue: original.value,
                    pendingValues: [],
                    pointerId: event.pointerId,
                    element: event.currentTarget,
                    startY: event.clientY,
                    anchorY: event.clientY,
                    pendingY: event.clientY,
                    anchorPrice: original.value,
                    moved: false,
                    pricePerPixel: (maxPrice - minPrice) / rect.height,
                    width, height, minPrice, maxPrice, scope,
                };
                setPreview({ id: line.id, value: original.value });
                setCrosshair(null, null);
                setMouseOnChart(false);
            },
            onPointerMove: move,
            onPointerUp: (event) => {
                if (!drag.current || event.pointerId !== drag.current.pointerId) return;
                event.preventDefault();
                event.stopPropagation();
                drag.current.pendingY = event.clientY;
                clearFrame();
                applyMove();
                const state = drag.current;
                if (!state) return;
                drag.current = null;
                setPreview(null);
                release(state);
                if (state.value !== state.line.value) callbacks(state).onCommit?.(state.value);
            },
            onPointerCancel: (event) => {
                if (drag.current?.pointerId === event.pointerId) cancel();
            },
            onLostPointerCapture: (event) => {
                if (drag.current?.pointerId === event.pointerId) cancel();
            },
            onKeyDown: (event) => {
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                if (drag.current) return;
                const step = options.step ?? (maxPrice - minPrice) / 100;
                const candidate = event.key === "Home" ? options.min : event.key === "End" ? options.max :
                    line.value + (event.key === "ArrowUp" ? step : -step) * (event.shiftKey ? 10 : 1);
                if (candidate === undefined || !Number.isFinite(candidate)) return;
                const value = constrainPrice(candidate, options);
                if (value !== line.value) {
                    options.onChange?.(value);
                    options.onCommit?.(value);
                }
            },
        };
    };

    const lines: ResolvedPriceLine[] = [];
    const latest = candles[candles.length - 1];
    if (livePrice && latest && Number.isFinite(latest.close)) {
        lines.push({ key: "live", line: {
            id: "live-price", value: latest.close,
            lineSettings: { color: latest.close >= latest.open ? candleColor.up : candleColor.down, style: "dotted" },
        } });
    }
    for (const line of priceLines) {
        if (dismissed.scope === removalScope && dismissed.ids.has(line.id)) continue;
        lines.push({ key: `user:${line.id}`, line: preview?.id === line.id ? { ...line, value: preview.value } : line });
    }

    const dragging = preview !== null;
    const interactionState = useMemo(() => ({ dragging, isDragging }), [dragging, isDragging]);
    return <PriceLineInteractionContext.Provider value={interactionState}>
        <PriceLinesContext.Provider value={{ lines, activeId: preview?.id, interaction, remove }}>
            {children}
        </PriceLinesContext.Provider>
    </PriceLineInteractionContext.Provider>;
}
