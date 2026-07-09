'use strict';

// ── Radius questions (yes/no) ─────────────────────────────────────────────────
// Seekers ask "are you within N km of here?" from different spots; hiders
// answer yes or no. Every answer constrains where the hider can be:
// the possible region is the intersection of all "yes" circles minus all
// "no" circles. Everything else is shaded dark on the map, so the remaining
// bright area (donut, lens, …) is the search zone.

let _rqQuestions = [];
let _rqNextId = 1;
let _rqPickingId = null;
let _rqMaskLayer = null; // dark shading over the excluded area
let _rqOutlineLayer = null; // green outline around the possible region

// ── Geometry helpers ──────────────────────────────────────────────────────────
function _rqCircle(q, steps = 128) {
    return turf.circle([q.lng, q.lat], q.km, { steps, units: 'kilometers' });
}

// Large rectangle around all questions; stands in for "the whole world" when
// subtracting circles. 8° padding (~900 km) keeps its edge far outside play.
function _rqWorldRect(set) {
    const pad = 8;
    const lats = set.map((q) => q.lat);
    const lngs = set.map((q) => q.lng);
    return turf.bboxPolygon([
        Math.max(Math.min(...lngs) - pad, -180),
        Math.max(Math.min(...lats) - pad, -85),
        Math.min(Math.max(...lngs) + pad, 180),
        Math.min(Math.max(...lats) + pad, 85),
    ]);
}

// Possible region: intersection of yes-circles minus no-circles.
// Returns { possible, worldRect, hasYes } — possible is null when the answers
// contradict each other (empty region).
function _rqComputeRegion() {
    const set = _rqQuestions.filter((q) => q.lat !== null);
    if (!set.length) return null;

    const yes = set.filter((q) => q.answer === 'yes');
    const worldRect = _rqWorldRect(set);

    let possible = yes.length ? _rqCircle(yes[0]) : worldRect;
    for (let i = 1; i < yes.length && possible; i++) {
        possible = turf.intersect(possible, _rqCircle(yes[i]));
    }
    for (const q of set) {
        if (!possible) break;
        if (q.answer === 'no') possible = turf.difference(possible, _rqCircle(q));
    }
    return { possible, worldRect, hasYes: yes.length > 0 };
}

