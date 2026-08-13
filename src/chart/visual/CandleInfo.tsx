import React from "react";
import type { CandleData } from "../utils";
import { useChartContext } from "../ChartContextStore";

interface CandleInfoProps {
    candle: CandleData;
}

const DIFF_CLASS = {
    flat: "text-white/70",
    up: "text-green-400",
    down: "text-red-400",
} as const;

const formatPrice = (n: number, locale: string) => {
    const absolute = Math.abs(n);
    const decimals = absolute > 0 && absolute < 1 ? 6 : 2;
    return n.toLocaleString(locale, { maximumFractionDigits: decimals });
};

export function formatVolume(n: number): string {
    const abs = Math.abs(n);

    if (abs >= 1_000_000_000)
        return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";

    if (abs >= 1_000_000)
        return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";

    if (abs >= 1_000)
        return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";

    return String(n);
}

const CandleInfo: React.FC<CandleInfoProps> = ({ candle }) => {
    const { priceFormatter, volumeFormatter, locale } = useChartContext();
    const price = (value: number) =>
        priceFormatter?.(value) ?? formatPrice(value, locale);
    const diff = candle.close - candle.open;
    const pct = candle.open !== 0 ? (diff / candle.open) * 100 : 0;
    const diffState: keyof typeof DIFF_CLASS =
        diff === 0 ? "flat" : diff > 0 ? "up" : "down";
    const diffClass = DIFF_CLASS[diffState];

    return (
        <div className="pointer-events-none absolute top-3 left-4 rounded border border-white/20 bg-black/80 px-3 py-2 text-xs text-white/80">
            <div className="flex gap-2">
                <span className="text-white/50">H</span>
                <span>{price(candle.high)}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-white/50">C</span>
                <span>{price(candle.close)}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-white/50">L</span>
                <span>{price(candle.low)}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-white/50">O</span>
                <span>{price(candle.open)}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-white/50">VLM</span>
                <span>
                    {volumeFormatter?.(candle.volume) ??
                        formatVolume(candle.volume)}
                </span>
            </div>

            <div className="mt-1 flex justify-between text-[11px]">
                <span className="text-white/50">Δ</span>
                <span className={diffClass}>
                    {diff >= 0 ? "+" : ""}
                    {diff.toFixed(2)} ({pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}%)
                </span>
            </div>
        </div>
    );
};

export default CandleInfo;
