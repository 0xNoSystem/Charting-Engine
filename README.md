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

Built-in time presentation supports `timeZone="UTC"` (default) and
`timeZone="local"`.

See [MIGRATION.md](./MIGRATION.md) when upgrading from v2.
