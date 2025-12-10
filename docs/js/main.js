function updateSelectionBadges() {
    const polyLabel = document.getElementById('selected-polygon-label');
    const routeText = document.getElementById('selected-route-text');
    const stopText = document.getElementById('selected-stop-text');
    const routeInfoBtn = document.getElementById('route-info-btn');
    const stopInfoBtn = document.getElementById('stop-info-btn');

    if (polyLabel) polyLabel.textContent = window.selectedPolygonGid ? `Area: ${window.selectedPolygonGid}` : 'Area: none';
    const routeMeta = window.routesMetadata[window.selectedRouteId] || {};
    const stopMeta = window.stopsMetadata[window.selectedStopId] || {};
    const routeName = routeMeta.name || window.selectedRouteId || 'none';
    const stopName = stopMeta.name || window.selectedStopId || 'none';

    if (routeText) routeText.textContent = `Route: ${routeName || 'none'}`;
    if (stopText) stopText.textContent = `Stop: ${stopName || 'none'}`;

    if (routeInfoBtn) {
        if (routeMeta.link) {
            routeInfoBtn.disabled = false;
            routeInfoBtn.onclick = () => window.open(routeMeta.link, '_blank');
        } else {
            routeInfoBtn.disabled = true;
            routeInfoBtn.onclick = null;
        }
    }
    if (stopInfoBtn) {
        if (stopMeta.link) {
            stopInfoBtn.disabled = false;
            stopInfoBtn.onclick = () => window.open(stopMeta.link, '_blank');
        } else {
            stopInfoBtn.disabled = true;
            stopInfoBtn.onclick = null;
        }
    }
}

window.showRouteListSection = function (show) {
    const section = document.getElementById('route-list-controls');
    if (section) section.style.display = show ? 'block' : 'none';
};

window.showStopListSection = function (show) {
    const section = document.getElementById('stop-select-container');
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
    const stopSelect = document.getElementById('stop-select');
    if (stopSelect) {
        stopSelect.disabled = true;
        stopSelect.innerHTML = '<option>Pick a route first</option>';
    }
    showChartArea(false);

    if (window.polygonsLayer && !window.map.hasLayer(window.polygonsLayer)) {
        window.polygonsLayer.addTo(window.map);
    }

    if (typeof updateRouteListSelection === 'function') {
        updateRouteListSelection();
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
