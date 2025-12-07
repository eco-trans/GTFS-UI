function updateSelectionBadges() {
    const polyLabel = document.getElementById('selected-polygon-label');
    const routeLabel = document.getElementById('selected-route-label');
    const stopLabel = document.getElementById('selected-stop-label');

    if (polyLabel) polyLabel.textContent = window.selectedPolygonGid ? `Area: ${window.selectedPolygonGid}` : 'Area: none';
    if (routeLabel) {
        const meta = window.routesMetadata[window.selectedRouteId] || {};
        const routeName = meta.name || window.selectedRouteId || 'none';
        routeLabel.textContent = `Route: ${routeName || 'none'}`;
    }
    if (stopLabel) {
        const meta = window.stopsMetadata[window.selectedStopId] || {};
        const stopName = meta.name || window.selectedStopId || 'none';
        stopLabel.textContent = `Stop: ${stopName || 'none'}`;
    }
}

window.showRouteListSection = function (show) {
    const section = document.getElementById('route-list-section');
    if (section) section.style.display = show ? 'block' : 'none';
};

window.showStopListSection = function (show) {
    const section = document.getElementById('stop-list-section');
    if (section) section.style.display = show ? 'block' : 'none';
};

window.showChartArea = function (show) {
    const chartArea = document.getElementById('chart-area');
    if (chartArea) chartArea.style.display = show ? 'grid' : 'none';
};

window.clearRouteSelection = function () {
    window.selectedPolygonGid = null;
    window.selectedRouteId = null;
    window.selectedStopId = null;

    updateSelectionBadges();
    clearCharts();

    window.routesLayerGroup.clearLayers();
    window.stopsLayerGroup.clearLayers();
    window.routeLayerIndex = {};
    window.routeArrowIndex = {};
    window.stopMarkerIndex = {};

    showRouteListSection(false);
    showStopListSection(false);
    showChartArea(false);

    if (window.polygonsLayer && !window.map.hasLayer(window.polygonsLayer)) {
        window.polygonsLayer.addTo(window.map);
    }
};

function wireControls() {
    const clearBtn = document.getElementById('clear-selection');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearRouteSelection);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    wireControls();
    loadMetadata();
    updateSelectionBadges();
});
