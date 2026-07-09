'use strict';

// ── Live geolocation ──────────────────────────────────────────────────────────
// Toggled via the 🎯 FAB. Uses watchPosition so the marker follows the player
// while moving. The map is centred once on the first fix; afterwards the
// player can pan freely without the view snapping back.

let geoWatchId = null;
let geoMarker = null;
let geoAccuracyCircle = null;
let geoHasCentered = false;

function toggleGeolocate() {
    if (geoWatchId !== null) {
        stopGeolocate();
        setStatus(t('status_geo_off'), 'ok');
        return;
    }

    // Browsers only expose geolocation in secure contexts (https:// or
    // localhost). Over plain http:// the request fails with the same
    // PERMISSION_DENIED code as a real user denial – catch it here so the
    // player gets the actual reason instead of a misleading settings hint.
    if (!window.isSecureContext) {
        setStatus(t('status_geo_insecure'), 'error');
        return;
    }

    if (!navigator.geolocation) {
        setStatus(t('status_geo_unsupported'), 'error');
        return;
    }

    document.getElementById('locateFab').classList.add('geo-active');
    setStatus(t('status_geo_locating'), 'loading');
    geoHasCentered = false;

    geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, onGeoError, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
    });
}

function onGeoPosition(pos) {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    const accuracy = pos.coords.accuracy;

    if (!geoMarker) {
        geoAccuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#2289ff',
            weight: 1,
            opacity: 0.5,
            fillColor: '#2289ff',
            fillOpacity: 0.12,
            interactive: false,
        }).addTo(map);
        geoMarker = L.circleMarker(latlng, {
            radius: 8,
            color: '#ffffff',
            weight: 3,
            fillColor: '#2289ff',
            fillOpacity: 1,
        }).addTo(map);
    } else {
        geoAccuracyCircle.setLatLng(latlng).setRadius(accuracy);
        geoMarker.setLatLng(latlng);
    }

    geoMarker.bindPopup(
        `${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}<br>${tf('geo_accuracy', Math.round(accuracy))}`,
    );

    if (!geoHasCentered) {
        geoHasCentered = true;
        map.setView(latlng, Math.max(map.getZoom(), 16));
    }

    setStatus(tf('status_geo_on', Math.round(accuracy)), 'ok');
}

function onGeoError(err) {
    stopGeolocate();
    const key = err.code === err.PERMISSION_DENIED ? 'status_geo_denied' : 'status_geo_failed';
    setStatus(t(key), 'error');
}

function stopGeolocate() {
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
    }
    if (geoMarker) {
        map.removeLayer(geoMarker);
        geoMarker = null;
    }
    if (geoAccuracyCircle) {
        map.removeLayer(geoAccuracyCircle);
        geoAccuracyCircle = null;
    }
    document.getElementById('locateFab').classList.remove('geo-active');
}
