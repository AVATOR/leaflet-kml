/*!
    Copyright (c) 2011-2015, Pavel Shramov, Bruno Bergot - MIT licence
*/

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['leaflet'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('leaflet'));
    } else {
        factory(root.L);
    }
}(typeof self !== 'undefined' ? self : this, function (L) {

L.KML = L.FeatureGroup.extend({

    initialize: function (kml, kmlOptions) {
        this._kml = kml;
        this._layers = {};
        this._kmlOptions = kmlOptions;

        if (typeof kml === 'string') {
            this.load(kml, kmlOptions);
        } else if (kml) {
            this.addKML(kml, kmlOptions);
        }
    },

    // Load KML or KMZ from a URL (fetch options may be passed as kmlOptions.fetchOptions).
    // Fires 'loaded' on success and 'error' ({error: Error, url: url}) on failure.
    // Calling load() again (or abort()) cancels a request that is still in flight.
    // Relative icon/overlay links are resolved against the URL of the file.
    load: function (url, kmlOptions) {
        var self = this;
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var fetchOptions = L.Util.extend({}, kmlOptions && kmlOptions.fetchOptions);
        if (controller && !fetchOptions.signal) { fetchOptions.signal = controller.signal; }

        this.abort();
        this._abortController = controller;
        this._kml = url;

        function isCurrent() { return self._kml === url && self._abortController === controller; }

        fetch(url, fetchOptions)
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('Failed to load KML: ' + res.status + ' ' + res.statusText);
                }
                return res.arrayBuffer();
            })
            .then(function (buffer) {
                if (!L.KML._isZip(buffer)) {
                    return { text: new TextDecoder('utf-8').decode(buffer), resources: null };
                }
                return L.KML._readKMZ(buffer);
            })
            .then(function (content) {
                if (!isCurrent()) { return; }
                var xml = new DOMParser().parseFromString(content.text, 'text/xml');
                if (xml.getElementsByTagName('parsererror').length) {
                    throw new Error('Invalid KML/XML: ' + url);
                }
                self._abortController = null;
                self._resources = content.resources;
                self.addKML(xml, L.Util.extend({}, kmlOptions, {
                    baseUrl: url,
                    resources: content.resources
                }));
            })
            .catch(function (error) {
                if (!isCurrent() || (error && error.name === 'AbortError')) { return; }
                self._abortController = null;
                self.fire('error', { error: error, url: url });
            });

        return this;
    },

    // Cancel a pending load() request, if any.
    abort: function () {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
        return this;
    },

    // Release blob: URLs created for the images of a KMZ file.
    // Call it when the layer is no longer needed.
    revokeResources: function () {
        var res = this._resources;
        for (var name in res) {
            if (Object.prototype.hasOwnProperty.call(res, name)) { URL.revokeObjectURL(res[name]); }
        }
        this._resources = null;
        return this;
    },

    addKML: function (xml, kmlOptions) {
        var layers = L.KML.parseKML(xml, kmlOptions);
        if (!layers || !layers.length) return;
        for (var i = 0; i < layers.length; i++) {
            this.fire('addlayer', {
                layer: layers[i]
            });
            this.addLayer(layers[i]);
        }
        this.latLngs = L.KML.getLatLngs(xml);
        this.fire('loaded');
    },

    latLngs: []
});

