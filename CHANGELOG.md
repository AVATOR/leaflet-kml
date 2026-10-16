### Unreleased

- `L.KML` now accepts a URL string and loads the file asynchronously via `fetch` (new `load` method, `loaded` / `error` events, `fetchOptions` option)
- Added `L.kml()` factory
- Loading by URL: pending request is cancelled by a new `load()` or `abort()` (AbortController), relative icon/overlay links are resolved against the file URL, KMZ archives are supported (`revokeResources()` frees the extracted images)
- Fixed icons being ignored in KML without whitespace between `<IconStyle>` and `<Icon>`; inline placemark styles now honour `iconOptions`
- Added `examples/url.html` demo and a test suite (`npm test`)
- Fixed crash on `LineString` without `coordinates` and on `GroundOverlay` without `LatLonBox`
- Placemark `name` is now HTML-escaped in popups
- Fixed `GroundOverlay` inside a `Folder` being added twice (see windycom/leaflet-kml#33)
- Added GitHub Actions CI (lint + tests), ESLint config and `.editorconfig`; code cleaned up to pass lint
- Package metadata points to this repository; README examples use HTTPS and Leaflet 1.9

### 1.1.0

- Fixed markers wrong locations for already loaded icons
- Fixed #7 (Featured parsed inside MultiGeometry elements don't bind the correct placemark popup information)
- Fixed #9 (Image assets larger than 'iconSize' offset pop-up windows incorrectly when loaded from a warm cache)
- Fixed #14 (Disappearing polygons)

### 1.0.1

- Updated README

### 1.0.0

- Initial commit, original version with few fixes
