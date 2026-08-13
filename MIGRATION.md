# Migrating from Kwant v2 to v3

Kwant v3 intentionally replaces the candle-only flat API with grouped candle
series and adds a generic line-chart entry.

## Styles

Styles are no longer injected by importing JavaScript:

```tsx
import "kwant/styles.css"; // candlestick chart
import "kwant/line.css";   // line chart
```

## Candle input

Replace `hlocv_data={candles}` with grouped series:

```tsx
<KwantChart
  asset="BTC"
  series={[{ interval: "1m", data: candles }]}
/>
```

Remove `asset` and `interval` from each candle. Put the asset on `KwantChart`
and the interval on `CandleSeries`. `volume` and `trades` are now optional.

## Prop names

| v2 | v3 |
| --- | --- |
| `hlocv_data` | `series` |
| `source_name` | `sourceName` |
| `show_source` | `showSource` |
| `live_price` | `livePrice` |
| `configurable` | `showSettings` |
| `enable_caching` | `dataMode="upsert"` |
| individual color props | `theme` |

The global candle cache and `clearCandleCache` were removed. Upsert history now
belongs to each mounted chart, is bounded by `maxPointsPerSeries`, and resets
when `dataKey` changes.

`TimeFrame`, `TIMEFRAME_CAMELCASE`, `TF_TO_MS`, `into`, and `fromTimeFrame` are
no longer public. Use the `CandleInterval` string union.

Saved v2 appearance settings are not migrated because the v3 theme schema
separates plot background from actual grid color.