L.Util.extend(L.KML, {

    parseKML: function (xml, kmlOptions) {
        var style = this.parseStyles(xml, kmlOptions);
        this.parseStyleMap(xml, style);
        var el = xml.getElementsByTagName('Folder');
        var layers = [], l;
        for (var i = 0; i < el.length; i++) {
            if (!this._check_folder(el[i])) { continue; }
            l = this.parseFolder(el[i], style, kmlOptions);
            if (l) { layers.push(l); }
        }
        el = xml.getElementsByTagName('Placemark');
        for (var j = 0; j < el.length; j++) {
            if (!this._check_folder(el[j])) { continue; }
            l = this.parsePlacemark(el[j], xml, style, undefined, kmlOptions);
            if (l) { layers.push(l); }
        }
        el = xml.getElementsByTagName('GroundOverlay');
        for (var k = 0; k < el.length; k++) {
            if (!this._check_folder(el[k])) { continue; }
            l = this.parseGroundOverlay(el[k], kmlOptions);
            if (l) { layers.push(l); }
        }
        return layers;
    },

    // Return false if e's first parent Folder is not [folder]
    // - returns true if no parent Folders
    _check_folder: function (e, folder) {
        e = e.parentNode;
        while (e && e.tagName !== 'Folder')
        {
            e = e.parentNode;
        }
        return !e || e === folder;
    },

    parseStyles: function (xml, kmlOptions) {
        var styles = {};
        var sl = xml.getElementsByTagName('Style');
        for (var i=0, len=sl.length; i<len; i++) {
            var style = this.parseStyle(sl[i], kmlOptions);
            if (style) {
                var styleName = '#' + style.id;
                styles[styleName] = style;
            }
        }
        return styles;
    },

    parseStyle: function (xml, kmlOptions) {
        var style = {}, poptions = {}, ioptions = {}, el, id;

        var attributes = {color: true, width: true, Icon: true, href: true, hotSpot: true};

        function _parse (xml) {
            var options = {};
            for (var i = 0; i < xml.childNodes.length; i++) {
                var e = xml.childNodes[i];
                var key = e.tagName;
                if (!attributes[key]) { continue; }
                if (key === 'hotSpot')
                {
                    for (var j = 0; j < e.attributes.length; j++) {
                        options[e.attributes[j].name] = e.attributes[j].nodeValue;
                    }
                } else {
                    var value = (e.childNodes && e.childNodes.length) ? e.childNodes[0].nodeValue : null;
                    // <Icon> holds child elements, so it has no text value of its own
                    if (!value && key !== 'Icon') {
                        continue;
                    }
                    if (key === 'color') {
                        options.opacity = parseInt(value.substring(0, 2), 16) / 255.0;
                        options.color = '#' + value.substring(6, 8) + value.substring(4, 6) + value.substring(2, 4);
                    } else if (key === 'width') {
                        options.weight = parseInt(value);
                    } else if (key === 'Icon') {
                        ioptions = _parse(e);
                        if (ioptions.href) { options.href = ioptions.href; }
                    } else if (key === 'href') {
                        options.href = value;
                    }
                }
            }
            return options;
        }

        el = xml.getElementsByTagName('LineStyle');
        if (el && el[0]) { style = _parse(el[0]); }
        el = xml.getElementsByTagName('PolyStyle');
        if (el && el[0]) { poptions = _parse(el[0]); }
        if (poptions.color) { style.fillColor = poptions.color; }
        if (poptions.opacity) { style.fillOpacity = poptions.opacity; }
        el = xml.getElementsByTagName('IconStyle');
        if (el && el[0]) { ioptions = _parse(el[0]); }
        if (ioptions.href) {
            var iconOptions = {
                iconUrl: this.resolveHref(ioptions.href, kmlOptions),
                shadowUrl: null,
                anchorRef: {x: ioptions.x, y: ioptions.y},
                anchorType:    {x: ioptions.xunits, y: ioptions.yunits}
            };

            if (typeof kmlOptions === "object" && typeof kmlOptions.iconOptions === "object") {
                L.Util.extend(iconOptions, kmlOptions.iconOptions);
            }

            style.icon = new L.KMLIcon(iconOptions);
        }

        id = xml.getAttribute('id');
        if (id && style) {
            style.id = id;
        }

        return style;
    },

    parseStyleMap: function (xml, existingStyles) {
        var sl = xml.getElementsByTagName('StyleMap');

        for (var i = 0; i < sl.length; i++) {
            var e = sl[i], el;
            var smKey, smStyleUrl;

            el = e.getElementsByTagName('key');
            if (el && el[0]) { smKey = el[0].textContent; }
            el = e.getElementsByTagName('styleUrl');
            if (el && el[0]) { smStyleUrl = el[0].textContent; }

            if (smKey === 'normal')
            {
                existingStyles['#' + e.getAttribute('id')] = existingStyles[smStyleUrl];
            }
        }

        return;
    },

    parseFolder: function (xml, style, kmlOptions) {
        var el, layers = [], l;
        el = xml.getElementsByTagName('Folder');
        for (var i = 0; i < el.length; i++) {
            if (!this._check_folder(el[i], xml)) { continue; }
            l = this.parseFolder(el[i], style, kmlOptions);
            if (l) { layers.push(l); }
        }
        el = xml.getElementsByTagName('Placemark');
        for (var j = 0; j < el.length; j++) {
            if (!this._check_folder(el[j], xml)) { continue; }
            l = this.parsePlacemark(el[j], xml, style, undefined, kmlOptions);
            if (l) { layers.push(l); }
        }
        el = xml.getElementsByTagName('GroundOverlay');
        for (var k = 0; k < el.length; k++) {
            if (!this._check_folder(el[k], xml)) { continue; }
            l = this.parseGroundOverlay(el[k], kmlOptions);
            if (l) { layers.push(l); }
        }
        if (!layers.length) { return; }
        if (layers.length === 1) {
            l = layers[0];
        } else {
            l = new L.FeatureGroup(layers);
        }
        el = xml.getElementsByTagName('name');
        if (el.length && el[0].childNodes.length) {
            l.options.name = el[0].childNodes[0].nodeValue;
        }
        return l;
    },

    parsePlacemark: function (place, xml, style, options, kmlOptions) {
        var h, i, j, k, el, il, opts = options || {};

        el = place.getElementsByTagName('styleUrl');
        for (i = 0; i < el.length; i++) {
            var url = el[i].childNodes[0].nodeValue;
            for (var a in style[url]) {
                opts[a] = style[url][a];
            }
        }

        il = place.getElementsByTagName('Style')[0];
        if (il) {
            var inlineStyle = this.parseStyle(place, kmlOptions);
            if (inlineStyle) {
                for (k in inlineStyle) {
                    opts[k] = inlineStyle[k];
                }
            }
        }

        var multi = ['MultiGeometry', 'MultiTrack', 'gx:MultiTrack'];
        for (h = 0; h < multi.length; h++) {
            el = place.getElementsByTagName(multi[h]);
            for (i = 0; i < el.length; i++) {
                var layer = this.parsePlacemark(el[i], xml, style, opts, kmlOptions);
                if (layer === undefined)
                    continue;
                this.addPlacePopup(place, layer);
                return layer;
            }
        }

        var layers = [];

        var parse = ['LineString', 'Polygon', 'Point', 'Track', 'gx:Track'];
        for (j = 0; j < parse.length; j++) {
            var tag = parse[j];
            el = place.getElementsByTagName(tag);
            for (i = 0; i < el.length; i++) {
                var l = this['parse' + tag.replace(/gx:/, '')](el[i], xml, opts);
                if (l) { layers.push(l); }
            }
        }

        if (!layers.length) {
            return;
        }
        layer = layers[0];
        if (layers.length > 1) {
            layer = new L.FeatureGroup(layers);
        }

        this.addPlacePopup(place, layer);
        return layer;
    },

    addPlacePopup: function (place, layer) {
        var el, i, j, name, descr = '';
        el = place.getElementsByTagName('name');
        if (el.length && el[0].childNodes.length) {
            name = el[0].childNodes[0].nodeValue;
        }
        el = place.getElementsByTagName('description');
        for (i = 0; i < el.length; i++) {
            for (j = 0; j < el[i].childNodes.length; j++) {
                descr = descr + el[i].childNodes[j].nodeValue;
            }
        }

        if (name) {
            // name is plain text: escape it (description is HTML by KML spec and kept as is)
            var title = document.createElement('div');
            title.textContent = name;
            layer.bindPopup('<h2>' + title.innerHTML + '</h2>' + descr, { className: 'kml-popup'});
        }
    },

    // Resolve an icon/overlay link: files packed in a KMZ become blob: URLs,
    // relative links are resolved against kmlOptions.baseUrl (set by load()).
    resolveHref: function (href, kmlOptions) {
        if (!href || !kmlOptions) { return href; }
        var resources = kmlOptions.resources;
        if (resources) {
            var key = href.replace(/^\.\//, '');
            if (resources[key]) { return resources[key]; }
            try {
                key = decodeURI(key);
                if (resources[key]) { return resources[key]; }
            } catch (e) { return href; } // eslint-disable-line no-unused-vars -- malformed escape: keep the link as is
        }
        if (kmlOptions.baseUrl && !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
            try {
                var base = new URL(kmlOptions.baseUrl, typeof document !== 'undefined' ? document.baseURI : undefined);
                return new URL(href, base).href;
            } catch (e) { return href; } // eslint-disable-line no-unused-vars -- unresolvable base: keep the link as is
        }
        return href;
    },

    _isZip: function (buffer) {
        var b = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        return b.length === 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04;
    },

    _mimeTypes: {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml'
    },

    // Reads a KMZ archive: resolves to {text: <main kml>, resources: {name: blob: URL}}
    _readKMZ: function (buffer) {
        var self = this;
        return this._readZip(buffer).then(function (files) {
            var names = Object.keys(files), main;
            for (var i = 0; i < names.length; i++) {
                if (!/\.kml$/i.test(names[i])) { continue; }
                // prefer doc.kml, otherwise the shallowest *.kml
                if (!main || /^doc\.kml$/i.test(names[i]) ||
                    (!/^doc\.kml$/i.test(main) && names[i].split('/').length < main.split('/').length)) {
                    main = names[i];
                }
            }
            if (!main) { throw new Error('No .kml file found in KMZ'); }

            var resources = {};
            names.forEach(function (name) {
                var mime = self._mimeTypes[name.split('.').pop().toLowerCase()];
                if (name !== main && mime) {
                    resources[name] = URL.createObjectURL(new Blob([files[name]], {type: mime}));
                }
            });
            return {text: new TextDecoder('utf-8').decode(files[main]), resources: resources};
        });
    },

    // Minimal ZIP reader (stored and deflate entries, no ZIP64).
    // Resolves to {entryName: Uint8Array}. Deflate needs DecompressionStream.
    _readZip: function (buffer) {
        var view = new DataView(buffer), bytes = new Uint8Array(buffer);
        var decoder = new TextDecoder('utf-8');
        var eocd = -1, i;
        for (i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) { return Promise.reject(new Error('Invalid KMZ: not a zip archive')); }

        var count = view.getUint16(eocd + 10, true);
        var pos = view.getUint32(eocd + 16, true);
        var jobs = [];

        function inflate(data) {
            if (typeof DecompressionStream !== 'function') {
                throw new Error('KMZ is compressed and this browser has no DecompressionStream');
            }
            var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
        }

        function readEntry(name, method, size, local) {
            if (view.getUint32(local, true) !== 0x04034b50) { throw new Error('Invalid KMZ: bad entry ' + name); }
            var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            var data = bytes.subarray(start, start + size);
            if (method === 0) { return Promise.resolve(data); }
            if (method === 8) { return inflate(data); }
            throw new Error('Unsupported zip compression method ' + method + ' in ' + name);
        }

        try {
            for (i = 0; i < count; i++) {
                if (view.getUint32(pos, true) !== 0x02014b50) { throw new Error('Invalid KMZ: bad directory'); }
                var method = view.getUint16(pos + 10, true);
                var size = view.getUint32(pos + 20, true);
                var nameLen = view.getUint16(pos + 28, true);
                var extraLen = view.getUint16(pos + 30, true);
                var commentLen = view.getUint16(pos + 32, true);
                var local = view.getUint32(pos + 42, true);
                var name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
                pos += 46 + nameLen + extraLen + commentLen;
                if (name.charAt(name.length - 1) === '/') { continue; }
                jobs.push(readEntry(name, method, size, local).then(
                    (function (n) { return function (data) { return [n, data]; }; })(name)));
            }
        } catch (e) {
            return Promise.reject(e);
        }

        return Promise.all(jobs).then(function (entries) {
            var files = {};
            entries.forEach(function (e) { files[e[0]] = e[1]; });
            return files;
        });
    },

    parseCoords: function (xml) {
        var el = xml.getElementsByTagName('coordinates');
        return el.length ? this._read_coords(el[0]) : [];
    },

    parseLineString: function (line, xml, options) {
        var coords = this.parseCoords(line);
        if (!coords.length) { return; }
        return new L.Polyline(coords, options);
    },

    parseTrack: function (line, xml, options) {
        var el = xml.getElementsByTagName('gx:coord');
        if (el.length === 0) { el = xml.getElementsByTagName('coord'); }
        var coords = [];
        for (var j = 0; j < el.length; j++) {
            coords = coords.concat(this._read_gxcoords(el[j]));
        }
        if (!coords.length) { return; }
        return new L.Polyline(coords, options);
    },

    parsePoint: function (line, xml, options) {
        var el = line.getElementsByTagName('coordinates');
        if (!el.length) {
            return;
        }
        var ll = el[0].childNodes[0].nodeValue.split(',');
        return new L.KMLMarker(new L.LatLng(ll[1], ll[0]), options);
    },

    parsePolygon: function (line, xml, options) {
        var el, polys = [], inner = [], i, coords;
        el = line.getElementsByTagName('outerBoundaryIs');
        for (i = 0; i < el.length; i++) {
            coords = this.parseCoords(el[i]);
            if (coords) {
                polys.push(coords);
            }
        }
        el = line.getElementsByTagName('innerBoundaryIs');
        for (i = 0; i < el.length; i++) {
            coords = this.parseCoords(el[i]);
            if (coords) {
                inner.push(coords);
            }
        }
        if (!polys.length) {
            return;
        }
        if (options.fillColor) {
            options.fill = true;
        }
        if (polys.length === 1) {
            return new L.Polygon(polys.concat(inner), options);
        }
        return new L.MultiPolygon(polys, options);
    },

    getLatLngs: function (xml) {
        var el = xml.getElementsByTagName('coordinates');
        var coords = [];
        for (var j = 0; j < el.length; j++) {
            // text might span many childNodes
            coords = coords.concat(this._read_coords(el[j]));
        }
        return coords;
    },

    _read_coords: function (el) {
        var text = '', coords = [], i;
        for (i = 0; i < el.childNodes.length; i++) {
            text = text + el.childNodes[i].nodeValue;
        }
        text = text.split(/[\s\n]+/);
        for (i = 0; i < text.length; i++) {
            var ll = text[i].split(',');
            if (ll.length < 2) {
                continue;
            }
            coords.push(new L.LatLng(ll[1], ll[0]));
        }
        return coords;
    },

    _read_gxcoords: function (el) {
        var coords = [];
        var text = el.firstChild.nodeValue.split(' ');
        coords.push(new L.LatLng(text[1], text[0]));
        return coords;
    },

    parseGroundOverlay: function (xml, kmlOptions) {
        var latlonbox = xml.getElementsByTagName('LatLonBox')[0];
        if (!latlonbox) { return; }
        var bounds = new L.LatLngBounds(
            [
                latlonbox.getElementsByTagName('south')[0].childNodes[0].nodeValue,
                latlonbox.getElementsByTagName('west')[0].childNodes[0].nodeValue
            ],
            [
                latlonbox.getElementsByTagName('north')[0].childNodes[0].nodeValue,
                latlonbox.getElementsByTagName('east')[0].childNodes[0].nodeValue
            ]
        );
        var attributes = {Icon: true, href: true, color: true};
        function _parse (xml) {
            var options = {}, ioptions;
            for (var i = 0; i < xml.childNodes.length; i++) {
                var e = xml.childNodes[i];
                var key = e.tagName;
                if (!attributes[key]) { continue; }
                var value = e.childNodes[0].nodeValue;
                if (key === 'Icon') {
                    ioptions = _parse(e);
                    if (ioptions.href) { options.href = ioptions.href; }
                } else if (key === 'href') {
                    options.href = value;
                } else if (key === 'color') {
                    options.opacity = parseInt(value.substring(0, 2), 16) / 255.0;
                    options.color = '#' + value.substring(6, 8) + value.substring(4, 6) + value.substring(2, 4);
                }
            }
            return options;
        }
        var options = _parse(xml);
        if (latlonbox.getElementsByTagName('rotation')[0] !== undefined) {
            var rotation = latlonbox.getElementsByTagName('rotation')[0].childNodes[0].nodeValue;
            options.rotation = parseFloat(rotation);
        }
        return new L.RotatedImageOverlay(this.resolveHref(options.href, kmlOptions), bounds, {opacity: options.opacity, angle: options.rotation});
    }

});

L.kml = function (kml, kmlOptions) {
    return new L.KML(kml, kmlOptions);
};

L.KMLIcon = L.Icon.extend({
    options: {
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    },
    _setIconStyles: function (img, name) {
        L.Icon.prototype._setIconStyles.apply(this, [img, name]);
    },
    _createImg: function (src, el) {
        el = el || document.createElement('img');
        el.onload = this.applyCustomStyles.bind(this,el)
        el.src = src;
        return el;
    },
    applyCustomStyles: function(img) {
        var options = this.options;
        var width = options.iconSize[0];
        var height = options.iconSize[1];

        this.options.popupAnchor = [0,(-0.83*height)];
        if (options.anchorType.x === 'fraction')
            img.style.marginLeft = (-options.anchorRef.x * width) + 'px';
        if (options.anchorType.y === 'fraction')
            img.style.marginTop  = ((-(1 - options.anchorRef.y) * height) + 1) + 'px';
        if (options.anchorType.x === 'pixels')
            img.style.marginLeft = (-options.anchorRef.x) + 'px';
        if (options.anchorType.y === 'pixels')
            img.style.marginTop  = (options.anchorRef.y - height + 1) + 'px';
    }
});


L.KMLMarker = L.Marker.extend({
    options: {
        icon: new L.KMLIcon.Default()
    }
});

// Inspired by https://github.com/bbecquet/Leaflet.PolylineDecorator/tree/master/src
L.RotatedImageOverlay = L.ImageOverlay.extend({
    options: {
        angle: 0
    },
    _reset: function () {
        L.ImageOverlay.prototype._reset.call(this);
        this._rotate();
    },
    _animateZoom: function (e) {
        L.ImageOverlay.prototype._animateZoom.call(this, e);
        this._rotate();
    },
    _rotate: function () {
        if (L.DomUtil.TRANSFORM) {
            // use the CSS transform rule if available
            this._image.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
        } else if (L.Browser.ie) {
            // fallback for IE6, IE7, IE8
            var rad = this.options.angle * (Math.PI / 180),
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._image.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
                costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
        }
    },
    getBounds: function () {
        return this._bounds;
    }
});

return L.KML;

}));
