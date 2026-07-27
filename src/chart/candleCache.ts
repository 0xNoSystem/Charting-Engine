import type { CandleData, TimeFrame } from "../types";

type CacheKey = string;

export const candleCache = new Map<CacheKey, Map<number, CandleData>>();

const normalizeSourceName = (sourceName: string) => sourceName.trim();

const buildCacheKey = (sourceName: string, tf: TimeFrame) =>
    JSON.stringify([normalizeSourceName(sourceName), tf]);

export function getTimeframeCache(
    sourceName: string,
    tf: TimeFrame
) {
    const normalizedSource = normalizeSourceName(sourceName);
    if (!normalizedSource) {
        throw new Error("A non-empty source_name is required for candle caching");
    }
    const cacheKey = buildCacheKey(normalizedSource, tf);
    let tfCache = candleCache.get(cacheKey);
    if (!tfCache) {
        tfCache = new Map();
        candleCache.set(cacheKey, tfCache);
    }

    return tfCache;
}

export function peekTimeframeCache(sourceName: string, tf: TimeFrame) {
    const normalizedSource = normalizeSourceName(sourceName);
    if (!normalizedSource) return undefined;
    return candleCache.get(buildCacheKey(normalizedSource, tf));
}

export function clearCandleCache(sourceName?: string) {
    if (sourceName === undefined) {
        candleCache.clear();
        return;
    }

    const normalizedSource = normalizeSourceName(sourceName);
    if (!normalizedSource) return;

    for (const key of candleCache.keys()) {
        const [cachedSource] = JSON.parse(key) as [string, TimeFrame];
        if (cachedSource === normalizedSource) {
            candleCache.delete(key);
        }
    }
}
