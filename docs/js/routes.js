window.getRoutesForStops = async function (stopIds) {
    const routes = new Set();
    await Promise.all(
        stopIds.map(async (stopId) => {
            const key = String(stopId);
            if (!window.stopRouteMappingCache[key]) {
                window.stopRouteMappingCache[key] = await safeFetchJson(`${window.STOP_ROUTE_MAPPING_BASE}/${key}.json`);
            }
            const list = window.stopRouteMappingCache[key];
            if (Array.isArray(list)) {
                list.forEach((rid) => routes.add(String(rid)));
            }
        })
    );
    return Array.from(routes).sort();
};

window.populateRouteList = function (routeIds) {
    const container = document.getElementById('route-list');
    if (!container) return;
    container.innerHTML = '';
    routeIds.forEach((rid) => {
        const meta = window.routesMetadata[rid] || {};
        const label = meta.name || rid;
        const btn = document.createElement('button');
        btn.className = 'pill-button';
        btn.dataset.routeId = rid;
        btn.textContent = rid + " " + label;
        btn.onclick = () => onRouteClick(rid);
        container.appendChild(btn);
    });

    const controlsSection = document.getElementById('route-list-controls');
    if (controlsSection) {
        controlsSection.style.display = routeIds.length ? 'block' : 'none';
    }
    // hide stop dropdown until a route is selected
    showStopListSection(false);
    const stopSelect = document.getElementById('stop-select');
    if (stopSelect) {
        stopSelect.disabled = true;
        stopSelect.innerHTML = '<option>Pick a route first</option>';
    }
};

window.drawRoutesAndStopsFromPolygon = async function (stopIds, routeIds) {
    if (!window.map) return;
    window.routesLayerGroup.clearLayers();
    window.stopsLayerGroup.clearLayers();
    window.routeLayerIndex = {};
    window.routeArrowIndex = {};
    window.stopMarkerIndex = {};
    window.currentRoutesInView = routeIds.slice();

    const bounds = [];

    for (const routeId of routeIds) {
        if (!window.routeEdgesCache[routeId]) {
            window.routeEdgesCache[routeId] = await safeFetchJson(`${window.ROUTE_EDGES_BASE}/${routeId}.json`);
        }
        const edges = window.routeEdgesCache[routeId];
        if (!Array.isArray(edges)) continue;

        const edgeSet = new Set(edges.map(([a, b]) => `${b}-${a}`));
        window.routeLayerIndex[routeId] = [];
        window.routeArrowIndex[routeId] = [];

        edges.forEach(([from, to]) => {
            const start = window.stopLocations[from];
            const end = window.stopLocations[to];
            if (!start || !end) return;

            bounds.push(start, end);
            const hasReverse = edgeSet.has(`${from}-${to}`);
            const meta = window.routesMetadata[routeId] || {};
            const color = meta.color ? `#${meta.color}` : '#2980b9';

            const line = L.polyline([start, end], {
                color,
                weight: hasReverse ? 4 : 3,
                opacity: 0.9,
                pane: 'routesPane',
            }).on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onRouteClick(routeId);
            });

            if (hasReverse) {
                const label = meta.name || `Route ${routeId}`;
                line.bindTooltip(`<strong>${routeId} ${label}</strong><br>(Two-way)`, {
                    sticky: true,
                    direction: 'auto',
                    opacity: 0.95,
                });
            } else {
                const label = meta.name || `Route ${routeId}`;
                line.bindTooltip(`<strong>${routeId} ${label}</strong>`, {
                    sticky: true,
                    direction: 'auto',
                    opacity: 0.95,
                });
            }

            window.routesLayerGroup.addLayer(line);
            window.routeLayerIndex[routeId].push(line);
            const arrow = createDirectionArrow(start, end, color);
            if (arrow) {
                window.routesLayerGroup.addLayer(arrow);
                window.routeArrowIndex[routeId].push(arrow);
            }

            ensureStopMarker(String(from), start, routeId);
            ensureStopMarker(String(to), end, routeId);
        });
    }

    if (window.stopsLayerGroup.bringToFront) {
        window.stopsLayerGroup.bringToFront();
    }

    styleRoutesAndStopsForSelection();
};

