'use strict';

/**
 * Creates a Leaflet layer that shades a specific area of the map.
 *
 * @param {geojson} geometry - The area to shade (or to leave unshaded if inverted).
 * @param {Object} options - Configuration options.
 * @param {boolean} [options.invert=false] - If true, shades everything EXCEPT the geometry.
 * @param {geojson} [options.world] - The world geometry to use when inverted.
 *                                   If not provided, a default world-sized rectangle is used.
 * @returns {L.Layer|null} The Leaflet occlusion layer, or null if geometry is invalid.
 */
function createOcclusionLayer(geometry, { invert = false, world = null } = {}) {
    if (!geometry) return null;

    let finalGeom = geometry;

    if (invert) {
        // Use provided world or a default global rectangle
        const worldGeom = world || turf.polygon([[
            [-180, -89.9],
            [180, -89.9],
            [180, 89.9],
            [-180, 89.9],
            [-180, -89.9]
        ]]);

        try {
            finalGeom = turf.difference(worldGeom, geometry);
        } catch (e) {
            console.error('Occlusion: turf.difference failed', e);
            return null;
        }
    }

    if (!finalGeom) return null;

    return L.geoJSON(finalGeom, {
        style: {
            stroke: false,
            fillColor: '#0d1117',
            fillOpacity: 0.55,
            interactive: false,
        },
    });
}
