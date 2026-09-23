import React, { useRef } from "react";
import { useChartContext } from "../ChartContextStore";
import { usePriceLines } from "../PriceLinesContext";
import { priceToY } from "../utils";

const DASH = { solid: undefined, dashed: "6 4", dotted: "1 4" };

function RemoveButton({ id, name, x, y, color, onRemove }: {
    id: string; name: string; x: number; y: number; color: string; onRemove: () => void;
}) {
    const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    return <g className="kwant-price-line-remove" role="button" tabIndex={0}
        aria-label={`Remove ${name}`} data-price-line-remove={id}
        pointerEvents="all" style={{ cursor: "pointer", touchAction: "none" }}
        onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
            event.stopPropagation();
            const start = press.current;
            if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
                start.moved = true;
            }
        }}
        onPointerUp={(event) => {
            event.stopPropagation();
            const start = press.current;
            if (!start || start.id !== event.pointerId) return;
            press.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
            // Native chart touch handlers suppress synthesized clicks; activate on release.
            if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 6) onRemove();
        }}
        onPointerCancel={() => { press.current = null; }}
        onLostPointerCapture={() => { press.current = null; }}
        onMouseDown={stop} onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop}
        onClick={(event) => {
            event.stopPropagation();
            // Assistive-technology activation; pointer clicks were handled above.
            if (event.detail === 0) onRemove();
        }}
        onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!event.repeat) onRemove();
            }
        }}>
        <rect x={x} y={y - 10} width={20} height={20} rx={3}
            fill="var(--kwant-grid-color, #111212)" />
        <path d={`M${x + 7} ${y - 3}l6 6m0 -6l-6 6`}
            stroke={color} strokeWidth={1.5} strokeLinecap="round" pointerEvents="none" />
        <title>Remove {name}</title>
    </g>;
}

/** Both plot strokes and axis badges consume the same resolved values and gestures. */
export default function PriceLines({ axis }: {
    axis?: { x: number; width: number; fontSize: number; format: (value: number) => string };
}) {
    const { width, height, minPrice, maxPrice } = useChartContext();
    const { lines, activeId, interaction, remove } = usePriceLines();
    if (height <= 0 || width <= 0 || maxPrice <= minPrice) return null;

    return <>{lines.map(({ key, line }) => {
        if (axis && line.priceDisplay === false) return null;
        const y = priceToY(line.value, minPrice, maxPrice, height);
        if (!Number.isFinite(y) || ((y < 0 || y > height) && activeId !== line.id)) return null;
        const color = line.lineSettings?.color ?? "var(--kwant-secondary, #f97316)";
        const strokeWidth = line.lineSettings?.width ?? 1;
        const labelY = Math.max(10, Math.min(height - 10, y));
        const removable = Boolean(line.draggable && line.draggable.removable);
        const nameWidth = Math.min(Math.max(0, width - (removable ? 40 : 16)), (line.name?.length ?? 0) * 7 + 16);
        const removeX = 8;
        const nameX = removable ? removeX + 20 + 4 : 8;
        return <React.Fragment key={key}><g className="kwant-price-line" data-price-line-id={line.id}
            data-price-line-part={axis ? "axis" : "plot"} data-price-line-value={line.value}
            {...interaction(line)}>
            {axis ? <>
                <rect x={axis.x} y={labelY - 10} width={axis.width} height={20} rx={4}
                    fill="var(--kwant-grid-color, #111212)" stroke={color} />
                <text x={axis.x + axis.width / 2} y={labelY} textAnchor="middle"
                    dominantBaseline="central" fill={color} fontSize={axis.fontSize} fontWeight="bold">
                    {axis.format(line.value)}
                </text>
            </> : <>
                <line x1={0} x2={width} y1={y} y2={y} stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={DASH[line.lineSettings?.style ?? "solid"]} strokeLinecap="round" />
                {line.draggable && <line x1={0} x2={width} y1={y} y2={y} stroke="transparent"
                    strokeWidth={Math.max(16, strokeWidth)} />}
                {line.name && <>
                    <rect x={nameX} y={labelY - 10} width={nameWidth} height={20} rx={4}
                        fill="var(--kwant-grid-color, #111212)" stroke={color} />
                    <svg x={nameX} y={labelY - 10} width={nameWidth} height={20} overflow="hidden">
                        <text x={8} y={10} dominantBaseline="central" fill={color} fontSize={12}>{line.name}</text>
                    </svg>
                </>}
            </>}
            <title>{line.name || line.id}: {line.value}{line.draggable ? " — drag or use Up/Down; Escape cancels" : ""}</title>
        </g>
            {!axis && removable && <RemoveButton id={line.id} name={line.name || line.id}
                x={removeX} y={labelY} color={color} onRemove={() => remove(line.id)} />}
        </React.Fragment>;
    })}</>;
}
