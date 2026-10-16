const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { L, parse, kml, read } = require('./setup');

const once = (target, name) => new Promise((resolve) => target.once(name, resolve));
const mockFetch = (impl) => { global.fetch = impl; };
const toBuffer = (data) => {
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
const okResponse = (data) => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => toBuffer(data) });
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

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
    assert.equal(requested.opts.credentials, 'include');
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

// --- loading by URL: relative links, abort, KMZ ---

const REL_KML = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    '<Style id="ic"><IconStyle><Icon><href>icons/pin.png</href></Icon></IconStyle></Style>' +
    '<Placemark><styleUrl>#ic</styleUrl><Point><coordinates>1,1</coordinates></Point></Placemark>' +
    '<GroundOverlay><Icon><href>img/o.png</href></Icon>' +
    '<LatLonBox><north>2</north><south>1</south><east>2</east><west>1</west></LatLonBox></GroundOverlay>' +
    '</Document></kml>';

const collect = (layer) => Object.values(layer._layers);

test('relative icon and overlay links are resolved against the KML URL', async () => {
    mockFetch(async () => okResponse(REL_KML));
    const layer = new L.KML('http://example.com/maps/track.kml');
    await once(layer, 'loaded');
    const marker = collect(layer).find((l) => l instanceof L.KMLMarker);
    const overlay = collect(layer).find((l) => l instanceof L.ImageOverlay);
    assert.equal(marker.options.icon.options.iconUrl, 'http://example.com/maps/icons/pin.png');
    assert.equal(overlay._url, 'http://example.com/maps/img/o.png');
});

test('absolute links are left untouched', () => {
    const opts = { baseUrl: 'http://example.com/a/b.kml' };
    assert.equal(L.KML.resolveHref('https://x.org/i.png', opts), 'https://x.org/i.png');
    assert.equal(L.KML.resolveHref('//x.org/i.png', opts), '//x.org/i.png');
    assert.equal(L.KML.resolveHref('data:image/png;base64,AAAA', opts), 'data:image/png;base64,AAAA');
    assert.equal(L.KML.resolveHref('i.png'), 'i.png');
});

test('parsing a Document directly does not rewrite links', () => {
    const layers = L.KML.parseKML(parse(REL_KML));
    const overlay = layers.find((l) => l instanceof L.ImageOverlay);
    assert.equal(overlay._url, 'img/o.png');
});

test('calling load() twice ignores the response of the first request', async () => {
    const pending = [];
    mockFetch((url, opts) => new Promise((resolve, reject) => {
        pending.push({ url, resolve });
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const layer = new L.KML();
    let loaded = 0, errors = 0;
    layer.on('loaded', () => loaded++).on('error', () => errors++);

    layer.load('http://x/first.kml');
    layer.load('http://x/second.kml');
    assert.equal(pending[0].url, 'http://x/first.kml');
    pending[0].resolve(okResponse(kml('<Placemark><Point><coordinates>1,1</coordinates></Point></Placemark>').documentElement.outerHTML));
    pending[1].resolve(okResponse('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>5,5</coordinates></Point>' +
        '</Placemark><Placemark><Point><coordinates>6,6</coordinates></Point></Placemark></Document></kml>'));
    await once(layer, 'loaded');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(loaded, 1);
    assert.equal(errors, 0);
    assert.equal(collect(layer).length, 2);
});

test('abort() cancels a pending request without firing events', async () => {
    let aborted = false;
    mockFetch((url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
            aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
    }));
    const layer = new L.KML('http://x/y.kml');
    let events = 0;
    layer.on('loaded error', () => events++);
    layer.abort();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(aborted);
    assert.equal(events, 0);
});

for (const kind of ['deflate', 'stored']) {
    test('loads a ' + kind + ' KMZ and serves packed images as blob URLs', async () => {
        mockFetch(async () => okResponse(fixture('sample-' + kind + '.kmz')));
        const layer = new L.KML('http://example.com/pack.kmz');
        await once(layer, 'loaded');
        const marker = collect(layer).find((l) => l instanceof L.KMLMarker);
        const overlay = collect(layer).find((l) => l instanceof L.ImageOverlay);
        assert.match(marker.options.icon.options.iconUrl, /^blob:/);
        assert.match(overlay._url, /^blob:/);
        layer.revokeResources();
        assert.equal(layer._resources, null);
    });
}

test('KMZ without a .kml file fires error', async () => {
    const buf = Buffer.from(fixture('sample-stored.kmz'));
    for (let i = buf.indexOf('doc.kml'); i >= 0; i = buf.indexOf('doc.kml', i + 1)) { buf.write('doc.txt', i); }
    mockFetch(async () => okResponse(buf));
    const e = await once(new L.KML('http://x/bad.kmz'), 'error');
    assert.match(e.error.message, /No \.kml file/);
});

test('icon in compact (non pretty-printed) KML is applied', () => {
    const layers = L.KML.parseKML(kml(
        '<Style id="ic"><IconStyle><Icon><href>a.png</href></Icon></IconStyle></Style>' +
        '<Placemark><styleUrl>#ic</styleUrl><Point><coordinates>1,1</coordinates></Point></Placemark>'));
    assert.equal(layers[0].options.icon.options.iconUrl, 'a.png');
});

// --- module formats (UMD) ---

const vm = require('node:vm');
const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'L.KML.js'), 'utf8');

test('CommonJS: require() returns L.KML and registers it on Leaflet', () => {
    assert.equal(require('../L.KML.js'), L.KML);
    assert.equal(require('leaflet').KML, L.KML);
});

const fakeLeaflet = () => {
    const cls = () => Object.assign(function () {}, { Default: function () {} });
    return {
        FeatureGroup: { extend: cls }, Icon: { extend: cls }, Marker: { extend: cls },
        ImageOverlay: { extend: cls }, Util: { extend: () => {} }
    };
};

test('AMD: registers as a module depending on leaflet', () => {
    const fake = fakeLeaflet();
    let deps, result;
    const context = { define: Object.assign((d, f) => { deps = d; result = f(fake); }, { amd: true }) };
    vm.runInNewContext(pluginSource, context);
    assert.equal(deps.length, 1);
    assert.equal(deps[0], 'leaflet');
    assert.equal(result, fake.KML);
});

test('browser global: attaches to window.L when no module system is present', () => {
    const fake = fakeLeaflet();
    vm.runInNewContext(pluginSource, { self: { L: fake } });
    assert.ok(fake.KML);
});
