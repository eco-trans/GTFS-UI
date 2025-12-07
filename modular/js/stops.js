window.ensureStopMarker = function (stopId, coord, routeId) {
    const [lat, lon] = coord;
    if (!window.stopMarkerIndex[stopId]) {
        const meta = window.stopsMetadata[stopId] || {};
        const marker = L.circleMarker([lat, lon], {
            radius: 6,
            color: '#34495e',
            weight: 0.4, // keep stroke very thin by default
            fillColor: '#3498db',
            fillOpacity: 0.8,
        }).on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (window.selectedRouteId) {
                onStopClick(stopId);
            }
        });

        marker.bindPopup(`<b>${meta.name || 'Stop ' + stopId}</b><br/>Stop ID: ${stopId}`);
        window.stopsLayerGroup.addLayer(marker);
        window.stopMarkerIndex[stopId] = { marker, routes: new Set() };
    }
    window.stopMarkerIndex[stopId].routes.add(routeId);
};

window.populateStopList = function (routeId) {
    const stopSection = document.getElementById('stop-list-section');
    const routeSection = document.getElementById('route-list-section');
    const container = document.getElementById('stop-list');
    if (!container || !stopSection || !routeSection) return;

    if (!window.selectedPolygonGid) return;
    const stopsInPolygon = new Set((window.polygonStopMapping[window.selectedPolygonGid] || []).map(String));
    const edges = window.routeEdgesCache[routeId] || [];
    const stopsForRoute = new Set();

    edges.forEach(([a, b]) => {
        if (stopsInPolygon.has(String(a))) stopsForRoute.add(String(a));
        if (stopsInPolygon.has(String(b))) stopsForRoute.add(String(b));
    });

    container.innerHTML = '';
    Array.from(stopsForRoute)
        .sort()
        .forEach((sid) => {
            const meta = window.stopsMetadata[sid] || {};
            const label = meta.name || sid;
            const btn = document.createElement('button');
            btn.className = 'pill-button';
            btn.textContent = label;
            btn.onclick = () => onStopClick(sid);
            container.appendChild(btn);
        });

    routeSection.style.display = 'none';
    stopSection.style.display = stopsForRoute.size ? 'block' : 'none';
};

window.onStopClick = function (stopId) {
    if (!window.selectedRouteId) return;
    window.selectedStopId = stopId;
    updateSelectionBadges();
    renderCharts(window.selectedRouteId, stopId);
    styleRoutesAndStopsForSelection();
};
