// Loads Leaflet + L.KML.js into a jsdom environment (the plugin expects globals).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><div id="map"></div>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.DOMParser = dom.window.DOMParser;
global.HTMLElement = dom.window.HTMLElement;

global.L = require('leaflet');
window.L = global.L;

// The plugin is a UMD module: loading it through require() exercises the CommonJS branch.
require('../L.KML.js');

exports.L = global.L;
exports.parse = (text) => new DOMParser().parseFromString(text, 'text/xml');
exports.kml = (body) =>
    exports.parse('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + body + '</Document></kml>');
exports.read = (name) => fs.readFileSync(path.join(__dirname, '..', 'assets', name), 'utf8');
