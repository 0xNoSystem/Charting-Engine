import React, { useRef, useEffect, useState } from "react";
import Chart from "./Chart";
import PriceScale from "./visual/PriceScale";
import TimeScale from "./visual/TimeScale";
import IntervalOverlay from "./visual/Interval";
import ChartSettings from "./visual/ChartSettings";
import CandleInfo from "./visual/CandleInfo";
import { useChartContext } from "./ChartContextStore";
import { xToTime } from "./utils";

import type { TimeFrame } from "../types";
import type { CandleData } from "./utils";

interface ChartContainerProps {
    asset: string;
    tf: TimeFrame;
    settingInterval: boolean;
    candleData: CandleData[];
}

const ChartContainer: React.FC<ChartContainerProps> = ({
    asset,
    tf,
    settingInterval,
    candleData,
}) => {
    const {
        setCandles,
        selectingInterval,
        startTime,
        endTime,
        candles,
        candleColor,
        setCandleColor,
        width,
        crosshairX,
        mouseOnChart,
    } = useChartContext();
    const rightRef = useRef<HTMLDivElement>(null);
    const [rightWidth, setRightWidth] = useState(0);
    const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
    const [setting, setSetting] = useState(false);

    // Load candle data into context
    useEffect(() => {
        if (!candleData) return;
        setCandles(candleData);
    }, [candleData, setCandles]);

    // Track right panel width (needed for bottom preview)
    useEffect(() => {
        if (!rightRef.current) return;

        const obs = new ResizeObserver(([entry]) => {
            setRightWidth(entry.contentRect.width);
        });

        obs.observe(rightRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (
            selectingInterval ||
            crosshairX === null ||
            width === 0 ||
            endTime <= startTime ||
            candles.length === 0
        ) {
            setHoveredCandle(null);
            return;
        }

        const hoverTime = xToTime(crosshairX, startTime, endTime, width);

        let nearest: CandleData | null = null;
        let bestDiff = Infinity;

        for (const candle of candles) {
            if (candle.end < startTime || candle.start > endTime) continue;
            const mid = (candle.start + candle.end) / 2;
            const diff = Math.abs(mid - hoverTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                nearest = candle;
            }
        }

        setHoveredCandle(nearest);
    }, [selectingInterval, crosshairX, width, startTime, endTime, candles]);

    return (
        <div className="flex h-full flex-1 flex-col overflow-hidden">
            {/* MAIN ROW */}
            <div className="flex h-full w-full flex-1">
                {/* LEFT: CHART */}
                <div className="relative flex w-[93%] flex-1 overflow-hidden">
                    <div className="relative flex flex-1">
                        <Chart
                            asset={asset}
                            tf={tf}
                            settingInterval={settingInterval}
                        />
                        <IntervalOverlay />
                        {hoveredCandle && mouseOnChart && (
                            <CandleInfo candle={hoveredCandle} />
                        )}
                    </div>
                    {setting && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
                            <ChartSettings
                                initialColors={candleColor}
                                onApply={(colors) =>
                                    setCandleColor(colors.up, colors.down)
                                }
                                onReset={() =>
                                    setCandleColor("#cf7b15", "#c4c3c2")
                                }
                                onClose={() => setSetting(false)}
                            />
                        </div>
                    )}
                </div>

                {/* RIGHT PRICE SCALE */}
                <div
                    ref={rightRef}
                    className="w-fit cursor-n-resize bg-black/20 text-white"
                >
                    <PriceScale />
                </div>
            </div>

            {/* BOTTOM TIME SCALE */}
            <div className="flex bg-black/20 text-white">
                <div className="flex-1 cursor-w-resize">
                    <TimeScale />
                </div>

                {/* Right-side width preview box */}
                <div
                    className="flex items-center justify-center bg-black/60"
                    style={{ width: rightWidth }}
                >
                    <button
                        type="button"
                        className="text-white/60 transition hover:text-white"
                        onClick={() => setSetting((prev) => !prev)}
                        aria-label="Toggle chart settings"
                        title="Settings"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12.22 2h-.44a2 2 0 0 0-1.94 1.5l-.14.47a2 2 0 0 1-2.63 1.3l-.41-.14a2 2 0 0 0-2.5 1.3l-.22.42a2 2 0 0 0 .44 2.34l.38.38a2 2 0 0 1 0 2.83l-.38.38a2 2 0 0 0-.44 2.34l.22.42a2 2 0 0 0 2.5 1.3l.41-.14a2 2 0 0 1 2.63 1.3l.14.47a2 2 0 0 0 1.94 1.5h.44a2 2 0 0 0 1.94-1.5l.14-.47a2 2 0 0 1 2.63-1.3l.41.14a2 2 0 0 0 2.5-1.3l.22-.42a2 2 0 0 0-.44-2.34l-.38-.38a2 2 0 0 1 0-2.83l.38-.38a2 2 0 0 0 .44-2.34l-.22-.42a2 2 0 0 0-2.5-1.3l-.41.14a2 2 0 0 1-2.63-1.3l-.14-.47A2 2 0 0 0 12.22 2z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChartContainer;
