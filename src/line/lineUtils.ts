import type { LinePoint } from "../types";

export function downsampleLine(
    data: readonly LinePoint[],
    minX: number,
    maxX: number,
    pixelWidth: number
) {
    const width = Math.max(1, Math.floor(pixelWidth));
    if (data.length <= width * 2 || maxX <= minX) return data.slice();

    type Bucket = {
        first: number;
        last: number;
        min: number;
        max: number;
    };
    const buckets = new Map<number, Bucket>();
    const span = maxX - minX;

    data.forEach((point, index) => {
        const column = Math.max(
            0,
            Math.min(width - 1, Math.floor(((point.x - minX) / span) * width))
        );
        const bucket = buckets.get(column);
        if (!bucket) {
            buckets.set(column, {
                first: index,
                last: index,
                min: index,
                max: index,
            });
            return;
        }
        bucket.last = index;
        if (point.y < data[bucket.min].y) bucket.min = index;
        if (point.y > data[bucket.max].y) bucket.max = index;
    });

    const selected: number[] = [];
    for (const bucket of buckets.values()) {
        const indices = [
            bucket.first,
            bucket.min,
            bucket.max,
            bucket.last,
        ].sort((a, b) => a - b);
        for (const index of indices) {
            if (selected[selected.length - 1] !== index) selected.push(index);
        }
    }
    return selected.map((index) => data[index]);
}

export interface ThresholdSegment {
    from: LinePoint;
    to: LinePoint;
    side: "above" | "below";
}

export function splitAtThreshold(
    from: LinePoint,
    to: LinePoint,
    threshold: number
): ThresholdSegment[] {
    const fromAbove = from.y >= threshold;
    const toAbove = to.y >= threshold;
    if (fromAbove === toAbove || from.y === to.y) {
        return [{ from, to, side: fromAbove ? "above" : "below" }];
    }

    const ratio = (threshold - from.y) / (to.y - from.y);
    const crossing = {
        x: from.x + (to.x - from.x) * ratio,
        y: threshold,
    };
    return [
        { from, to: crossing, side: fromAbove ? "above" : "below" },
        { from: crossing, to, side: toAbove ? "above" : "below" },
    ];
}
