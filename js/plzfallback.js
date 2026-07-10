'use strict';

// ── Postal-code fallback registry ─────────────────────────────────────────────
// OSM only carries boundary=postal_code polygons in some countries (Germany
// and France are well covered, Switzerland and the USA are not). Where OSM has
// nothing, a country-specific official source can fill the gap.
//
// Each country lives in its own file (plzfallback-<country>.js) and calls
// registerPLZFallback() when it loads. Adding a country means adding one file
// and one <script> tag — nothing else changes.
//
// A source is { id, bboxes, fetch }:
//   bboxes → list of [south, north, west, east] boxes the source covers
//   fetch  → async (bb) → { source: 'geojson', elements: [GeoJSON features] }
//            with feature properties postal_code, name (optional) and
//            attribution (optional), as consumed by renderPLZ.

const _plzFallbackSources = [];

function registerPLZFallback(source) {
    _plzFallbackSources.push(source);
}

// bb / box are [south, north, west, east] (Nominatim order)
function bboxIntersects(bb, box) {
    return bb[0] <= box[1] && bb[1] >= box[0] && bb[2] <= box[3] && bb[3] >= box[2];
}

// Called by the plz layer when the Overpass query returned nothing.
async function fetchPLZFallback(bb) {
    const src = _plzFallbackSources.find((s) => s.bboxes.some((box) => bboxIntersects(bb, box)));
    if (!src) return { source: 'geojson', elements: [] };
    return src.fetch(bb);
}
