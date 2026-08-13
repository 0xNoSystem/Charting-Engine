export function lowerBound<T>(
    values: readonly T[],
    target: number,
    key: (value: T) => number
) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (key(values[middle]) < target) low = middle + 1;
        else high = middle;
    }
    return low;
}

export function nearestIndex<T>(
    values: readonly T[],
    target: number,
    key: (value: T) => number
) {
    if (!values.length) return -1;
    const right = lowerBound(values, target, key);
    if (right <= 0) return 0;
    if (right >= values.length) return values.length - 1;
    return target - key(values[right - 1]) <= key(values[right]) - target
        ? right - 1
        : right;
}
