# Changelog

## 3.0.0

- Added the generic `KwantLineChart` with time/numeric axes, full/compact layouts,
  threshold coloring, and a PnL preset.
- Replaced flat candles with grouped `CandleSeries` input and camelCase props.
- Replaced global caching with bounded per-chart replacement/upsert modes.
- Corrected negative and flat value domains, stable dense-candle aggregation,
  real-data crosshair snapping, and logarithmic nearest-point lookup.
- Added formatter callbacks, data diagnostics, controlled intervals, chart event
  callbacks, container-responsive styles, and settings focus management.
- Added explicit CSS exports and removed runtime style injection.
- Added core, SSR/component, bundle, and package smoke tests.

See [MIGRATION.md](./MIGRATION.md) for breaking changes.
