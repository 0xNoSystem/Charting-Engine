import React, { useEffect, useState } from "react";
import { HexAlphaColorPicker, HexColorPicker } from "react-colorful";

export type CandleColor = {
    up: string;
    down: string;
};

export type CrosshairLineStyle = "solid" | "dashed" | "dotted";

export type ChartAppearance = {
    backgroundColor: string;
    gridColor: string;
    secondaryColor: string;
    crosshairColor: string;
    crosshairLineStyle: CrosshairLineStyle;
};

export type ChartSettingsValue = {
    candles: CandleColor;
    appearance: ChartAppearance;
};

export const DEFAULT_CANDLE_COLORS: CandleColor = {
    up: "#cf7b15",
    down: "#c4c3c2",
};

export const DEFAULT_CHART_APPEARANCE: ChartAppearance = {
    backgroundColor: "rgba(255,255,255,0.1)",
    gridColor: "#111212",
    secondaryColor: "#f97316",
    crosshairColor: "#ffffff",
    crosshairLineStyle: "dashed",
};

interface ChartSettingsProps {
    initialValue: ChartSettingsValue;
    defaultValue: ChartSettingsValue;
    onApply: (value: ChartSettingsValue) => void;
    onReset: () => void;
    onSave: () => boolean;
    onClose: () => void;
}

type ColorField =
    | "up"
    | "down"
    | "background"
    | "grid"
    | "secondary"
    | "crosshair";
type SettingsSection = "candles" | "background" | "crosshair";
type RgbChannel = "red" | "green" | "blue";

const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGBA_COLOR =
    /^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i;

const byteToHex = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, "0");

const normalizeHex = (value: string, includeAlpha: boolean) => {
    const hexMatch = value.trim().match(HEX_COLOR);
    if (hexMatch) {
        const raw = hexMatch[1];
        const expanded =
            raw.length <= 4
                ? raw
                      .split("")
                      .map((part) => `${part}${part}`)
                      .join("")
                : raw;
        const rgb = expanded.slice(0, 6);
        const alpha = expanded.slice(6, 8) || "ff";
        return `#${rgb}${includeAlpha ? alpha : ""}`.toLowerCase();
    }

    const rgbaMatch = value.trim().match(RGBA_COLOR);
    if (rgbaMatch) {
        const [, red, green, blue, alpha = "1"] = rgbaMatch;
        const rgb = `${byteToHex(Number(red))}${byteToHex(
            Number(green)
        )}${byteToHex(Number(blue))}`;
        return `#${rgb}${
            includeAlpha ? byteToHex(Number(alpha) * 255) : ""
        }`;
    }

    return includeAlpha ? "#ffffff1a" : "#ffffff";
};

const parseHex = (value: string) => {
    const normalized = normalizeHex(value, true);
    return {
        red: Number.parseInt(normalized.slice(1, 3), 16),
        green: Number.parseInt(normalized.slice(3, 5), 16),
        blue: Number.parseInt(normalized.slice(5, 7), 16),
        alpha: Number.parseInt(normalized.slice(7, 9), 16) / 255,
    };
};

const updateHexChannel = (
    color: string,
    channel: RgbChannel,
    nextValue: string,
    includeAlpha: boolean
) => {
    const next = parseHex(color);
    next[channel] = Math.min(255, Math.max(0, Number(nextValue) || 0));
    return `#${byteToHex(next.red)}${byteToHex(next.green)}${byteToHex(
        next.blue
    )}${includeAlpha ? byteToHex(next.alpha * 255) : ""}`;
};

const updateHexAlpha = (color: string, nextValue: string) => {
    const next = parseHex(color);
    const percentage = Math.min(100, Math.max(0, Number(nextValue) || 0));
    return `#${byteToHex(next.red)}${byteToHex(next.green)}${byteToHex(
        next.blue
    )}${byteToHex((percentage / 100) * 255)}`;
};

