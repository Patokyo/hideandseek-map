'use strict';

// Matching questions: compute a Voronoi over a cached POI layer, find the cell
// containing the picked point and create a world-sized mask that keeps either
// that cell (answer Yes) or everything except that cell (answer No).

let _matchingQuestions = [];
let _matchingNextId = 1;
let _mqPickingId = null;

// Map click hook for matching picker
addMapClickHook((e) => {
    if (_mqPickingId === null) return false;
    const id = _mqPickingId;
    _mqPickingId = null;
    const q = _matchingQuestions.find((x) => x.id === id);
    if (!q) return false;

    q.lat = e.latlng.lat;
    q.lng = e.latlng.lng;

    const coordEl = document.getElementById(`mq-coord-${id}`);
    if (coordEl) coordEl.textContent = `${q.lat.toFixed(5)}° N  ${q.lng.toFixed(5)}° E`;

    document.getElementById(`mq-pick-btn-${id}`)?.classList.remove('meas-active');
    setStatus('', '');

    // Auto-run if we have a selected layer — keeps behavior immediate
    if (q.layerId) mqRun(id);
    return true;
});

function _mqClearLayers(q) {
    if (!q) return;
    if (q.maskLayer) {
        map.removeLayer(q.maskLayer);
        q.maskLayer = null;
    }
    if (q.outlines) {
        q.outlines.forEach((l) => map.removeLayer(l));
        q.outlines = [];
    }
    if (q.marker) {
        map.removeLayer(q.marker);
        q.marker = null;
    }
}

function addMatchingQuestion() {
    const id = _matchingNextId++;
    _matchingQuestions.push({ id, layerId: null, lat: null, lng: null, answerYes: true, maskLayer: null, outlines: [] });
    _mqRenderCards();
}

function mqRemoveQuestion(id) {
    const idx = _matchingQuestions.findIndex((x) => x.id === id);
    if (idx === -1) return;
    _mqClearLayers(_matchingQuestions[idx]);
    _matchingQuestions.splice(idx, 1);
    _mqRenderCards();
}

function clearAllMatchingQuestions() {
    _matchingQuestions.forEach(_mqClearLayers);
    _matchingQuestions.length = 0;
    _mqRenderCards();
}

function mqStartPick(id) {
    _mqPickingId = id;
    document.getElementById(`mq-pick-btn-${id}`)?.classList.add('meas-active');
    setStatus(t('matching_pick'), 'loading');
    closeSidebarForPick();
}

function mqSetLayer(id, layerId) {
    const q = _matchingQuestions.find((x) => x.id === id);
    if (!q) return;
    q.layerId = layerId || null;
    _mqClearLayers(q);
    _mqRenderCards();
}

function mqUseGeo(id) {
    const q = _matchingQuestions.find((x) => x.id === id);
    if (!q) return;
    if (!geoMarker) {
        setStatus(t('status_rq_no_geo'), 'error');
        return;
    }
    const c = geoMarker.getLatLng();
    q.lat = c.lat;
    q.lng = c.lng;

    const coordEl = document.getElementById(`mq-coord-${id}`);
    if (coordEl) coordEl.textContent = `${q.lat.toFixed(5)}° N  ${q.lng.toFixed(5)}° E`;

    _mqRenderCards();
    mqRun(id);
}

function mqSetAnswer(id, yes) {
    const q = _matchingQuestions.find((x) => x.id === id);
    if (!q) return;
    q.answerYes = !!yes;
    const yesBtn = document.getElementById(`mq-yes-${id}`);
    const noBtn = document.getElementById(`mq-no-${id}`);
    if (yesBtn) yesBtn.classList.toggle('ghost', !q.answerYes);
    if (noBtn) noBtn.classList.toggle('ghost', q.answerYes);
    mqRun(id);
}

