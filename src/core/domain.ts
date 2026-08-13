export interface NumericDomain {
    min: number;
    max: number;
}

export function paddedDomain(
    min: number,
    max: number,
    options: { paddingRatio?: number; include?: number } = {}
): NumericDomain {
    let low = Math.min(min, max);
    let high = Math.max(min, max);
    if (Number.isFinite(options.include)) {
        low = Math.min(low, options.include!);
        high = Math.max(high, options.include!);
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
        return { min: -1, max: 1 };
    }

    const ratio = Math.max(0, options.paddingRatio ?? 0.04);
    const range = high - low;
    const magnitude = Math.max(Math.abs(low), Math.abs(high), 1e-9);
    const padding =
        range > 0
            ? Math.max(range * ratio, magnitude * Number.EPSILON * 16)
            : Math.max(magnitude * Math.max(ratio, 0.01), 1e-9);

    return { min: low - padding, max: high + padding };
}

export function boundsOf(values: readonly number[]) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return { min, max };
}
