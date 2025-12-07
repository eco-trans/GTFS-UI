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
        btn.textContent = label;
        btn.onclick = () => onRouteClick(rid);
        container.appendChild(btn);
    });

    document.getElementById('route-list-section').style.display = routeIds.length ? 'block' : 'none';
};

window.drawRoutesAndStopsFromPolygon = async function (stopIds, routeIds) {
    if (!window.map) return;
    window.routesLayerGroup.clearLayers();
    window.stopsLayerGroup.clearLayers();
    window.routeLayerIndex = {};
    window.routeArrowIndex = {};
    window.stopMarkerIndex = {};

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
            }).on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onRouteClick(routeId);
            });

            if (hasReverse) {
                line.bindTooltip('Two-way connection', { sticky: true });
            } else {
                const label = meta.name || `Route ${routeId}`;
                line.bindTooltip(label, { sticky: true });
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

    if (bounds.length > 0) {
        window.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }

    if (window.stopsLayerGroup.bringToFront) {
        window.stopsLayerGroup.bringToFront();
    }
};

window.onRouteClick = function (routeId) {
    window.selectedRouteId = routeId;
    window.selectedStopId = null;
    updateSelectionBadges();

    styleRoutesAndStopsForSelection();
    populateStopList(routeId);
};

window.styleRoutesAndStopsForSelection = function () {
    Object.keys(window.routeLayerIndex).forEach((rid) => {
        const meta = window.routesMetadata[rid] || {};
        const baseColor = meta.color ? `#${meta.color}` : '#2980b9';
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
        entry.marker.setStyle({
            radius: isSelectedStop ? 11 : isOnSelected ? 9 : 6,
            fillOpacity: isSelectedStop ? 0.95 : isOnSelected ? 0.9 : 0.6,
            color: isSelectedStop ? '#e74c3c' : isOnSelected ? '#34495e' : '#bdc3c7',
            fillColor: isSelectedStop ? '#e74c3c' : isOnSelected ? '#3498db' : '#ecf0f1',
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
    });
}
