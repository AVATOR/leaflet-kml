### Unreleased

- `L.KML` now accepts a URL string and loads the file asynchronously via `fetch` (new `load` method, `loaded` / `error` events, `fetchOptions` option)
- Added `L.kml()` factory
- Added `examples/url.html` demo and a test suite (`npm test`)
- Fixed crash on `LineString` without `coordinates` and on `GroundOverlay` without `LatLonBox`
- Placemark `name` is now HTML-escaped in popups
- Fixed `GroundOverlay` inside a `Folder` being added twice (see windycom/leaflet-kml#33)

### 1.1.0

- Fixed markers wrong locations for already loaded icons
- Fixed #7 (Featured parsed inside MultiGeometry elements don't bind the correct placemark popup information)
- Fixed #9 (Image assets larger than 'iconSize' offset pop-up windows incorrectly when loaded from a warm cache)
- Fixed #14 (Disappearing polygons)

### 1.0.1

- Updated README

### 1.0.0

- Initial commit, original version with few fixes