function _mqRenderCards() {
    const el = document.getElementById('mqCards');
    if (!el) return;

    el.innerHTML = _matchingQuestions
        .map((q, i) => {
            const available = Object.keys(layerDataCache || {});
            const layerOpts = available.length
                ? available
                      .map((id) => {
                          const def = LAYER_DEFS[id];
                          const label = def ? t(def.label) : id;
                          return `<option value="${id}"${id === q.layerId ? ' selected' : ''}>${esc(label)}</option>`;
                      })
                      .join('')
                : '';

            const coordTxt = q.lat !== null ? `${q.lat.toFixed(5)}° N  ${q.lng.toFixed(5)}° E` : t('matching_pick');

            return `
<div class="tent-card" id="mq-${q.id}">
  <div class="tent-card-hdr">
    <span class="tent-card-title">${tf('matching_card_title', i + 1)}</span>
    <button class="ghost tent-card-del" onclick="mqRemoveQuestion(${q.id})" title="Remove">✕</button>
  </div>
  <select onchange="mqSetLayer(${q.id}, this.value)">
    <option value="">${t('matching_choose_layer')}</option>
    ${layerOpts}
  </select>
  <div class="row" style="margin-bottom:6px">
    <button id="mq-pick-btn-${q.id}" class="tent-pick-btn" style="margin-bottom:0" onclick="mqStartPick(${q.id})">${t('matching_pick')}</button>
    <button class="tent-pick-btn" style="margin-bottom:0" onclick="mqUseGeo(${q.id})" title="${t('rq_geo_title')}">🎯</button>
  </div>
  <div id="mq-coord-${q.id}" class="tent-coord">${esc(coordTxt)}</div>
  <div style="display:flex; gap:6px; margin-top:6px">
    <button id="mq-yes-${q.id}" style="flex:1" onclick="mqSetAnswer(${q.id}, true)">${t('sl_yes') || 'Yes'}</button>
    <button id="mq-no-${q.id}" class="ghost" style="flex:1" onclick="mqSetAnswer(${q.id}, false)">${t('sl_no') || 'No'}</button>
  </div>
</div>`;
        })
        .join('');
}

async function mqRun(id) {
    const q = _matchingQuestions.find((x) => x.id === id);
    if (!q) return;
    _mqClearLayers(q);
    if (!q.layerId) {
        showErrorPopup(t('matching_need_layer'));
        return;
    }
    if (q.lat === null || q.lng === null) {
        showErrorPopup(t('matching_need_point'));
        return;
    }

    const data = layerDataCache[q.layerId];
    if (!data || !data.elements || data.elements.length === 0) {
        showErrorPopup(t('matching_no_layers'));
        return;
    }

    // Build POI list from cached layer elements
    const pois = (data.elements || [])
        .map((el) => {
            const c = getElementCenter(el);
            if (!c) return null;
            return { id: el.id, lat: c.lat, lng: c.lng, name: el.tags?.name ?? '' };
        })
        .filter(Boolean);

    if (pois.length === 0) {
        showErrorPopup(t('matching_no_layers'));
        return;
    }

    // Radius: base on farthest POI from the chosen point to ensure coverage
    let maxKm = 0;
    pois.forEach((p) => {
        const d = haversineKm({ lat: q.lat, lng: q.lng }, p);
        if (d > maxKm) maxKm = d;
    });
    const radiusKm = Math.max(1, maxKm * 1.2);

    const vor = _tentProjectedVoronoi(pois, q.lat, q.lng, radiusKm);
    if (!vor || !vor.features || vor.features.length === 0) {
        showErrorPopup(t('status_err_popup'));
        return;
    }

    // Find the feature containing the picked point
    const pt = turf.point([q.lng, q.lat]);
    let selFeature = null;
    for (const f of vor.features) {
        try {
            if (turf.booleanPointInPolygon(pt, f)) {
                selFeature = f;
                break;
            }
        } catch (e) {
            // skip invalid geometry
        }
    }
    if (!selFeature) {
        showErrorPopup(t('status_no_point'));
        return;
    }

    // Create a marker at the picked point
    if (q.marker) {
        map.removeLayer(q.marker);
        q.marker = null;
    }
    q.marker = L.circleMarker([q.lat, q.lng], {
        radius: 6,
        color: '#fff',
        fillColor: '#111',
        fillOpacity: 1,
        weight: 2,
        interactive: false,
        zIndexOffset: 500,
    }).addTo(map);

    if (q.answerYes) {
        // Yes -> keep only the selected cell visible: world with hole = selFeature
        q.maskLayer = createOcclusionLayer(selFeature, { invert: true }).addTo(map);

        // Outline the kept cell
        const keepStyle = { color: '#2c9e3c', weight: 2.5, fillOpacity: 0, interactive: false };
        try {
            const out = L.geoJSON(selFeature, { style: keepStyle }).addTo(map);
            q.outlines.push(out);
        } catch (e) {
            // ignore
        }
    } else {
        // No -> shade only this cell
        q.maskLayer = createOcclusionLayer(selFeature).addTo(map);
    }


    setStatus(t('status_ready'), 'ok');
}
