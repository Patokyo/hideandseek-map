'use strict';

// ── USA: Census Bureau ZIP Code Tabulation Areas (TIGERweb) ───────────────────
// USPS ZIP codes are delivery routes, not areas; OSM therefore has no ZIP
// polygons. ZCTAs are the Census Bureau's official polygon approximation.
// maxAllowableOffset simplifies the very detailed TIGER geometries (~20 m),
// which shrinks responses by more than 10×.

async function fetchUSZCTA(bb) {
    const res = await fetch(
        'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query?' +
            new URLSearchParams({
                geometry: `${bb[2]},${bb[0]},${bb[3]},${bb[1]}`,
                geometryType: 'esriGeometryEnvelope',
                inSR: 4326,
                spatialRel: 'esriSpatialRelIntersects',
                outFields: 'ZCTA5',
                returnGeometry: true,
                outSR: 4326,
                maxAllowableOffset: 0.0002,
                geometryPrecision: 5,
                f: 'geojson',
            }),
    );
    if (!res.ok) throw new Error(`TIGERweb HTTP ${res.status}`);
    const data = await res.json();
    const elements = (data.features ?? []).map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
            postal_code: String(f.properties?.ZCTA5 ?? '?'),
            attribution: '© US Census Bureau',
        },
    }));
    return { source: 'geojson', elements };
}

registerPLZFallback({
    id: 'us',
    bboxes: [
        [24.4, 49.5, -125.0, -66.9], // contiguous states
        [51.0, 71.5, -180.0, -129.9], // Alaska
        [18.8, 22.5, -160.3, -154.7], // Hawaii
    ],
    fetch: fetchUSZCTA,
});