window.onRouteClick = async function (routeId) {
    window.selectedRouteId = routeId;
    window.selectedStopId = null;
    updateSelectionBadges();

    styleRoutesAndStopsForSelection();
    await populateStopSelect(routeId);
    showStopListSection(true);
    updateRouteListSelection();
};

window.styleRoutesAndStopsForSelection = function () {
    const activeRouteSet = window.selectedRouteId ? [String(window.selectedRouteId)] : window.currentRoutesInView.map(String);
    const stopDelayRange = computeStopDelayRange(activeRouteSet);
    const stopOtpRange = computeStopOtpRange(activeRouteSet);
    const routeOtpRange = computeRouteOtpRange(window.currentRoutesInView);

    Object.keys(window.routeLayerIndex).forEach((rid) => {
        const meta = window.routesMetadata[rid] || {};
        const baseColor =
            window.colorMode === 'otp'
                ? getRouteOtpColor(rid, routeOtpRange)
                : meta.color
                ? `#${meta.color}`
                : '#2980b9';
        const isSelected = window.selectedRouteId === rid;
        const opacity = isSelected || !window.selectedRouteId ? 0.95 : 0.7;
        const dimColor = '#bdc3c7';

        window.routeLayerIndex[rid].forEach((line) => {
            line.setStyle({
                color: isSelected || !window.selectedRouteId ? baseColor : dimColor,
                opacity,
                weight: isSelected ? 5 : 3,
            });
        });
        (window.routeArrowIndex[rid] || []).forEach((arrow) => {
            arrow.setStyle({
                color: isSelected || !window.selectedRouteId ? baseColor : dimColor,
                opacity,
                weight: isSelected ? 1.6 : 1.2,
            });
        });
    });

    Object.keys(window.stopMarkerIndex).forEach((sid) => {
        const entry = window.stopMarkerIndex[sid];
        const isOnSelected = !window.selectedRouteId || entry.routes.has(window.selectedRouteId);
        const isSelectedStop = window.selectedStopId === sid;
        const colorVal =
            window.colorMode === 'otp'
                ? getStopOtpColor(sid, activeRouteSet, stopOtpRange)
                : getStopDelayColor(sid, activeRouteSet, stopDelayRange);
        const baseFill = colorVal || '#3498db';
        entry.marker.setStyle({
            radius: isSelectedStop ? 11 : isOnSelected ? 9 : 6,
            fillOpacity: isSelectedStop ? 0.95 : isOnSelected ? 0.9 : 0.6,
            color: isSelectedStop ? '#e74c3c' : isOnSelected ? '#34495e' : '#bdc3c7',
            fillColor: isSelectedStop ? '#e74c3c' : isOnSelected ? baseFill : '#ecf0f1',
            weight: isSelectedStop ? 1 : isOnSelected ? 0.6 : 0,
        });
        if (entry.marker.bringToFront) entry.marker.bringToFront();
    });
};

function createDirectionArrow(start, end, color) {
    if (!Array.isArray(start) || !Array.isArray(end)) return null;
    const dLat = end[0] - start[0];
    const dLng = end[1] - start[1];
    const segLen = Math.sqrt(dLat * dLat + dLng * dLng);
    if (!segLen) return null;

    // Keep arrow size small and proportional to segment length.
    const arrowLen = Math.min(0.00008, Math.max(0.000015, segLen * 0.18));
    const ux = dLat / segLen;
    const uy = dLng / segLen;

    const tip = [start[0] + dLat * 0.55, start[1] + dLng * 0.55];
    const base = [tip[0] - ux * arrowLen, tip[1] - uy * arrowLen];
    const perpX = -uy;
    const perpY = ux;
    const left = [base[0] + perpX * arrowLen * 0.28, base[1] + perpY * arrowLen * 0.28];
    const right = [base[0] - perpX * arrowLen * 0.28, base[1] - perpY * arrowLen * 0.28];

    return L.polyline([left, tip, right], {
        color,
        weight: 1.5,
        opacity: 0.9,
        interactive: false,
        pane: 'routesPane',
    });
}

