'use strict';

// ── Switzerland / Liechtenstein: swisstopo postal-code perimeters ─────────────
// OSM has no postal-code polygons for Switzerland; swisstopo publishes the
// official perimeters as open data via the GeoAdmin API.

async function fetchSwissPLZ(bb) {
    // bb = [south, north, west, east] (Nominatim order) → envelope xmin,ymin,xmax,ymax
    const res = await fetch(
        'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' +
            new URLSearchParams({
                geometryType: 'esriGeometryEnvelope',
                geometry: `${bb[2]},${bb[0]},${bb[3]},${bb[1]}`,
                layers: 'all:ch.swisstopo-vd.ortschaftenverzeichnis_plz',
                tolerance: 0,
                returnGeometry: true,
                geometryFormat: 'geojson',
                sr: 4326,
            }),
    );
    if (!res.ok) throw new Error(`GeoAdmin HTTP ${res.status}`);
    const data = await res.json();
    const elements = (data.results ?? []).map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
            postal_code: String(f.properties?.plz ?? '?'),
            name: f.properties?.langtext ?? '',
            attribution: '© swisstopo',
        },
    }));
    return { source: 'geojson', elements };
}

registerPLZFallback({
    id: 'ch',
    bboxes: [[45.7, 47.9, 5.9, 10.6]],
    fetch: fetchSwissPLZ,
});
