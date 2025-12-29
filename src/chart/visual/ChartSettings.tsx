import React, { useState } from "react";

type CandleColor = {
    up: string;
    down: string;
};

interface ChartSettingsProps {
    initialColors?: CandleColor;
    onApply?: (colors: CandleColor) => void;
    onReset?: () => void;
    onClose?: () => void;
}

const ChartSettings: React.FC<ChartSettingsProps> = ({
    initialColors = { up: "#cf7b15", down: "#c4c3c2" },
    onApply,
    onReset,
    onClose,
}) => {
    const [colors, setColors] = useState<CandleColor>(initialColors);

    const handleChange = (key: keyof CandleColor, value: string) => {
        setColors((prev) => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        onApply?.(colors);
        onClose?.();
    };

    const handleReset = () => {
        setColors({ up: "#cf7b15", down: "#c4c3c2" });
        onReset?.();
    };

    return (
        <div className="w-64 rounded-2xl border border-white/20 bg-black/80 p-4 text-white shadow-lg shadow-black/50">
            <h2 className="mb-4 border-b border-white/10 text-lg font-semibold text-white/80">
                Settings
            </h2>

            <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-white/70">
                    Candle Color
                </h3>
                <div className="flex items-center justify-between">
                    <label htmlFor="upColor" className="text-sm text-white/60">
                        Up
                    </label>
                    <input
                        id="upColor"
                        type="text"
                        value={colors.up}
                        onChange={(e) => handleChange("up", e.target.value)}
                        placeholder="#00ff00"
                        className="h-8 w-28 rounded border border-white/30 bg-black/50 px-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <label
                        htmlFor="downColor"
                        className="text-sm text-white/60"
                    >
                        Down
                    </label>
                    <input
                        id="downColor"
                        type="text"
                        value={colors.down}
                        onChange={(e) => handleChange("down", e.target.value)}
                        placeholder="#ff0000"
                        className="h-8 w-28 rounded border border-white/30 bg-black/50 px-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                </div>

                <div className="mt-4 flex justify-between">
                    <button
                        onClick={handleReset}
                        className="rounded-md border border-white/20 px-3 py-1 text-sm text-white/70 transition hover:bg-white/10"
                    >
                        Reset
                    </button>
                    <button
                        onClick={handleApply}
                        className="rounded-md bg-orange-500/80 px-3 py-1 text-sm text-white transition hover:bg-orange-500"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChartSettings;