function _rqFmtArea(km2) {
    const v = units === 'imperial' ? km2 * 0.38610216 : km2;
    const unit = units === 'imperial' ? 'mi²' : 'km²';
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${unit}`;
}

// ── Combined overlay ──────────────────────────────────────────────────────────
function _rqUpdateOverlay() {
    if (_rqMaskLayer) {
        map.removeLayer(_rqMaskLayer);
        _rqMaskLayer = null;
    }
    if (_rqOutlineLayer) {
        map.removeLayer(_rqOutlineLayer);
        _rqOutlineLayer = null;
    }

    const region = _rqComputeRegion();
    if (!region) return;

    if (!region.possible) {
        // Contradictory answers: nothing is possible → shade everything
        _rqMaskLayer = L.geoJSON(region.worldRect, {
            style: { stroke: false, fillColor: '#0d1117', fillOpacity: 0.55 },
            interactive: false,
        }).addTo(map);
        setStatus(t('status_rq_conflict'), 'error');
        return;
    }

    const mask = turf.difference(region.worldRect, region.possible);
    if (mask) {
        _rqMaskLayer = L.geoJSON(mask, {
            style: { stroke: false, fillColor: '#0d1117', fillOpacity: 0.55 },
            interactive: false,
        }).addTo(map);
    }
    _rqOutlineLayer = L.geoJSON(region.possible, {
        style: { color: '#3fb950', weight: 2.5, fill: false },
        interactive: false,
    }).addTo(map);

    // Only meaningful when at least one yes-circle bounds the region
    if (region.hasYes) {
        setStatus(tf('status_rq_area', _rqFmtArea(turf.area(region.possible) / 1e6)), 'ok');
    }
}

// ── Per-question map layers (thin circle + draggable handle + label) ──────────
function _rqDrawQuestion(q) {
    _rqClearLayers(q);
    if (q.lat === null) return;

    const color = q.answer === 'yes' ? '#3fb950' : '#f85149';
    const center = L.latLng(q.lat, q.lng);

    const circle = L.circle(center, {
        radius: q.km * 1000,
        color,
        weight: 2,
        dashArray: q.answer === 'yes' ? undefined : '6 4',
        fill: false,
        interactive: false,
    }).addTo(map);
    const label = makeKmLabel(center, q.km, color).addTo(map);

    const handle = makeDragHandle(center, color);
    handle.on('drag', (e) => {
        const c = e.target.getLatLng();
        circle.setLatLng(c);
        label.setLatLng(radiusLabelPos(c, q.km));
    });
    handle.on('dragend', (e) => {
        const c = e.target.getLatLng();
        q.lat = c.lat;
        q.lng = c.lng;
        _rqRenderCards();
        _rqUpdateOverlay();
        updatePermalink();
    });

    q.layers = [circle, label, handle];
}

function _rqClearLayers(q) {
    q.layers.forEach((l) => map.removeLayer(l));
    q.layers = [];
}

// ── Map click hook for picking the question spot ──────────────────────────────
addMapClickHook((e) => {
    if (_rqPickingId === null) return false;
    const q = _rqQuestions.find((x) => x.id === _rqPickingId);
    _rqPickingId = null;
    if (!q) return false;
    _rqSetCenter(q, e.latlng.lat, e.latlng.lng);
    return true;
});

function _rqSetCenter(q, lat, lng) {
    q.lat = lat;
    q.lng = lng;
    _rqRenderCards();
    _rqDrawQuestion(q);
    _rqUpdateOverlay();
    updatePermalink();
}

// ── Public API (sidebar) ──────────────────────────────────────────────────────
function addRadiusQuestion() {
    _rqQuestions.push({ id: _rqNextId++, km: 1, answer: 'yes', lat: null, lng: null, layers: [] });
    _rqRenderCards();
}

function removeRadiusQuestion(id) {
    const idx = _rqQuestions.findIndex((x) => x.id === id);
    if (idx === -1) return;
    _rqClearLayers(_rqQuestions[idx]);
    _rqQuestions.splice(idx, 1);
    _rqRenderCards();
    _rqUpdateOverlay();
    updatePermalink();
}

function clearAllRadiusQuestions() {
    _rqQuestions.forEach(_rqClearLayers);
    _rqQuestions.length = 0;
    _rqRenderCards();
    _rqUpdateOverlay();
    updatePermalink();
}

function rqSetRadius(id, val) {
    const q = _rqQuestions.find((x) => x.id === id);
    if (!q) return;
    const v = parseFloat(String(val).replace(',', '.'));
    if (isNaN(v) || v <= 0) return;
    q.km = toKm(v);
    _rqDrawQuestion(q);
    _rqUpdateOverlay();
    updatePermalink();
}

function rqSetAnswer(id, answer) {
    const q = _rqQuestions.find((x) => x.id === id);
    if (!q || q.answer === answer) return;
    q.answer = answer;
    _rqRenderCards();
    _rqDrawQuestion(q);
    _rqUpdateOverlay();
    updatePermalink();
}

function rqStartPick(id) {
    _rqPickingId = id;
    document.getElementById(`rq-pick-btn-${id}`)?.classList.add('meas-active');
    setStatus(t('status_rq_pick'), 'loading');
    closeSidebarForPick();
}

// Use the live geolocation marker (🎯 FAB) as the question spot — the usual
// case: the seeker asks from where they are standing right now.
function rqUseGeo(id) {
    const q = _rqQuestions.find((x) => x.id === id);
    if (!q) return;
    if (!geoMarker) {
        setStatus(t('status_rq_no_geo'), 'error');
        return;
    }
    const c = geoMarker.getLatLng();
    _rqSetCenter(q, c.lat, c.lng);
}

// ── Permalink serialisation / restore ─────────────────────────────────────────
// Format: lat,lng,km,y|n
function rqSerialise() {
    return _rqQuestions
        .filter((q) => q.lat !== null)
        .map((q) =>
            [q.lat.toFixed(5), q.lng.toFixed(5), q.km, q.answer === 'yes' ? 'y' : 'n'].join(','),
        );
}

function rqRestoreFromPermalink(params) {
    for (const s of params) {
        const [latStr, lngStr, kmStr, ans] = s.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const km = parseFloat(kmStr);
        if (isNaN(lat) || isNaN(lng) || isNaN(km) || km <= 0) continue;
        const q = {
            id: _rqNextId++,
            km,
            answer: ans === 'n' ? 'no' : 'yes',
            lat,
            lng,
            layers: [],
        };
        _rqQuestions.push(q);
        _rqDrawQuestion(q);
    }
    _rqRenderCards();
    _rqUpdateOverlay();
}

// ── Render question cards ─────────────────────────────────────────────────────
function _rqRenderCards() {
    const el = document.getElementById('rqCards');
    if (!el) return;

    el.innerHTML = _rqQuestions
        .map((q, i) => {
            const coordTxt =
                q.lat !== null
                    ? `${q.lat.toFixed(5)}° N  ${q.lng.toFixed(5)}° E`
                    : t('rq_set_center');
            const radiusVal = fromKm(q.km);
            return `
<div class="tent-card" id="rq-${q.id}">
  <div class="tent-card-hdr">
    <span class="tent-card-title">${tf('rq_card_title', i + 1)}</span>
    <button class="ghost tent-card-del" onclick="removeRadiusQuestion(${q.id})" title="Remove">✕</button>
  </div>
  <div class="row" style="align-items:center;margin-bottom:6px">
    <input type="number" value="${q.km % 1 === 0 ? radiusVal : radiusVal.toFixed(2)}" min="0.05" step="0.05" style="max-width:80px"
      onchange="rqSetRadius(${q.id}, this.value)">
    <span style="color:#8b949e;font-size:12px">${tf('lbl_radius', unitStr())}</span>
  </div>
  <div class="row" style="margin-bottom:6px">
    <button class="rq-ans rq-ans-yes${q.answer === 'yes' ? ' active' : ''}" onclick="rqSetAnswer(${q.id},'yes')">${t('rq_yes')}</button>
    <button class="rq-ans rq-ans-no${q.answer === 'no' ? ' active' : ''}" onclick="rqSetAnswer(${q.id},'no')">${t('rq_no')}</button>
  </div>
  <div class="row" style="margin-bottom:6px">
    <button id="rq-pick-btn-${q.id}" class="tent-pick-btn" style="margin-bottom:0" onclick="rqStartPick(${q.id})">${t('rq_pick_btn')}</button>
    <button class="tent-pick-btn" style="margin-bottom:0" onclick="rqUseGeo(${q.id})" title="${t('rq_geo_title')}">🎯</button>
  </div>
  <div class="tent-coord" style="margin-bottom:0">${esc(coordTxt)}</div>
</div>`;
        })
        .join('');
}