window.populateStopSelect = async function (routeId) {
    const select = document.getElementById('stop-select');
    if (!select) return;
    const stopsForRoute = new Set();

    // Primary source: route_edges to collect all stops on this route.
    if (!window.routeEdgesCache[routeId]) {
        window.routeEdgesCache[routeId] = await safeFetchJson(`${window.ROUTE_EDGES_BASE}/${routeId}.json`);
    }
    const routeEdges = window.routeEdgesCache[routeId] || [];
    routeEdges.forEach(([a, b]) => {
        if (a) stopsForRoute.add(String(a));
        if (b) stopsForRoute.add(String(b));
    });

    // Fallback/augment: if polygon selection exists, include any stops in polygon that map to this route.
    const stopsInPolygon = new Set((window.polygonStopMapping[String(window.selectedPolygonGid)] || []).map(String));
    await Promise.all(
        Array.from(stopsInPolygon).map(async (sid) => {
            if (!window.stopRouteMappingCache[sid]) {
                window.stopRouteMappingCache[sid] = await safeFetchJson(`${window.STOP_ROUTE_MAPPING_BASE}/${sid}.json`);
            }
            const routesForStop = window.stopRouteMappingCache[sid];
            if (Array.isArray(routesForStop) && routesForStop.includes(routeId)) {
                stopsForRoute.add(sid);
            }
        })
    );

    select.innerHTML = '';
    if (!stopsForRoute.size) {
        select.disabled = true;
        const opt = document.createElement('option');
        opt.textContent = 'No stops for this route in area';
        select.appendChild(opt);
        return;
    }

    select.disabled = false;
    const defaultOpt = document.createElement('option');
    defaultOpt.textContent = 'Select a stop...';
    defaultOpt.value = '';
    select.appendChild(defaultOpt);

    Array.from(stopsForRoute)
        .sort()
        .forEach((sid) => {
            const meta = window.stopsMetadata[sid] || {};
            const opt = document.createElement('option');
            opt.value = sid;
            opt.textContent = meta.name ? `${meta.name} (${sid})` : sid;
            select.appendChild(opt);
        });

    select.value = '';
};

