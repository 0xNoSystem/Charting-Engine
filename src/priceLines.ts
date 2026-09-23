/** Design shared by static, live, and draggable price lines. */
export interface LineSettings {
    color?: string;
    width?: number;
    style?: "solid" | "dashed" | "dotted";
}

export interface PriceLineDragOptions {
    /** Inclusive lower price bound. */
    min?: number;
    /** Inclusive upper price bound. */
    max?: number;
    /** Positive price increment, anchored at zero (not at min). */
    step?: number;
    /** Show a small × button that removes this line. Defaults to false. */
    removable?: boolean;
    /** Optional notification after the line is removed by its × button. */
    onRemove?: () => void;
    /** Called during dragging and keyboard edits. Cancellation restores the starting value. */
    onChange?: (value: number) => void;
    /** Called once after a changed drag is released, or after a keyboard edit. */
    onCommit?: (value: number) => void;
    /** Called when a gesture is cancelled, including external edits/removal. */
    onCancel?: () => void;
}

export interface PriceLine {
    /** Unique within this chart's caller-supplied price lines. */
    id: string;
    /** Controlled price. Update it in draggable.onChange or draggable.onCommit to retain an edit. */
    value: number;
    name?: string;
    /** Show the price badge on the price scale. Defaults to true. */
    priceDisplay?: boolean;
    lineSettings?: LineSettings;
    /** Omitted/false is static; an empty object enables unrestricted dragging. */
    draggable?: false | PriceLineDragOptions;
}

export interface PriceLineProps {
    /** Optional horizontal levels. Levels do not expand the visible price range. */
    priceLines?: readonly PriceLine[];
}

function tickBounds({ min, max, step }: PriceLineDragOptions) {
    const lower = min === undefined ? -Infinity : min / step!;
    const upper = max === undefined ? Infinity : max / step!;
    // Account for decimal division such as 0.3 / 0.1 = 2.9999999999999996.
    const tolerance = (value: number) =>
        Number.isFinite(value) ? Math.min(1e-7, Math.abs(value) * Number.EPSILON * 4) : 0;
    return {
        lower: Math.ceil(lower - tolerance(lower)),
        upper: Math.floor(upper + tolerance(upper)),
    };
}

/** Reject ambiguous/invalid configuration instead of emitting invalid prices. */
export function validatePriceLines(lines: readonly PriceLine[]): void {
    const ids = new Set<string>();
    for (const line of lines) {
        const fail = (message: string): never => {
            throw new TypeError(`Invalid price line ${JSON.stringify(line.id)}: ${message}`);
        };
        if (typeof line.id !== "string" || !line.id.length || ids.has(line.id)) {
            fail("id must be a nonempty, unique string");
        }
        ids.add(line.id);
        if (!Number.isFinite(line.value)) fail("value must be finite");
        if (line.draggable !== undefined && line.draggable !== false) {
            if (!line.draggable || typeof line.draggable !== "object") {
                fail("draggable must be false or an options object");
            }
            const { min, max, step } = line.draggable;
            if (min !== undefined && !Number.isFinite(min)) fail("min must be finite");
            if (max !== undefined && !Number.isFinite(max)) fail("max must be finite");
            if (min !== undefined && max !== undefined && min > max) fail("min exceeds max");
            if (step !== undefined) {
                if (!Number.isFinite(step) || step <= 0) fail("step must be finite and positive");
                const ticks = tickBounds(line.draggable);
                if (ticks.lower > ticks.upper || ticks.lower === Infinity || ticks.upper === -Infinity) {
                    fail("bounds contain no representable step");
                }
            }
        }
        const settings = line.lineSettings;
        if (settings?.width !== undefined && (!Number.isFinite(settings.width) || settings.width <= 0)) {
            fail("line width must be finite and positive");
        }
    }
}

/** Snap to a zero-anchored tick inside the inclusive bounds. */
export function constrainPrice(value: number, options: PriceLineDragOptions): number {
    const { min = -Infinity, max = Infinity, step } = options;
    const clamped = Math.max(min, Math.min(max, value));
    if (step === undefined) return clamped;
    const ticks = tickBounds(options);
    const tick = Math.max(ticks.lower, Math.min(ticks.upper, Math.round(clamped / step)));
    const [coefficient, exponent = "0"] = step.toString().split("e");
    const decimals = Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
    // Round decimal artifacts without dropping significant digits from large prices.
    const product = tick * step;
    const snapped = decimals <= 100 ? Number(product.toFixed(decimals)) : product;
    // Avoid propagating overflow for magnitudes that cannot resolve this step.
    return Math.max(min, Math.min(max, Number.isFinite(snapped) ? snapped : clamped));
}
