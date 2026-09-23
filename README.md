# Kwant

React canvas charts for candlesticks, numeric/time lines, and PnL displays.
Kwant owns rendering and interaction; callers own data fetching.

## Install

```bash
npm install kwant
```

Kwant v3 uses explicit stylesheets and does not inject a `<style>` element.

## Candlesticks

```tsx
import { KwantChart, type CandleSeries } from "kwant";
import "kwant/styles.css";

const series: CandleSeries[] = [
  {
    interval: "1m",
    data: [
      {
        start: Date.UTC(2026, 0, 1, 9, 30),
        end: Date.UTC(2026, 0, 1, 9, 31),
        open: 100,
        high: 103,
        low: 99,
        close: 102,
        volume: 1_250,
        trades: 42,
      },
    ],
  },
];

<KwantChart
  series={series}
  asset="ACME"
  sourceName="Example feed"
  showSource
  livePrice
  width={900}
  height={600}
/>;
```

Supply one series per available interval. Timestamps are Unix milliseconds.
Supported intervals are `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`,
`12h`, `1d`, `3d`, `1w`, and `1M`.

Replacement mode treats every `series` value as authoritative. For incremental
feeds, opt into bounded per-chart timestamp upserts:

```tsx
<KwantChart
  series={updates}
  asset="ACME"
  dataMode="upsert"
  dataKey="acme-feed-v1"
  maxPointsPerSeries={50_000}
/>;
```

Changing `dataKey` clears retained history. Invalid points are filtered and can
be observed through `onDataIssues`; set `invalidDataBehavior="throw"` for strict
validation.

## Price levels and draggable TP/SL

`KwantChart.priceLines` accepts static and editable price levels. Omit it (or use
`[]`) to disable caller-supplied levels. `livePrice` uses the same renderer and
remains independent of this array.

```tsx
import { useState } from "react";
import { KwantChart, type CandleSeries } from "kwant";

function ExitsChart({ series }: { series: readonly CandleSeries[] }) {
  const [takeProfit, setTakeProfit] = useState(110);
  const [stopLoss, setStopLoss] = useState(95);

  return <KwantChart
    series={series}
    livePrice
    priceLines={[
      { id: "entry", name: "Entry", value: 100 },
      {
        id: "tp", name: "TP", value: takeProfit,
        lineSettings: { color: "#22c55e", width: 1.5, style: "dashed" },
        draggable: { min: 100.1, step: 0.1, onChange: setTakeProfit },
      },
      {
      id: "sl", name: "SL", value: stopLoss,
      priceDisplay: false, // omit to show the price-scale badge
        lineSettings: { color: "#ef4444", style: "dashed" },
        draggable: {
        min: 0.1, max: 99.9, step: 0.1,
        removable: true,
        onRemove: () => console.log("Stop loss removed"), // optional
          onChange: setStopLoss,
          onCommit: (price) => console.log("Stop loss committed", price),
          onCancel: () => console.log("Edit cancelled"),
        },
      },
    ]}
  />;
}
```

Exported types: `PriceLine`, `PriceLineDragOptions`, and `LineSettings`.

- Each `id` must be unique within the supplied array. `value` must be finite.
- Omitted/`false` `draggable` means static. `{}` enables dragging. Bounds and
  callbacks belong inside `draggable`; use `editable ? { ...options } : false`
  to toggle editing.
- `min`/`max` are inclusive value constraints. Optional `step` is positive and
  snaps to multiples of the step anchored at zero. With non-aligned bounds, the
  nearest valid tick **inside** the bounds is used. Invalid configuration throws
  a `TypeError`, including duplicate IDs and bounds containing no valid tick.
- `onChange(value)` fires for changed drag previews and keyboard edits. Use it
  to update controlled React state. Pointer updates are coalesced to one per
  animation frame; release flushes the final value. `onCommit(value)` fires once
  on release if the final value differs from the starting value, or once per keyboard edit.
  You can update only in `onCommit` instead; the chart keeps its own temporary
  preview. With neither callback updating `value`, the line returns to its
  supplied value after release.
