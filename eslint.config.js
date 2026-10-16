const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/'] },
    js.configs.recommended,
    {
        // the plugin: ES5-style browser script using the global Leaflet `L`
        files: ['L.KML.js'],
        languageOptions: {
            ecmaVersion: 2015,
            sourceType: 'script',
            globals: { ...globals.browser, define: 'readonly', module: 'readonly', require: 'readonly' }
        }
    },
    {
        files: ['test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: { globals: { L: 'readonly', DOMParser: 'readonly', window: 'readonly' } }
    }
];
