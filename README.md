# Leaflet KML layer plugin

![Example](assets/screenshot.jpg)

Displays KML and KMZ files on a [Leaflet](https://leafletjs.com) map. A file can be given as a URL (it is fetched for you) or as an already parsed XML document.

Demo: https://www.windy.com/uploader · [examples/url.html](examples/url.html) (load by URL)

This plugin was extracted from Pavel Shramov's Leaflet Plugins [repository](https://github.com/shramov/leaflet-plugins) in order to maintain this code more frequently and separate KML layer from other plugins.

## Requirements

- **Leaflet** 1.x (`peerDependencies: leaflet ^1.0.0`). The test suite runs against Leaflet 1.9. Leaflet 2 is not supported yet.
- **Browsers:** current versions of Chrome, Firefox, Safari and Edge. The plugin uses `fetch`, `Promise` and `TextDecoder` (Internet Explorer is not supported). `AbortController` is used when available. Compressed **KMZ** files additionally need `DecompressionStream` (all major browsers since 2023); stored (uncompressed) KMZ entries work without it.
- No other dependencies.

## Installation

```bash
npm install leaflet leaflet-kml
```

Use it as a module (CommonJS, AMD and ES module imports through a bundler all work):

```js
import L from 'leaflet';
import KML from 'leaflet-kml'; // also registers L.KML

const track = new KML('track.kml');
```

or with plain script tags, after Leaflet:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="./L.KML.js"></script>
```

## Usage

### From a URL (KML or KMZ)

```js
const map = L.map('map').setView([58.4, 43.0], 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const track = new L.KML('assets/example1.kml');
// or: L.kml('https://example.com/track.kmz', { fetchOptions: { credentials: 'include' } });

track.on('loaded', () => map.fitBounds(track.getBounds()));
track.on('error', (e) => console.error('KML failed to load', e.url, e.error));

map.addLayer(track);
```

### From a parsed document

```js
fetch('assets/example1.kml')
    .then(res => res.text())
    .then(text => {
        const kml = new DOMParser().parseFromString(text, 'text/xml');
        const track = new L.KML(kml);
        map.addLayer(track);
        map.fitBounds(track.getBounds());
    });
```

### Running the demo

`fetch` does not work from `file://`, so serve the repository:

```bash
npm install
npm start
# opens http://localhost:8000/examples/url.html
```

## API reference

### `L.KML`

Extends [`L.FeatureGroup`](https://leafletjs.com/reference.html#featuregroup), so all its methods (`getBounds()`, `eachLayer()`, `clearLayers()`, …) and events are available.

#### Creation

| Factory | Description |
| --- | --- |
| `new L.KML(source?, options?)` | `source` is a URL `String` (loaded with `load()`) or an XML `Document` (parsed immediately). Without `source` an empty layer is created. |
| `L.kml(source?, options?)` | Factory shorthand. |

#### Options

Passed as the second argument (also to `load()` and `addKML()`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `iconOptions` | `Object` | `{}` | Extra options for marker icons ([`L.Icon`](https://leafletjs.com/reference.html#icon) options, e.g. `iconSize`). The default icon size is `[32, 32]`. |
| `fetchOptions` | `Object` | `{}` | Options passed to `fetch()` when loading from a URL (`headers`, `credentials`, `signal`, …). If you do not provide a `signal`, the plugin uses its own to support `abort()`. |

#### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `load(url, options?)` | `this` | Fetches a KML or KMZ file and adds its content. Relative icon and overlay links are resolved against `url`. A call cancels a previous request that is still in flight; its result is ignored. |
| `abort()` | `this` | Cancels a pending `load()` request. Fires no event. |
| `addKML(xmlDocument, options?)` | – | Parses an XML document and adds its content to the layer. |
| `revokeResources()` | `this` | Releases the `blob:` URLs created for images packed in a KMZ. Call it when the layer is discarded. |

The layer's `latLngs` property is an array of all coordinates found in the last added document.

#### Events

| Event | Data | Description |
| --- | --- | --- |
| `loaded` | – | Fired after the content was added (from `addKML()` or a finished `load()`). Not fired for a document without any displayable features. |
| `error` | `{ error: Error, url: String }` | Fired when `load()` fails: network error, HTTP status other than 2xx, invalid XML, or a KMZ without a `.kml` file. Not fired for aborted requests. |
| `addlayer` | `{ layer: ILayer }` | Fired for every top-level layer created from the document, just before it is added. |

#### Static methods

| Method | Description |
| --- | --- |
| `L.KML.parseKML(xmlDocument, options?)` | Returns an array of Leaflet layers for a document without creating an `L.KML`. |
| `L.KML.getLatLngs(xmlDocument)` | Returns every coordinate of the document as `L.LatLng[]`. |

### KML support

| KML element | Result |
| --- | --- |
| `Placemark` with `Point` | `L.KMLMarker` (an `L.Marker`) |
| `LineString`, `gx:Track` | `L.Polyline` |
| `Polygon` (with holes) | `L.Polygon`; several outer boundaries give an `L.MultiPolygon` |
| `MultiGeometry`, `MultiTrack` | Layers grouped in an `L.FeatureGroup` |
| `Folder` | `L.FeatureGroup` with `options.name` set to the folder name |
| `GroundOverlay` | `L.RotatedImageOverlay` (an `L.ImageOverlay` with `rotation` support) |
| `Style`, `StyleMap` (`normal`) | `LineStyle` colour/width, `PolyStyle` colour, `IconStyle` icon and hot spot; applied via `styleUrl` or inline |
| `name`, `description` | Popup with the name as a heading (class `kml-popup`). The name is escaped; **the description is inserted as HTML**, as KML specifies. Do not load untrusted files without sanitising it. |

Not supported: `NetworkLink`, `ScreenOverlay`, `PhotoOverlay`, `Model`, time primitives, `<fill>`/`<outline>`, `StyleMap` `highlight` pairs, ZIP64 or encrypted KMZ.

### KMZ

If the response is a zip archive, the main `.kml` (`doc.kml`, otherwise the shallowest `.kml`) is parsed and packed images (`png`, `jpg`, `gif`, `webp`, `svg`) are served from `blob:` URLs, so icons and overlays inside the archive work.

### CORS

When loading from another origin, the server must send CORS headers.

## Development

```bash
npm install
npm test        # Node test runner + jsdom
npm run lint    # ESLint
```

Tests are in `test/`; CI runs lint and tests on Node 20 and 22.

## Licence

MIT. See [LICENSE](LICENSE).
