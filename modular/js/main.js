function updateSelectionBadges() {
    const polyLabel = document.getElementById('selected-polygon-label');
    const routeBtn = document.getElementById('selected-route-btn');
    const stopBtn = document.getElementById('selected-stop-btn');

    if (polyLabel) polyLabel.textContent = window.selectedPolygonGid ? `Area: ${window.selectedPolygonGid}` : 'Area: none';
    if (routeBtn) {
        const meta = window.routesMetadata[window.selectedRouteId] || {};
        const routeName = meta.name || window.selectedRouteId || 'none';
        routeBtn.textContent = `Route: ${routeName || 'none'}`;
        if (meta.link) {
            routeBtn.disabled = false;
            routeBtn.onclick = () => window.open(meta.link, '_blank');
        } else {
            routeBtn.disabled = true;
            routeBtn.onclick = null;
        }
    }
    if (stopBtn) {
        const meta = window.stopsMetadata[window.selectedStopId] || {};
        const stopName = meta.name || window.selectedStopId || 'none';
        stopBtn.textContent = `Stop: ${stopName || 'none'}`;
        if (meta.link) {
            stopBtn.disabled = false;
            stopBtn.onclick = () => window.open(meta.link, '_blank');
        } else {
            stopBtn.disabled = true;
            stopBtn.onclick = null;
        }
    }
}

window.showRouteListSection = function (show) {
    const section = document.getElementById('route-list-controls');
    if (section) section.style.display = show ? 'block' : 'none';
};

window.showStopListSection = function (show) {
    // no-op (stop dropdown stays in controls)
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
    // stop dropdown reset
    const stopSelect = document.getElementById('stop-select');
    if (stopSelect) {
        stopSelect.disabled = true;
        stopSelect.innerHTML = '<option>Pick a route first</option>';
    }
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
    const stopSelect = document.getElementById('stop-select');
    if (stopSelect) {
        stopSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                onStopClick(val);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    wireControls();
    loadMetadata();
    updateSelectionBadges();
});
