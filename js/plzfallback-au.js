'use strict';

// ── Australia: ABS Postal Areas (ASGS 2021) ───────────────────────────────────
// OSM has no postcode polygons for Australia. The Australian Bureau of
// Statistics publishes Postal Areas (POA) — the official polygon
// approximation of Australia Post postcodes — as open data (CC-BY).
// Layer 1 (POA_GEN) already carries generalised geometry; maxAllowableOffset
// simplifies it further to keep responses small.

async function fetchAustraliaPOA(bb) {
    const res = await fetch(
        'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer/1/query?' +
            new URLSearchParams({
                geometry: `${bb[2]},${bb[0]},${bb[3]},${bb[1]}`,
                geometryType: 'esriGeometryEnvelope',
                inSR: 4326,
                spatialRel: 'esriSpatialRelIntersects',
                outFields: 'poa_code_2021',
                returnGeometry: true,
                outSR: 4326,
                maxAllowableOffset: 0.0002,
                geometryPrecision: 5,
                f: 'geojson',
            }),
    );
    if (!res.ok) throw new Error(`ABS HTTP ${res.status}`);
    const data = await res.json();
    const elements = (data.features ?? []).map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
            postal_code: String(f.properties?.poa_code_2021 ?? '?'),
            attribution: '© Australian Bureau of Statistics',
        },
    }));
    return { source: 'geojson', elements };
}

registerPLZFallback({
    id: 'au',
    bboxes: [[-44.0, -9.5, 112.0, 154.0]], // mainland + Tasmania
    fetch: fetchAustraliaPOA,
});