- Escape, pointer cancellation/lost capture, and window blur discard the preview,
  call `onChange` with the starting value if it changed, then call `onCancel`.
  External value/constraint changes, disabling/removing a line, changing
  asset/interval/data key, resizing, or unmounting cancel without overwriting
  caller state. Keep updates synchronous; persist externally in `onCommit`.
- Drag the plot line, name tag, or price badge using mouse, touch, or pen.
  Focus an editable level for Up/Down adjustments; Shift moves ten increments,
  Home/End use configured bounds. Without `step`, keyboard increments use 1% of
  the visible price range.
- Levels do not affect autoscaling. Offscreen levels are clipped. Dragging stops
  at the visible price range, and the scale stays fixed during a drag; pan/zoom
  to reach prices farther away. Reversing at a bound responds immediately, even
  after overshooting it. Existing out-of-bounds values remain visible as
  supplied until edited.
- `lineSettings` supports `color`, positive `width`, and `style` (`solid`,
  `dashed`, or `dotted`). Names appear on the plot; badges use `priceFormatter`.
  Later array entries appear above earlier entries when levels overlap.
- `priceDisplay` defaults to `true`. Set it to `false` to hide only that line's
  price-scale badge, for example when `name` already contains the value. The
  plot line and its drag/name controls remain available.
- `draggable.removable: true` adds a small × beside the name (or at the left
  edge for an unnamed line). It removes the plot line and price badge immediately;
  optional `draggable.onRemove()` notifies the app once. Removal works without
  a callback and survives ordinary prop updates and interval changes. The chart
  does not mutate your array: remove the ID from `priceLines` and later re-add it
  to restore it. Changing the asset/data key or remounting also clears removals.
  Removing a line during its drag cancels the gesture without committing it.
- Editable lines retain keyboard controls without a focus outline or glow.

## Generic line charts

```tsx
import { KwantLineChart, type LinePoint } from "kwant/line";
import "kwant/line.css";

const returns: LinePoint[] = [
  { x: Date.UTC(2026, 0, 1), y: 1.2 },
  { x: Date.UTC(2026, 0, 2), y: 1.8 },
];

<KwantLineChart
  data={returns}
  name="Strategy return"
  title="Performance"
  xAxis={{ scale: "time", label: "Time" }}
  yAxis={{ label: "Return", formatter: (value) => `${value.toFixed(2)}%` }}
/>;
```

Set `xAxis.scale="linear"` for ordinary numeric x values. Full layout supports
hover, keyboard point inspection, dragging, and cursor-anchored wheel zoom.

### PnL preset

PnL is a preset on the generic renderer, not a separate component:

```tsx
<KwantLineChart
  data={pnl}
  variant="pnl"
  xAxis={{ scale: "time", label: "Time" }}
  yAxis={{ label: "PnL", formatter: (value) => `$${value.toFixed(2)}` }}
/>
```

The preset includes zero in the domain, draws a zero reference line, and splits
the line and area fill into positive and negative colors at the exact crossing.
Override any preset option with `colorMode`, `areaFill`, `theme`, or `yAxis`.

Use `layout="compact"` for cards and table rows. Compact charts keep hover and
keyboard inspection but never capture scrolling, dragging, or pinch gestures.

## Appearance and formatting

Both charts accept a partial `theme`. `KwantChart` additionally supports runtime
settings with `showSettings` (enabled by default). Use `priceFormatter`,
`volumeFormatter`, and `timeFormatter` for application-specific display.

In Settings → Background, **Plot background** controls the plot fill, while
**Grid lines** controls horizontal and vertical grid strokes, including opacity.
Their initial/reset values come from `theme.plotBackground` and `theme.gridColor`.
Use **Save** to persist changes. Previously saved background colors are preserved.

Built-in time presentation supports `timeZone="UTC"` (default) and
`timeZone="local"`.

See [MIGRATION.md](./MIGRATION.md) when upgrading from v2.
