'use strict';

// ── Station name length checker ───────────────────────────────────────────────
// Seeker question: "Our station's name has N characters – does yours too?"
// Hyphens and spaces count, and so does a word like "Station" in "Union
// Station" – i.e. the full name string is measured as-is.
// The hiders answer yes/no; matching stations stay green (possible), the rest
// is greyed out – or the other way round when the answer is "no".

let slAnswerYes = true;
let slMarkers = [];

function setSlAnswer(yes) {
    slAnswerYes = yes;
    document.getElementById('slAnsYes').classList.toggle('ghost', !yes);
    document.getElementById('slAnsNo').classList.toggle('ghost', yes);
}

// Full string length, counting every character (incl. spaces and hyphens).
// Array.from() counts Unicode code points, not UTF-16 units.
function slNameLength(name) {
    return Array.from(name.trim()).length;
}

function slRemoveMarkers() {
    slMarkers.forEach((m) => map.removeLayer(m));
    slMarkers = [];
}

function clearStationLength() {
    slRemoveMarkers();
    document.getElementById('slLen').value = '';
    document.getElementById('slResult').innerHTML = '';
    setStatus(t('status_ready'), '');
}

function slMarker(center, name, len, kept) {
    const marker = L.circleMarker([center.lat, center.lng], {
        radius: kept ? 9 : 5,
        fillColor: kept ? '#2c9e3c' : '#6b7280',
        color: '#fff',
        weight: kept ? 2 : 1,
        opacity: kept ? 1 : 0.5,
        fillOpacity: kept ? 0.95 : 0.4,
    });
    marker.bindPopup(`
        <div class="popup-name">🚉 ${esc(name)}</div>
        <div class="popup-type">${len} ${t('sl_chars')}</div>
        <div class="popup-coords">${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}</div>`);
    // Clicking a station also sets the radius centre point (same as POI layers)
    marker.on('click', () => {
        setClickedPoint(L.latLng(center.lat, center.lng));
        setStatus(tf('status_center', name), 'ok');
    });
    return marker;
}

async function runStationLengthCheck() {
    const len = parseInt(document.getElementById('slLen').value, 10);
    const resultEl = document.getElementById('slResult');

    if (!Number.isInteger(len) || len < 1) {
        resultEl.innerHTML = `<div class="nc-result nc-miss">${t('sl_need_len')}</div>`;
        return;
    }

    if (!currentCity) await searchCity();
    if (!currentCity) return;

    const btn = document.getElementById('slBtn');
    btn.disabled = true;
    resultEl.innerHTML = `<div class="nc-loading">${t('sl_loading')}</div>`;
    setStatus(t('sl_loading'), 'loading');

    try {
        // Same station set as the "stations" POI layer, but only named ones –
        // a station without a name cannot be measured.
        const bb = currentCity.bbox;
        const data = await overpassFetch(`[out:json][timeout:60];
(
  node(${bbStr(bb)})["railway"~"^(station|halt|tram_stop)$"]["name"];
  node(${bbStr(bb)})["amenity"="bus_station"]["name"];
);
out center bb tags;`);
        const elements = data.elements ?? [];

        slRemoveMarkers();

        // Tram/bus stops often exist as several OSM nodes (one per platform or
        // direction). Markers are drawn for all of them, but the summary and
        // the result list count unique names.
        const keptNames = new Map(); // name → length
        const elimNames = new Set();
        const keptMarkers = [];
        const elimMarkers = [];

        for (const el of elements) {
            const center = getElementCenter(el);
            const name = el.tags?.name;
            if (!center || !name) continue;

            const n = slNameLength(name);
            const kept = slAnswerYes ? n === len : n !== len;

            if (kept) {
                keptNames.set(name, n);
                keptMarkers.push(slMarker(center, name, n, true));
            } else {
                elimNames.add(name);
                elimMarkers.push(slMarker(center, name, n, false));
            }
        }

        // Eliminated first, so the green candidates are drawn on top
        slMarkers = [...elimMarkers, ...keptMarkers];
        slMarkers.forEach((m) => m.addTo(map));

        if (keptNames.size + elimNames.size === 0) {
            resultEl.innerHTML = `<div class="nc-result nc-miss">${t('sl_no_data')}</div>`;
            setStatus(t('status_ready'), '');
            return;
        }

        const summaryClass = keptNames.size > 0 ? 'part-match' : 'no-match';
        const summary = `<div class="nc-summary ${summaryClass}">${tf(
            'sl_summary',
            keptNames.size,
            elimNames.size,
        )}</div>`;

        const MAX_LIST = 50;
        const items = [...keptNames.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const list = items
            .slice(0, MAX_LIST)
            .map(
                ([name, n]) =>
                    `<div class="sl-item"><span class="sl-nm">${esc(name)}</span><span class="sl-len">${n}</span></div>`,
            )
            .join('');
        const more =
            items.length > MAX_LIST
                ? `<div class="sl-more">${tf('sl_more', items.length - MAX_LIST)}</div>`
                : '';

        resultEl.innerHTML = summary + (list ? `<div class="sl-list">${list}${more}</div>` : '');
        setStatus(t('sl_done'), 'ok');
    } catch (err) {
        resultEl.innerHTML = `<div class="nc-result nc-miss">${t('status_err_popup')}</div>`;
        showErrorPopup(err.message);
        setStatus(t('status_err_popup'), 'error');
    } finally {
        btn.disabled = false;
    }
}

// Trigger the check on Enter in the length field
document.getElementById('slLen').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runStationLengthCheck();
});