function updateRouteListSelection() {
    const buttons = document.querySelectorAll('#route-list .pill-button');
    buttons.forEach((btn) => {
        const rid = btn.dataset.routeId;
        if (window.selectedRouteId && rid === String(window.selectedRouteId)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function computeStopDelayRange(routeIds) {
    const vals = [];
    const stopIds = Object.keys(window.stopMarkerIndex || {});

    // When a route is selected, use per-route averages; otherwise use stop-level averages.
    if (window.selectedRouteId && routeIds && routeIds.length) {
        const routeSet = new Set(routeIds.map(String));
        stopIds.forEach((sid) => {
            const stopEntry = window.stopRouteDelayAvg[sid];
            if (!stopEntry) return;
            Object.entries(stopEntry).forEach(([rid, v]) => {
                if (!routeSet.has(String(rid))) return;
                if (typeof v === 'number') vals.push(-1 * v);
            });
        });
    } else {
        stopIds.forEach((sid) => {
            const v = window.stopDelayAvg ? window.stopDelayAvg[sid] : null;
            if (typeof v === 'number') vals.push(-1 * v);
        });
    }

    if (!vals.length) return { min: null, max: null };
    return { min: Math.min(...vals), max: Math.max(...vals) };
}

function getStopDelayColor(stopId, routeIds, range) {
    if (!range || range.min == null || range.max == null) return null;
    let val = null;

    if (window.selectedRouteId && routeIds && routeIds.length) {
        const stopEntry = window.stopRouteDelayAvg[stopId];
        if (!stopEntry) return null;
        const routeSet = new Set(routeIds.map(String));
        const vals = [];
        Object.entries(stopEntry).forEach(([rid, v]) => {
            if (!routeSet.has(String(rid))) return;
            if (typeof v === 'number') vals.push(-1 * v);
        });
        if (!vals.length) return null;
        val = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else {
        const v = window.stopDelayAvg ? window.stopDelayAvg[stopId] : null;
        if (typeof v !== 'number') return null;
        val = -1 * v;
    }

    if (val == null) return null;
    const t = range.max === range.min ? 0.5 : Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min)));
    return redsGradient(t);
}

function computeStopOtpRange(routeIds) {
    const vals = [];
    const stopIds = Object.keys(window.stopMarkerIndex || {});

    if (window.selectedRouteId && routeIds && routeIds.length) {
        const routeSet = new Set(routeIds.map(String));
        stopIds.forEach((sid) => {
            const stopEntry = window.stopRouteOtp[sid];
            if (!stopEntry) return;
            Object.entries(stopEntry).forEach(([rid, v]) => {
                if (!routeSet.has(String(rid))) return;
                if (typeof v === 'number') vals.push(v);
            });
        });
    } else {
        stopIds.forEach((sid) => {
            const v = window.stopOtp ? window.stopOtp[sid] : null;
            if (typeof v === 'number') vals.push(v);
        });
    }

    if (!vals.length) return { min: null, max: null };
    return { min: Math.min(...vals), max: Math.max(...vals) };
}

function getStopOtpColor(stopId, routeIds, range) {
    if (!range || range.min == null || range.max == null) return null;
    let val = null;

    if (window.selectedRouteId && routeIds && routeIds.length) {
        const stopEntry = window.stopRouteOtp[stopId];
        if (!stopEntry) return null;
        const routeSet = new Set(routeIds.map(String));
        const vals = [];
        Object.entries(stopEntry).forEach(([rid, v]) => {
            if (!routeSet.has(String(rid))) return;
            if (typeof v === 'number') vals.push(v);
        });
        if (!vals.length) return null;
        val = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else {
        const v = window.stopOtp ? window.stopOtp[stopId] : null;
        if (typeof v !== 'number') return null;
        val = v;
    }

    const t = range.max === range.min ? 0.5 : Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min)));
    return bluesGradient(t);
}

function computeRouteOtpRange(routeIds) {
    if (!routeIds || !routeIds.length) return { min: null, max: null };
    const vals = [];
    routeIds.forEach((rid) => {
        const v = routeOtpMean(rid);
        if (v != null) vals.push(v);
    });
    if (!vals.length) return { min: null, max: null };
    return { min: Math.min(...vals), max: Math.max(...vals) };
}

function routeOtpMean(routeId) {
    const stops = Object.keys(window.stopMarkerIndex || {});
    const vals = [];
    stops.forEach((sid) => {
        const entry = window.stopRouteOtp[sid];
        if (entry && typeof entry[routeId] === 'number') vals.push(entry[routeId]);
    });
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function getRouteOtpColor(routeId, range) {
    if (!range || range.min == null || range.max == null) return '#2980b9';
    const val = routeOtpMean(routeId);
    if (val == null) return '#2980b9';
    const t = range.max === range.min ? 0.5 : Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min)));
    return bluesGradient(t);
}

function redsGradient(t) {
    const c1 = [255, 245, 235]; // light
    const c2 = [203, 24, 29]; // dark
    const r = Math.round(c1[0] + t * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + t * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + t * (c2[2] - c1[2]));
    return `rgb(${r},${g},${b})`;
}

function bluesGradient(t) {
    const c1 = [239, 243, 255]; // light blue
    const c2 = [8, 81, 156]; // dark blue
    const r = Math.round(c1[0] + t * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + t * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + t * (c2[2] - c1[2]));
    return `rgb(${r},${g},${b})`;
}
