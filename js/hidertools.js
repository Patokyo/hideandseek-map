'use strict';

let _hiderSelectedLayer = null;
let _hiderRefPoint = null; // {lat, lng}
let _hiderMarker = null;

function hiderUpdateLayerList() {
    const select = document.getElementById('hider-layer-select');
    if (!select) return;

    const available = Object.keys(layerDataCache);
    const options = available.map(id => {
        const def = LAYER_DEFS[id];
        const label = def ? t(def.label) : id;
        return `<option value="${id}">${label}</option>`;
    }).join('');

    const currentVal = select.value;
    select.innerHTML = `<option value="">-- Select Layer --</option>${options}`;
    select.value = currentVal;
}

function hiderSetPoint(lat, lng) {
    _hiderRefPoint = { lat, lng };

    if (_hiderMarker) map.removeLayer(_hiderMarker);
    _hiderMarker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 1,
        weight: 2,
        interactive: false
    }).addTo(map);

    hiderCalculateNearest();
}

function hiderStartPick() {
    setStatus('Pick a location on the map', 'loading');
    closeSidebarForPick();

    // Temporary hook for picking hider location
    const hook = (e) => {
        hiderSetPoint(e.latlng.lat, e.latlng.lng);
        removeMapClickHook(hook);
        setStatus('Location set', 'ok');
        return true;
    };
    addMapClickHook(hook);
}

function hiderUseGeo() {
    if (!geoMarker) {
        setStatus('Geolocation not available', 'error');
        return;
    }
    const c = geoMarker.getLatLng();
    hiderSetPoint(c.lat, c.lng);
    setStatus('Used current location', 'ok');
}

function hiderCalculateNearest() {
    const layerId = document.getElementById('hider-layer-select')?.value;
    if (!layerId) {
        document.getElementById('hider-result').innerHTML = 'Please select a layer';
        return;
    }
    if (!_hiderRefPoint) {
        document.getElementById('hider-result').innerHTML = 'Please pick a location';
        return;
    }

    const data = layerDataCache[layerId];
    if (!data || !data.elements || data.elements.length === 0) {
        document.getElementById('hider-result').innerHTML = 'No POIs in this layer';
        return;
    }

    let nearest = null;
    let minDist = Infinity;

    data.elements.forEach(el => {
        const c = getElementCenter(el);
        if (!c) return;
        const d = haversineKm(_hiderRefPoint, c);
        if (d < minDist) {
            minDist = d;
            nearest = el;
        }
    });

    if (nearest) {
        const name = nearest.tags?.name ?? 'Unnamed POI';
        document.getElementById('hider-result').innerHTML =
            `Nearest: <strong>${esc(name)}</strong><br>${minDist.toFixed(3)} km away`;
    } else {
        document.getElementById('hider-result').innerHTML = 'No valid POIs found';
    }
}

// Initialize list when layers change
const originalToggleSetupPoiLayer = toggleSetupPoiLayer;
toggleSetupPoiLayer = async function(id, enabled) {
    await originalToggleSetupPoiLayer(id, enabled);
    hiderUpdateLayerList();
};
