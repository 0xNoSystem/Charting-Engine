import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { KwantChart, type CandleSeries, type PriceLine, type PriceLineDragOptions } from "../../src";
import "../../src/index.css";

function Fixture() {
    const [value, setValue] = useState(108);
    const [show, setShow] = useState(true);
    const [editable, setEditable] = useState(true);
    const [revision, setRevision] = useState(0);
    const [asset, setAsset] = useState("TEST");
    const [commits, setCommits] = useState<number[]>([]);
    const [changes, setChanges] = useState<number[]>([]);
    const [cancels, setCancels] = useState(0);
    const [removals, setRemovals] = useState(0);
    const [removable, setRemovable] = useState(false);
    const [priceDisplay, setPriceDisplay] = useState(true);
    const [lineName, setLineName] = useState<string | undefined>("Take profit");
    const [bounds, setBounds] = useState<PriceLineDragOptions>({ min: 101.2, max: 115.3, step: 0.5 });
    const [range, setRange] = useState<unknown>(null);
    const commitOnly = new URLSearchParams(location.search).has("commitOnly");
    const series = useMemo<CandleSeries[]>(() => [{ interval: "1h", data: Array.from({ length: 120 }, (_, i) => ({
        start: Date.UTC(2026, 0, 1) + i * 3600000,
        end: Date.UTC(2026, 0, 1) + (i + 1) * 3600000,
        open: 100, close: 102, low: 80, high: 120 + revision * 100,
    })) }], [revision]);
    const lines: PriceLine[] = [
        { id: "entry", value: 100, name: "Entry", priceDisplay, lineSettings: { color: "#aaa", style: "solid" } },
        ...(show ? [{ id: "tp", name: lineName, value, priceDisplay, lineSettings: { color: "#22c55e", style: "dashed" as const },
            draggable: editable ? { ...bounds,
                removable,
                onRemove: new URLSearchParams(location.search).has("noRemoveCallback") ? undefined : () => {
                    setRemovals((prev) => prev + 1);
                    if (new URLSearchParams(location.search).has("controlledRemove")) setShow(false);
                },
                onChange: (next: number) => { setChanges((prev) => [...prev, next]); if (!commitOnly) setValue(next); },
                onCommit: (next: number) => { setValue(next); setCommits((prev) => [...prev, next]); },
                onCancel: () => setCancels((prev) => prev + 1),
            } : false as const,
        }] : []),
    ];
    Object.assign(window, { harness: { setValue, setShow, setEditable, setRevision, setAsset, setBounds, setRemovable, setPriceDisplay, setLineName } });
    return <>
        <KwantChart series={series} asset={asset} livePrice priceLines={lines} width={900} height={500}
            theme={{ plotBackground: "#101820", gridColor: "#445566" }}
            onVisibleRangeChange={setRange} priceFormatter={(n) => n.toFixed(2)} />
        <output id="value">{value}</output>
        <output id="changes">{JSON.stringify(changes)}</output>
        <output id="commits">{JSON.stringify(commits)}</output>
        <output id="cancels">{cancels}</output>
        <output id="removals">{removals}</output>
        <output id="range">{JSON.stringify(range)}</output>
    </>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
