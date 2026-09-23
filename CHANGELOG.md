# Changelog

## Unreleased

- Renamed the settings “Grid” control to “Plot background” and added actual
  “Grid lines” color/opacity editing, with saved-setting migration and reset support.

- Added optional `draggable.removable` × buttons with `onRemove` notifications,
  per-line `priceDisplay` (default true), and removed draggable focus decoration.

- Added optional `KwantChart.priceLines` for static and draggable price levels,
  with nested bounds, tick snapping, and per-line change/commit/cancel callbacks.
- Unified the live-price line and caller-supplied levels under the same renderer.
- Added mouse/touch/pen capture, keyboard edits, cancellation, and scale locking
  during line drags, plus real-browser interaction coverage.

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
