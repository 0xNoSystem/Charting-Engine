# Kwant

[![npm](https://img.shields.io/npm/v/kwant)](https://www.npmjs.com/package/kwant)

`KwantChart` renders caller-provided HLOCV candle data. It does not fetch market
data or depend on any exchange-specific API.

```tsx
import { KwantChart, type CandleData } from "kwant";

const candles: CandleData[] = [
  {
    start: Date.UTC(2026, 0, 1, 9, 30),
    end: Date.UTC(2026, 0, 1, 9, 31),
    open: 100,
    high: 103,
    low: 99,
    close: 102,
    volume: 1_250,
    trades: 42,
    asset: "ACME",
    interval: "1m",
  },
];

<KwantChart
  hlocv_data={candles}
  source_name="Example feed"
  enable_caching
  configurable
  live_price
  width={900}
  height={600}
/>;
```

Set `configurable={false}` to hide the settings control and prevent end users
from changing candle, background, grid, secondary, or crosshair colors.
Set `show_source` to display the truncated `source_name` in the chart header;
it is hidden by default.

Set `live_price` to show the latest candle close as a dotted horizontal line
with a matching price-scale label.

`hlocv_data` is required. Supported `interval` values are `1m`, `3m`, `5m`,
`15m`, `30m`, `1h`, `2h`, `4h`, `12h`, `1d`, `3d`, `1w`, and `1M`.
The chart enables only timeframes present in the supplied data.

Caching is disabled by default. When `enable_caching` and a non-empty
`source_name` are both provided, incoming candles are retained per source and
interval; newer records replace the same timestamp. This supports incremental
history, but omitted timestamps are intentionally retained. Clear a stream
after an authoritative reset or deletion:

```ts
import { clearCandleCache } from "kwant";

clearCandleCache("Example feed"); // one source
clearCandleCache(); // every source
```
