'use strict';

// ── Map initialisation ────────────────────────────────────────────────────────
const map = L.map('map', {
    zoomControl: true,
}).setView([53.1435, 8.2146], 13);

// ── Active tile layer ─────────────────────────────────────────────────────────
let currentTileLayer = L.tileLayer(TILE_LAYERS.osm.url, {
    attribution: TILE_LAYERS.osm.attr,
    maxZoom: TILE_LAYERS.osm.maxZoom,
}).addTo(map);

// ── Close a popover when clicking outside it or its trigger button(s) ───────
function registerPopoverClickOutside(popId, triggerIds) {
    const ids = Array.isArray(triggerIds) ? triggerIds : [triggerIds];
    document.addEventListener('click', (e) => {
        const pop = document.getElementById(popId);
        const clickedTrigger = ids.some((id) => {
            const trigger = document.getElementById(id);
            return trigger && trigger.contains(e.target);
        });
        if (pop?.classList.contains('open') && !pop.contains(e.target) && !clickedTrigger) {
            pop.classList.remove('open');
        }
    });
}

// ── Map click hook registry ───────────────────────────────────────────────────
// Feature files call addMapClickHook(fn) to register handlers that run before
// the default click behaviour (radius centre). A handler returning true consumes
// the click.
const _mapClickHooks = [];
function addMapClickHook(fn) {
    _mapClickHooks.push(fn);
}

function removeMapClickHook(fn) {
    const idx = _mapClickHooks.indexOf(fn);
    if (idx !== -1) _mapClickHooks.splice(idx, 1);
}

// ── Switch map style ──────────────────────────────────────────────────────────
function setTileLayer(key) {
    const def = TILE_LAYERS[key];
    if (!def) return;
    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(def.url, {
        attribution: def.attr,
        maxZoom: def.maxZoom,
    }).addTo(map);
}
