window.colorForPolygonMean = function (meanVal) {
    if (meanVal == null || window.polygonMinMean == null || window.polygonMaxMean == null) {
        return '#d7dde5';
    }
    const min = window.polygonMinMean;
    const max = window.polygonMaxMean;
    const span = max - min || 1;
    let t = (meanVal - min) / span;
    t = Math.max(0, Math.min(1, t));
    const c1 = [0xff, 0xf7, 0xbc];
    const c2 = [0xe3, 0x4a, 0x33];
    const r = Math.round(c1[0] + t * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + t * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + t * (c2[2] - c1[2]));
    return `rgb(${r},${g},${b})`;
};

window.initPolygonsLayer = function () {
    if (!window.polygonsGeoJson) return;
    if (window.polygonsLayer) {
        window.polygonsLayer.remove();
    }

    window.polygonsLayer = L.geoJSON(window.polygonsGeoJson, {
        style: (feature) => {
            const gid = feature?.properties?.gid != null ? String(feature.properties.gid) : null;
            const meanVal = gid && window.polygonMeanDelays[gid] != null ? window.polygonMeanDelays[gid] : null;
            return {
                color: '#666',
                weight: 1,
                fillColor: colorForPolygonMean(meanVal),
                fillOpacity: 0.55,
            };
        },
        onEachFeature: (feature, layer) => {
            const gid = feature?.properties?.gid != null ? String(feature.properties.gid) : null;
            if (!gid) return;

            layer.on('mouseover', () => showPolygonHistogram(gid));
            layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onPolygonClick(gid);
            });
        },
    }).addTo(window.map);
};

window.showPolygonHistogram = function (gid) {
    if (!window.spatialDelayData) return;
    const entry = window.spatialDelayData[gid];
    if (!entry || entry.length < 2) return;
    const hist = entry[1];
    if (!Array.isArray(hist) || hist.length < 2) return;

    const freqs = hist[0];
    const bins = hist[1];
    if (!Array.isArray(freqs) || !Array.isArray(bins)) return;

    const canvas = document.getElementById('polygonHistogramChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (window.polygonHistogramChart) {
        window.polygonHistogramChart.destroy();
        window.polygonHistogramChart = null;
    }

    window.polygonHistogramChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.map((v) => v.toFixed(0)),
            datasets: [
                {
                    label: 'Frequency',
                    data: freqs,
                    backgroundColor: 'rgba(52, 152, 219, 0.55)',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Delay (sec)' } },
                y: { title: { display: true, text: 'Count' } },
            },
        },
    });
};

window.onPolygonClick = async function (gid) {
    if (!window.metaLoaded) return;
    window.selectedPolygonGid = gid;
    window.selectedRouteId = null;
    window.selectedStopId = null;

    updateSelectionBadges();
    clearCharts();

    showRouteListSection(true);
    showStopListSection(false);
    showChartArea(false);

    const stopIds = window.polygonStopMapping[gid] || [];
    const routeIds = await getRoutesForStops(stopIds);

    populateRouteList(routeIds);
    await drawRoutesAndStopsFromPolygon(stopIds, routeIds);
};
