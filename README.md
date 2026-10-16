# Leaflet KML layer plugin

![Example](assets/screenshot.jpg)

Demo: https://www.windy.com/uploader

This plugin was extracted from Pavel Shramov's Leaflet Plugins [repository](https://github.com/shramov/leaflet-plugins) in order to maintain this code more frequently and separate KML layer from other plugins.

So far we have fixed few issues.

Works with Leaflet 1.x (the test suite runs against Leaflet 1.9).

## How to use

```html
<html>
    <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="./L.KML.js"></script>
    </head>
    <body>
        <div style="width: 100vw; height: 100vh" id="map"></div>
        <script type="text/javascript">
            // Make basemap
            const map = new L.Map('map', { center: new L.LatLng(58.4, 43.0), zoom: 11 });
            const osm = new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');

            map.addLayer(osm);

            // Load kml file
            fetch('assets/example1.kml')
                .then(res => res.text())
                .then(kmltext => {
                    // Create new kml overlay
                    const parser = new DOMParser();
                    const kml = parser.parseFromString(kmltext, 'text/xml');
                    const track = new L.KML(kml);
                    map.addLayer(track);

                    // Adjust map to show the kml
                    const bounds = track.getBounds();
                    map.fitBounds(bounds);
                });
        </script>
    </body>
</html>

```

## Loading KML from a URL

Pass a URL string instead of a parsed document; the file is fetched asynchronously:

```js
const track = new L.KML('assets/example1.kml');
// or: L.kml('https://example.com/track.kml', { fetchOptions: { credentials: 'include' } });

track.on('loaded', () => {
    map.fitBounds(track.getBounds());
});
track.on('error', (e) => {
    console.error('KML failed to load', e.url, e.error);
});

map.addLayer(track);
```

- `loaded` fires once the layers have been added; `error` fires on network/HTTP errors and on invalid XML (`e.error`, `e.url`).
- `kmlOptions.fetchOptions` is passed to `fetch` (headers, credentials, etc.).
- Remote servers must allow cross-origin requests (CORS).
- Relative icon and `GroundOverlay` links are resolved against the URL of the KML file.
- **KMZ** is supported: if the response is a zip archive, the main `.kml` (`doc.kml`, otherwise the shallowest one) is parsed and packed images are served from `blob:` URLs. Compressed entries need `DecompressionStream` (all current browsers). Call `track.revokeResources()` when you discard the layer to free those URLs.
- Calling `load()` again, or `track.abort()`, cancels a request that is still in flight; its result is ignored.
- You can also call `track.load(url)` on an existing layer. Passing a parsed XML `Document` still works as before.

A runnable demo is in [examples/url.html](examples/url.html). `fetch` does not work from `file://`, so serve the repo first:

```bash
npm install
npm start
# opens http://localhost:8000/examples/url.html
```

## Tests

```bash
npm install
npm test
npm run lint
```

Tests run on Node's built-in test runner with jsdom (see `test/`).

## Licence

MIT
