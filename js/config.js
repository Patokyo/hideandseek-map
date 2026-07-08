'use strict';

// ── Units ─────────────────────────────────────────────────────────────────────
const KM_PER_MILE = 1.60934;

// ── Color themes (default + colorblind-safe Okabe-Ito/Tol palette) ────────────
// All colours are tuned for the light tile styles: every value keeps a WCAG
// contrast ratio of at least 3:1 against typical OSM land (#f2efe9), so thin
// lines and small markers stay readable. Check this before changing a value.
const COLOR_THEMES = {
    default: {
        plz: [
            '#dc2626', '#0d9488', '#2563eb', '#15803d', '#a16207',
            '#c026d3', '#0891b2', '#b45309', '#7c3aed', '#0284c7',
            '#ea580c', '#4d7c0f', '#e11d48', '#475569', '#db2777',
        ],
        interval: [
            '#0891b2', '#ea580c', '#7c3aed', '#15803d', '#e11d48',
            '#2563eb', '#a16207', '#c026d3', '#0d9488', '#dc2626',
        ],
        busRoute: [
            '#3b82f6', '#059669', '#b45309', '#ef4444',
            '#8b5cf6', '#ec4899', '#0891b2', '#4d7c0f',
            '#ea580c', '#a855f7',
        ],
        layers: {
            cityboundary: '#e36206',
            plz:          '#229890',
            hospitals:    '#ff4138',
            stations:     '#2289ff',
            attractions:  '#de6800',
            parks:        '#2c9e3c',
            shopping:     '#ae63ff',
            busstops:     '#a68500',
            cinema:       '#e32cff',
            zoo:          '#63980b',
            townhall:     '#e06500',
            coastline:    '#1e40af',
            water:        '#0091d2',
            aquarium:     '#0097b1',
            library:      '#936fff',
            golf:         '#5f9708',
            stadium:      '#f43f5e',
            embassy:      '#c07900',
            consulate:    '#d06f00',
            cemetery:     '#6b7280',
            swimmingpool: '#0497ad',
            police:       '#6366f1',
            firestation:  '#ef4444',
            fastfood:     '#b18000',
            museum:       '#ba7e00',
            amusementpark:'#db2777',
        },
    },
    colorblind: {
        // Based on Okabe-Ito and Paul Tol palettes — safe for deuteranopia/protanopia.
        // Avoids pure red/green pairs; uses teal for "nature" and vermillion for "danger".
        // Light entries (yellow, sand, sky) are darkened for the light tiles; colours
        // from the same hue family are spread apart in lightness to stay tellable.
        plz: [
            '#0072B2', '#b87f00', '#009b71', '#ce659f', '#958b04',
            '#D55E00', '#332288', '#2a7e71', '#882255', '#1090d8',
            '#117733', '#7f741a', '#CC6677', '#AA3377', '#6f6f25',
        ],
        interval: [
            '#1090d8', '#b87f00', '#009b71', '#D55E00', '#ce659f',
            '#0072B2', '#2a7e71', '#958b04', '#332288', '#882255',
        ],
        busRoute: [
            '#0072B2', '#D55E00', '#009b71', '#b87f00', '#ce659f',
            '#332288', '#2a7e71', '#1090d8', '#882255', '#AA3377',
        ],
        layers: {
            cityboundary: '#1090d8',
            plz:          '#0072B2',
            hospitals:    '#D55E00',
            stations:     '#4477AA',
            attractions:  '#b87f00',
            parks:        '#009b71',
            shopping:     '#ce659f',
            busstops:     '#958b04',
            cinema:       '#882255',
            zoo:          '#2a7e71',
            townhall:     '#7f741a',
            coastline:    '#4477AA',
            water:        '#1090d8',
            aquarium:     '#0b94c2',
            library:      '#AA3377',
            golf:         '#117733',
            stadium:      '#CC6677',
            embassy:      '#84771c',
            consulate:    '#6f6f25',
            cemetery:     '#878787',
            swimmingpool: '#0072B2',
            police:       '#332288',
            firestation:  '#f25420',
            fastfood:     '#958b04',
            museum:       '#0f7ba3',
            amusementpark:'#CC6677',
        },
    },
};

let colorMode = localStorage.getItem('colorMode') ?? 'default';

// ── Colours for postal-code polygons ─────────────────────────────────────────
let PLZ_COLORS = COLOR_THEMES[colorMode].plz;

// ── Colours for interval radii ────────────────────────────────────────────────
let INTERVAL_COLORS = COLOR_THEMES[colorMode].interval;

// ── Overpass API endpoints (fallback order) ───────────────────────────────────
// Only global mirrors belong here: regional instances (e.g. overpass.osm.ch,
// Switzerland only) answer HTTP 200 with 0 elements for other areas, which the
// fallback logic cannot distinguish from a genuinely empty result.
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ── Map styles (Leaflet tile-layer definitions) ───────────────────────────────
const TILE_LAYERS = {
    osm: {
        url:     'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attr:    '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
    },
    positron: {
        url:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attr:    '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors © <a href="https://carto.com">CARTO</a>',
        maxZoom: 19,
    },
    dark: {
        url:     'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attr:    '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors © <a href="https://carto.com">CARTO</a>',
        maxZoom: 19,
    },
    voyager: {
        url:     'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attr:    '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors © <a href="https://carto.com">CARTO</a>',
        maxZoom: 19,
    },
    satellite: {
        url:     'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attr:    'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18,
    },
    opnv: {
        url:     'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
        attr:    'Map &copy; <a href="https://memomaps.de/">memomaps.de</a> CC-BY-SA, Kartendaten &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>-Mitwirkende',
        maxZoom: 18,
    },
};
