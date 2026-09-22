'use strict';

let _hiderSelectedLayer = null;
let _hiderRefPoint = null; // {lat, lng}
let _hiderMarker = null;
let _hiderZoneLayer = null;

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

    // Also ensure the station list is updated if the stations layer is cached
    hiderUpdatePoiList();
}

function hiderUpdatePoiList() {
    const poiSelect = document.getElementById('hider-poi-select');
    if (!poiSelect) return;

    poiSelect.innerHTML = '<option value="">-- Select Station --</option>';

    const layerId = 'stations';
    const data = layerDataCache[layerId];
    if (!data || !data.elements) return;

    data.elements.forEach((el, idx) => {
        const center = getElementCenter(el);
        if (!center) return;
        const name = el.tags?.name ?? el.tags?.['name:de'] ?? 'Unnamed Station';
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = esc(name);
        poiSelect.appendChild(opt);
    });
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

function hiderCreateZone() {
    const poiIdx = document.getElementById('hider-poi-select')?.value;
    const radiusKm = parseFloat(document.getElementById('hider-zone-radius')?.value);

    if (poiIdx === '' || isNaN(radiusKm) || radiusKm <= 0) {
        setStatus('Please select a station and valid radius', 'error');
        return;
    }

    const layerId = 'stations';
    const data = layerDataCache[layerId];
    if (!data || !data.elements || !data.elements[poiIdx]) {
        setStatus('Station data not cached. Please load the stations layer first.', 'error');
        return;
    }

    const el = data.elements[poiIdx];
    const center = getElementCenter(el);
    if (!center) {
        setStatus('Station has no valid coordinates', 'error');
        return;
    }

    // Remove existing zone if present
    if (_hiderZoneLayer) {
        map.removeLayer(_hiderZoneLayer);
    }

    // Turf.js uses [lng, lat] for points
    const geometry = turf.circle([center.lng, center.lat], radiusKm, { units: 'kilometers' });

    // "block out everything BUT the hiding zone" means invert = true
    const occlusionLayer = createOcclusionLayer(geometry, { invert: true });

    if (occlusionLayer) {
        _hiderZoneLayer = occlusionLayer;
        _hiderZoneLayer.addTo(map);
        setStatus(`Hiding zone created around ${esc(el.tags?.name ?? 'Station')}`, 'ok');
    } else {
        setStatus('Failed to create hiding zone', 'error');
    }
}

function hiderClearZone() {
    if (_hiderZoneLayer) {
        map.removeLayer(_hiderZoneLayer);
        _hiderZoneLayer = null;
        setStatus('Hiding zone removed', 'ok');
    } else {
        setStatus('No hiding zone to remove', 'error');
    }
}

// Initialize list when layers change
const originalToggleSetupPoiLayer = toggleSetupPoiLayer;
toggleSetupPoiLayer = async function(id, enabled) {
    await originalToggleSetupPoiLayer(id, enabled);
    hiderUpdateLayerList();
    if (id === 'stations') {
        hiderUpdatePoiList();
    }
};
