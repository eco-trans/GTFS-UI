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

    const pairs = bins.map((b, i) => ({ bin: Number(b), freq: freqs[i] || 0 })).sort((a, b) => a.bin - b.bin);
    const sortedBins = pairs.map((p) => p.bin);
    const sortedFreqs = pairs.map((p) => p.freq);

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
            labels: sortedBins.map((v) => v.toFixed(0)),
            datasets: [
                {
                    label: 'Frequency',
                    data: sortedFreqs,
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
        plugins: [
            {
                id: 'zeroLine',
                afterDraw: (chart) => {
                    const { ctx } = chart;
                    const labels = chart.data.labels.map((v) => Number(v));
                    if (!labels.length) return;
                    let closestIndex = 0;
                    let closestVal = Math.abs(labels[0]);
                    labels.forEach((v, i) => {
                        const d = Math.abs(v);
                        if (d < closestVal) {
                            closestVal = d;
                            closestIndex = i;
                        }
                    });
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    if (!xScale || !yScale) return;
                    const x = xScale.getPixelForValue(closestIndex);
                    ctx.save();
                    ctx.setLineDash([5, 5]);
                    ctx.strokeStyle = '#555';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, yScale.top);
                    ctx.lineTo(x, yScale.bottom);
                    ctx.stroke();
                    ctx.restore();
                },
            },
        ],
    });
};

window.onPolygonClick = async function (gid) {
    if (!window.metaLoaded) return;
    // Ensure polygons layer is on when interacting
    if (window.polygonsLayer && !window.map.hasLayer(window.polygonsLayer)) {
        window.polygonsLayer.addTo(window.map);
        window.polygonsVisible = true;
    }
    window.selectedPolygonGid = gid;
    window.selectedRouteId = null;
    window.selectedStopId = null;

    updateSelectionBadges();
    clearCharts();

    showRouteListSection(true);
    showStopListSection(false);
    showChartArea(false);

    const stopIds = window.polygonStopMapping[String(gid)] || [];
    const routeIds = await getRoutesForStops(stopIds);

    populateRouteList(routeIds);
    await drawRoutesAndStopsFromPolygon(stopIds, routeIds);
};