const CheckerSwatch = ({
    color,
    size = 28,
}: {
    color: string;
    size?: number;
}) => (
    <span
        className="kwant-settings-swatch"
        style={{
            width: size,
            height: size,
            backgroundColor: "#fff",
            backgroundImage:
                "linear-gradient(45deg,#c8c8c8 25%,transparent 25%),linear-gradient(-45deg,#c8c8c8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8c8c8 75%),linear-gradient(-45deg,transparent 75%,#c8c8c8 75%)",
            backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
            backgroundSize: "8px 8px",
        }}
    >
        <span className="absolute inset-0" style={{ backgroundColor: color }} />
    </span>
);

interface ColorEditorProps {
    label: string;
    value: string;
    allowAlpha: boolean;
    onChange: (value: string) => void;
    onApply: () => void;
    onReset: () => void;
    onCancel: () => void;
}

const ColorEditor = ({
    label,
    value,
    allowAlpha,
    onChange,
    onApply,
    onReset,
    onCancel,
}: ColorEditorProps) => {
    const pickerColor = normalizeHex(value, allowAlpha);
    const channels = parseHex(pickerColor);
    const [hexInput, setHexInput] = useState(pickerColor);

    useEffect(() => {
        setHexInput(pickerColor);
    }, [pickerColor]);

    return (
        <div className="kwant-color-editor kwant-settings-popover">
            <div className="kwant-settings-editor-heading">
                <span className="text-sm font-semibold text-white/80">
                    {label}
                </span>
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Close color picker"
                    className="text-lg text-white/50 transition hover:text-white"
                >
                    ×
                </button>
            </div>

            {allowAlpha ? (
                <HexAlphaColorPicker color={pickerColor} onChange={onChange} />
            ) : (
                <HexColorPicker color={pickerColor} onChange={onChange} />
            )}

            <div className="kwant-settings-rgb-grid">
                {(
                    [
                        ["R", "red"],
                        ["G", "green"],
                        ["B", "blue"],
                    ] as const
                ).map(([labelText, channel]) => (
                    <label key={channel}>
                        <span className="mb-1 block text-center text-xs text-white/40">
                            {labelText}
                        </span>
                        <input
                            type="number"
                            min="0"
                            max="255"
                            value={channels[channel]}
                            onChange={(event) =>
                                onChange(
                                    updateHexChannel(
                                        pickerColor,
                                        channel,
                                        event.target.value,
                                        allowAlpha
                                    )
                                )
                            }
                            className="kwant-settings-channel-input"
                        />
                    </label>
                ))}
                {allowAlpha ? (
                    <label>
                        <span className="mb-1 block text-center text-xs text-white/40">
                            A%
                        </span>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={Math.round(channels.alpha * 100)}
                            onChange={(event) =>
                                onChange(
                                    updateHexAlpha(
                                        pickerColor,
                                        event.target.value
                                    )
                                )
                            }
                            className="kwant-settings-channel-input"
                        />
                    </label>
                ) : (
                    <span className="kwant-settings-channel-swatch">
                        <CheckerSwatch color={value} size={32} />
                    </span>
                )}
            </div>

            <label className="kwant-settings-hex-row">
                <CheckerSwatch color={value} size={32} />
                <input
                    type="text"
                    value={hexInput}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setHexInput(nextValue);
                        if (HEX_COLOR.test(nextValue)) {
                            onChange(normalizeHex(nextValue, allowAlpha));
                        }
                    }}
                    className="kwant-settings-hex-input"
                    aria-label={`${label} hex color`}
                />
            </label>

            <div className="kwant-settings-editor-actions">
                <button
                    type="button"
                    onClick={onReset}
                    className="kwant-settings-button kwant-settings-button-muted"
                >
                    Reset
                </button>
                <div className="kwant-settings-footer-actions">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="kwant-settings-button kwant-settings-button-muted"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onApply}
                        className="kwant-settings-button kwant-settings-button-apply"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ColorControlProps {
    label: string;
    field: ColorField;
    value: string;
    allowAlpha: boolean;
    active: boolean;
    onToggle: (field: ColorField) => void;
}

