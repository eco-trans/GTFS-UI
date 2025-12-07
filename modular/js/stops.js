window.ensureStopMarker = function (stopId, coord, routeId) {
    const [lat, lon] = coord;
    if (!window.stopMarkerIndex[stopId]) {
        const meta = window.stopsMetadata[stopId] || {};
        const marker = L.circleMarker([lat, lon], {
            radius: 6,
            color: '#34495e',
            weight: 0.4,
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

window.onStopClick = function (stopId) {
    if (!window.selectedRouteId) return;
    window.selectedStopId = stopId;
    updateSelectionBadges();
    renderCharts(window.selectedRouteId, stopId);
    styleRoutesAndStopsForSelection();
};
