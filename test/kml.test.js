const test = require('node:test');
const assert = require('node:assert/strict');
const { L, parse, kml, read } = require('./setup');

const once = (target, name) => new Promise((resolve) => target.once(name, resolve));
const mockFetch = (impl) => { global.fetch = impl; };
const okResponse = (text) => ({ ok: true, status: 200, statusText: 'OK', text: async () => text });

test('parses a Point placemark into a marker with popup', () => {
    const layers = L.KML.parseKML(kml(
        '<Placemark><name>Home</name><Point><coordinates>10.5,20.5,0</coordinates></Point></Placemark>'));
    assert.equal(layers.length, 1);
    assert.ok(layers[0] instanceof L.KMLMarker);
    assert.deepEqual([layers[0].getLatLng().lat, layers[0].getLatLng().lng], [20.5, 10.5]);
    assert.ok(layers[0].getPopup());
});

test('parses LineString and applies style from styleUrl', () => {
    const layers = L.KML.parseKML(kml(
        '<Style id="s"><LineStyle><color>ff0000ff</color><width>3</width></LineStyle></Style>' +
        '<Placemark><styleUrl>#s</styleUrl><LineString><coordinates>1,2 3,4</coordinates></LineString></Placemark>'));
    assert.ok(layers[0] instanceof L.Polyline);
    assert.equal(layers[0].options.weight, 3);
    assert.equal(layers[0].options.color, '#ff0000');
});

test('parses Polygon with fill', () => {
    const layers = L.KML.parseKML(kml(
        '<Style id="p"><PolyStyle><color>7f00ff00</color></PolyStyle></Style>' +
        '<Placemark><styleUrl>#p</styleUrl><Polygon><outerBoundaryIs><LinearRing>' +
        '<coordinates>0,0 0,1 1,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>'));
    assert.ok(layers[0] instanceof L.Polygon);
    assert.equal(layers[0].options.fill, true);
});

test('folders become feature groups', () => {
    const layers = L.KML.parseKML(kml(
        '<Folder><name>F</name>' +
        '<Placemark><Point><coordinates>1,1</coordinates></Point></Placemark>' +
        '<Placemark><Point><coordinates>2,2</coordinates></Point></Placemark></Folder>'));
    assert.equal(layers.length, 1);
    assert.ok(layers[0] instanceof L.FeatureGroup);
    assert.equal(layers[0].options.name, 'F');
});

test('example files parse without throwing', () => {
    for (const f of ['example1.kml', 'example2.kml']) {
        const layer = new L.KML(parse(read(f)));
        assert.ok(Object.keys(layer._layers).length > 0, f);
    }
});

test('L.KML with Document fires loaded synchronously-added layers', () => {
    const layer = new L.KML();
    let loaded = 0;
    layer.on('loaded', () => loaded++);
    layer.addKML(kml('<Placemark><Point><coordinates>1,1</coordinates></Point></Placemark>'));
    assert.equal(loaded, 1);
    assert.equal(layer.latLngs.length, 1);
});

test('L.KML with URL string fetches and fires loaded', async () => {
    let requested;
    mockFetch(async (url, opts) => {
        requested = { url, opts };
        return okResponse(read('example1.kml'));
    });
    const layer = new L.KML('http://x/y.kml', { fetchOptions: { credentials: 'include' } });
    await once(layer, 'loaded');
    assert.equal(requested.url, 'http://x/y.kml');
    assert.deepEqual(requested.opts, { credentials: 'include' });
    assert.ok(Object.keys(layer._layers).length > 0);
});

test('HTTP error fires error event', async () => {
    mockFetch(async () => ({ ok: false, status: 404, statusText: 'Not Found' }));
    const layer = new L.KML('http://x/missing.kml');
    const e = await once(layer, 'error');
    assert.equal(e.url, 'http://x/missing.kml');
    assert.match(e.error.message, /404/);
});

test('network failure fires error event', async () => {
    mockFetch(async () => { throw new TypeError('Failed to fetch'); });
    const e = await once(new L.KML('http://x/y.kml'), 'error');
    assert.match(e.error.message, /Failed to fetch/);
});

test('invalid XML fires error event', async () => {
    mockFetch(async () => okResponse('<kml><unclosed>'));
    const e = await once(new L.KML('http://x/bad.kml'), 'error');
    assert.match(e.error.message, /Invalid/);
});

test('L.kml factory returns an L.KML', () => {
    assert.ok(L.kml() instanceof L.KML);
});

// --- robustness: malformed / edge-case input should not throw ---

test('Point without coordinates is skipped', () => {
    assert.doesNotThrow(() => L.KML.parseKML(kml('<Placemark><Point></Point></Placemark>')));
});

test('LineString without coordinates is skipped', () => {
    assert.doesNotThrow(() => L.KML.parseKML(kml('<Placemark><LineString></LineString></Placemark>')));
});

test('GroundOverlay without LatLonBox is skipped', () => {
    assert.doesNotThrow(() => L.KML.parseKML(kml('<GroundOverlay><Icon><href>a.png</href></Icon></GroundOverlay>')));
});

test('popup does not inject raw HTML from the name element', () => {
    const layers = L.KML.parseKML(kml(
        '<Placemark><name>&lt;img src=x onerror=alert(1)&gt;</name><Point><coordinates>1,1</coordinates></Point></Placemark>'));
    assert.ok(!/<img/.test(layers[0].getPopup().getContent()));
});

test('gx:Track yields one point per gx:coord (no duplication across tracks)', () => {
    const layers = L.KML.parseKML(parse(
        '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>' +
        '<Placemark><gx:Track><gx:coord>1 2 0</gx:coord><gx:coord>3 4 0</gx:coord></gx:Track></Placemark>' +
        '</Document></kml>'));
    assert.equal(layers[0].getLatLngs().length, 2);
});

test('GroundOverlay inside a Folder is added once, not also at top level', () => {
    const layers = L.KML.parseKML(kml(
        '<Folder><name>F</name><GroundOverlay><Icon><href>a.png</href></Icon>' +
        '<LatLonBox><north>2</north><south>1</south><east>2</east><west>1</west></LatLonBox>' +
        '</GroundOverlay></Folder>'));
    assert.equal(layers.length, 1);
    assert.ok(layers[0] instanceof L.ImageOverlay);
});