const ColorControl = ({
    label,
    field,
    value,
    allowAlpha,
    active,
    onToggle,
}: ColorControlProps) => (
    <div className="kwant-settings-color-row">
        <span className="text-sm text-white/70">{label}</span>
        <div className="kwant-settings-color-value">
        <input
            type="text"
            value={normalizeHex(value, allowAlpha)}
            readOnly
            tabIndex={-1}
            className="kwant-settings-row-hex"
            aria-label={`${label} color`}
        />
        <button
            type="button"
            onClick={() => onToggle(field)}
            aria-label={`Edit ${label.toLowerCase()} color`}
            aria-expanded={active}
            className={`kwant-settings-swatch-button ${
                active ? "kwant-settings-swatch-button-active" : ""
            }`}
        >
            <CheckerSwatch color={value} size={32} />
            <span className="kwant-settings-edit-icon" aria-hidden="true">
                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
            </span>
        </button>
        </div>
    </div>
);

const ChartSettings: React.FC<ChartSettingsProps> = ({
    initialValue,
    defaultValue,
    onApply,
    onReset,
    onSave,
    onClose,
}) => {
    const [activeField, setActiveField] = useState<ColorField | null>(null);
    const [activeSection, setActiveSection] =
        useState<SettingsSection>("candles");
    const [draftColor, setDraftColor] = useState("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setSaved(false);
    }, [initialValue]);

    const controls: Array<{
        field: ColorField;
        label: string;
        value: string;
        defaultValue: string;
        allowAlpha: boolean;
    }> = [
        {
            field: "up",
            label: "Up",
            value: initialValue.candles.up,
            defaultValue: defaultValue.candles.up,
            allowAlpha: false,
        },
        {
            field: "down",
            label: "Down",
            value: initialValue.candles.down,
            defaultValue: defaultValue.candles.down,
            allowAlpha: false,
        },
        {
            field: "secondary",
            label: "Secondary",
            value: initialValue.appearance.secondaryColor,
            defaultValue: defaultValue.appearance.secondaryColor,
            allowAlpha: false,
        },
        {
            field: "crosshair",
            label: "Crosshair",
            value: initialValue.appearance.crosshairColor,
            defaultValue: defaultValue.appearance.crosshairColor,
            allowAlpha: false,
        },
        {
            field: "background",
            label: "Background",
            value: initialValue.appearance.backgroundColor,
            defaultValue: defaultValue.appearance.backgroundColor,
            allowAlpha: true,
        },
        {
            field: "grid",
            label: "Grid",
            value: initialValue.appearance.gridColor,
            defaultValue: defaultValue.appearance.gridColor,
            allowAlpha: false,
        },
    ];
    const activeControl = controls.find(
        (control) => control.field === activeField
    );
    const candleControls = controls.filter(
        (control) => control.field === "up" || control.field === "down"
    );
    const chartControls = controls.filter(
        (control) =>
            control.field === "secondary" ||
            control.field === "background" ||
            control.field === "grid"
    );
    const crosshairControl = controls.find(
        (control) => control.field === "crosshair"
    );

    const openEditor = (field: ColorField) => {
        if (field === activeField) {
            setActiveField(null);
            setDraftColor("");
            return;
        }
        const control = controls.find((item) => item.field === field);
        if (!control) return;
        setDraftColor(normalizeHex(control.value, control.allowAlpha));
        setActiveField(field);
    };

    const applyActiveColor = () => {
        if (!activeControl) return;

        const next: ChartSettingsValue = {
            candles: { ...initialValue.candles },
            appearance: { ...initialValue.appearance },
        };
        switch (activeControl.field) {
            case "up":
            case "down":
                next.candles[activeControl.field] = normalizeHex(
                    draftColor,
                    false
                );
                break;
            case "background":
                next.appearance.backgroundColor = normalizeHex(
                    draftColor,
                    true
                );
                break;
            case "grid":
                next.appearance.gridColor = normalizeHex(draftColor, false);
                break;
            case "secondary":
                next.appearance.secondaryColor = normalizeHex(
                    draftColor,
                    false
                );
                break;
            case "crosshair":
                next.appearance.crosshairColor = normalizeHex(
                    draftColor,
                    false
                );
                break;
        }
        onApply(next);
        setActiveField(null);
        setDraftColor("");
    };

    const applyCrosshairLineStyle = (lineStyle: CrosshairLineStyle) => {
        onApply({
            candles: { ...initialValue.candles },
            appearance: {
                ...initialValue.appearance,
                crosshairLineStyle: lineStyle,
            },
        });
    };

    const selectSection = (section: SettingsSection) => {
        setActiveSection(section);
        setActiveField(null);
        setDraftColor("");
    };

    return (
        <div
            className="kwant-settings-stage"
            data-editor-open={activeControl ? "true" : "false"}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="kwant-settings-title"
                className="kwant-settings-panel"
            >
                <div className="kwant-settings-header">
                    <h2
                        id="kwant-settings-title"
                        className="text-lg font-semibold text-white/80"
                    >
                        Settings
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close settings"
                        className="text-lg text-white/50 transition hover:text-white"
                    >
                        ×
                    </button>
                </div>

                <div
                    className="kwant-settings-tabs"
                    role="tablist"
                    aria-label="Chart settings"
                >
                    {(
                        [
                            ["candles", "Candles"],
                            ["background", "Background"],
                            ["crosshair", "Crosshair"],
                        ] as const
                    ).map(([section, label]) => (
                        <button
                            key={section}
                            type="button"
                            role="tab"
                            aria-selected={activeSection === section}
                            onClick={() => selectSection(section)}
                            className={`kwant-settings-tab ${
                                activeSection === section
                                    ? "kwant-settings-tab-active"
                                    : ""
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="kwant-settings-tab-panel" role="tabpanel">
                    {activeSection === "candles" && (
                        <div className="kwant-settings-control-list">
                            {candleControls.map((control) => (
                                <ColorControl
                                    key={control.field}
                                    {...control}
                                    active={activeField === control.field}
                                    onToggle={openEditor}
                                />
                            ))}
                        </div>
                    )}

                    {activeSection === "background" && (
                        <div className="kwant-settings-control-list">
                            {chartControls.map((control) => (
                                <ColorControl
                                    key={control.field}
                                    {...control}
                                    active={activeField === control.field}
                                    onToggle={openEditor}
                                />
                            ))}
                        </div>
                    )}

                    {activeSection === "crosshair" && (
                        <div className="kwant-settings-control-list">
                            {crosshairControl && (
                                <ColorControl
                                    {...crosshairControl}
                                    label="Color"
                                    active={activeField === "crosshair"}
                                    onToggle={openEditor}
                                />
                            )}
                            <label className="kwant-settings-select-row">
                                <span className="text-sm text-white/70">
                                    Line
                                </span>
                                <select
                                    value={
                                        initialValue.appearance
                                            .crosshairLineStyle
                                    }
                                    onChange={(event) =>
                                        applyCrosshairLineStyle(
                                            event.target
                                                .value as CrosshairLineStyle
                                        )
                                    }
                                    className="kwant-settings-select"
                                >
                                    <option value="solid">Solid</option>
                                    <option value="dashed">Dashed</option>
                                    <option value="dotted">Dotted</option>
                                </select>
                            </label>
                        </div>
                    )}
                </div>

                <div className="kwant-settings-footer">
                    <button
                        type="button"
                        onClick={() => {
                            onReset();
                            setActiveField(null);
                            setDraftColor("");
                            setSaved(false);
                        }}
                        className="kwant-settings-button kwant-settings-button-muted"
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={() => setSaved(onSave())}
                        className="kwant-settings-button kwant-settings-button-apply"
                    >
                        {saved ? "Saved" : "Save"}
                    </button>
                </div>
            </div>

            {activeControl && (
                <ColorEditor
                    label={activeControl.label}
                    value={draftColor}
                    allowAlpha={activeControl.allowAlpha}
                    onChange={setDraftColor}
                    onReset={() =>
                        setDraftColor(
                            normalizeHex(
                                activeControl.defaultValue,
                                activeControl.allowAlpha
                            )
                        )
                    }
                    onCancel={() => {
                        setActiveField(null);
                        setDraftColor("");
                    }}
                    onApply={applyActiveColor}
                />
            )}
        </div>
    );
};

export default ChartSettings;
