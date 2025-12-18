window.initMap = function () {
    window.map = L.map('map').setView(window.SF_CENTER, 13);

    window.baseLayerColor = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
    });
    window.baseLayerGray = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors & Carto',
    });
    window.baseLayerGray.addTo(window.map);
    window.currentBaseStyle = 'gray';

    // Layer ordering: tiles (bottom) -> polygons -> routes -> stops (top)
    window.map.createPane('polygonsPane');
    window.map.createPane('routesPane');
    window.map.createPane('stopsPane');
    window.map.getPane('polygonsPane').style.zIndex = 400;
    window.map.getPane('routesPane').style.zIndex = 450;
    window.map.getPane('stopsPane').style.zIndex = 500;

    window.polygonsLayer = L.layerGroup([], { pane: 'polygonsPane' }).addTo(window.map);
    window.routesLayerGroup = L.layerGroup([], { pane: 'routesPane' }).addTo(window.map);
    window.stopsLayerGroup = L.layerGroup([], { pane: 'stopsPane' }).addTo(window.map);

    addMapControls();
    addLegend();
};

window.loadMetadata = async function () {
    setOverlayMessage('Loading metadata...');
    try {
        const [
            stopLoc,
            routesMeta,
            stopsMeta,
            polys,
            polyStops,
            spatial,
            stopRouteDelayAvg,
            stopDelayAvg,
            stopOtp,
            stopRouteOtp,
            spatialOtp,
        ] = await Promise.all([
            safeFetchJson(window.STOP_LOCATION_URL),
            safeFetchJson(window.ROUTES_METADATA_URL),
            safeFetchJson(window.STOPS_METADATA_URL),
            safeFetchJson(window.POLYGONS_URL),
            safeFetchJson(window.POLYGON_STOP_MAPPING_URL),
            safeFetchJson(window.SPATIAL_DELAY_URL),
            safeFetchJson(window.STOP_ROUTE_DELAY_AVG_URL),
            safeFetchJson(window.STOP_DELAY_AVG_URL),
            safeFetchJson(window.STOP_OTP_URL),
            safeFetchJson(window.STOP_ROUTE_OTP_URL),
            safeFetchJson(window.SPATIAL_OTP_URL),
        ]);

        if (
            !stopLoc ||
            !routesMeta ||
            !stopsMeta ||
            !polys ||
            !polyStops ||
            !spatial ||
            !stopRouteDelayAvg ||
            !stopDelayAvg ||
            !stopOtp ||
            !stopRouteOtp ||
            !spatialOtp
        ) {
            throw new Error('One or more metadata files failed to load');
        }

        window.stopLocations = stopLoc;
        window.routesMetadata = routesMeta;
        window.stopsMetadata = stopsMeta;
        window.polygonsGeoJson = polys;
        window.polygonStopMapping = polyStops;
        window.spatialDelayData = spatial;
        window.stopRouteDelayAvg = stopRouteDelayAvg;
        window.stopDelayAvg = stopDelayAvg;
        window.stopOtp = stopOtp;
        window.stopRouteOtp = stopRouteOtp;
        window.spatialOtp = spatialOtp;

        const means = [];
        window.polygonMeanDelays = {};

        Object.keys(window.spatialDelayData).forEach((gid) => {
            const entry = window.spatialDelayData[gid];
            if (!Array.isArray(entry) || entry.length < 2) return;
            const meanRaw = entry[0];
            const hist = entry[1];

            if (typeof meanRaw === 'number') {
                const flipped = -meanRaw;
                window.polygonMeanDelays[gid] = flipped;
                means.push(flipped);
            }

            if (Array.isArray(hist) && hist.length === 2 && Array.isArray(hist[1])) {
                hist[1] = hist[1].map((v) => -v);
            }
        });

        window.polygonMinMean = means.length ? Math.min(...means) : null;
        window.polygonMaxMean = means.length ? Math.max(...means) : null;

        // Precompute OTP polygon stats
        const otpVals = [];
        window.polygonOtpMean = {};
        Object.keys(window.spatialOtp || {}).forEach((gid) => {
            const val = window.spatialOtp[gid];
            if (typeof val === 'number') {
                window.polygonOtpMean[gid] = val;
                otpVals.push(val);
            }
        });
        window.polygonOtpMin = otpVals.length ? Math.min(...otpVals) : null;
        window.polygonOtpMax = otpVals.length ? Math.max(...otpVals) : null;
        window.metaLoaded = true;

        initPolygonsLayer();
        setOverlayMessage('', false);
        updateLegend();
    } catch (err) {
        console.error(err);
        setOverlayMessage('Error loading metadata. Please refresh.', true);
    }
};

function addMapControls() {
    const Control = L.Control.extend({
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-bar custom-map-controls');

            const styleBtn = L.DomUtil.create('a', '', container);
            styleBtn.href = '#';
            styleBtn.title = 'Toggle base map style';
            styleBtn.innerHTML = '🗺️';
            styleBtn.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                toggleBaseMapStyle();
            };

            const polyBtn = L.DomUtil.create('a', '', container);
            polyBtn.href = '#';
            polyBtn.title = 'Toggle polygons';
            polyBtn.innerHTML = '▭';
            polyBtn.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                togglePolygons();
            };

            const modeBtn = L.DomUtil.create('a', '', container);
            modeBtn.href = '#';
            modeBtn.title = 'Toggle delay/OTP coloring';
            modeBtn.innerHTML = 'Δ/Ω';
            modeBtn.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                toggleColorMode();
            };

            return container;
        },
    });
    window.map.addControl(new Control({ position: 'topleft' }));
}

window.toggleBaseMapStyle = function () {
    if (!window.map || !window.baseLayerColor || !window.baseLayerGray) return;
    if (window.currentBaseStyle === 'color') {
        if (window.map.hasLayer(window.baseLayerColor)) window.map.removeLayer(window.baseLayerColor);
        window.baseLayerGray.addTo(window.map);
        window.currentBaseStyle = 'gray';
    } else {
        if (window.map.hasLayer(window.baseLayerGray)) window.map.removeLayer(window.baseLayerGray);
        window.baseLayerColor.addTo(window.map);
        window.currentBaseStyle = 'color';
    }
    const btn = document.getElementById('map-style-toggle');
    if (btn) {
        btn.textContent = window.currentBaseStyle === 'color' ? 'Switch to grayscale' : 'Switch to color';
    }
};

window.togglePolygons = function () {
    if (!window.map || !window.polygonsLayer) return;
    if (window.polygonsVisible) {
        window.map.removeLayer(window.polygonsLayer);
        window.polygonsVisible = false;
    } else {
        window.polygonsLayer.addTo(window.map);
        window.polygonsVisible = true;
    }
};

window.toggleColorMode = function () {
    window.colorMode = window.colorMode === 'delay' ? 'otp' : 'delay';
    initPolygonsLayer();
    styleRoutesAndStopsForSelection();
    updateLegend();
};

let legendControl = null;
function addLegend() {
    const Legend = L.Control.extend({
        onAdd: function () {
            const div = L.DomUtil.create('div', 'map-legend');
            div.id = 'map-legend';
            div.style.background = 'rgba(255,255,255,0.9)';
            div.style.padding = '8px 10px';
            div.style.borderRadius = '6px';
            div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
            updateLegendContent(div);
            return div;
        },
    });
    legendControl = new Legend({ position: 'bottomleft' });
    window.map.addControl(legendControl);
}

function updateLegend() {
    const div = document.getElementById('map-legend');
    if (div) updateLegendContent(div);
}

function updateLegendContent(div) {
    if (!div) return;
    const isOtp = window.colorMode === 'otp';
    const title = isOtp ? 'On-Time Performance' : 'Mean Delay';
    const bins = buildLegendBins(isOtp);
    let items = '';
    bins.forEach((b) => {
        items += `
            <div style="display:flex; align-items:center; gap:6px; font-size:0.82rem;">
                <span style="width:10px; height:10px; border-radius:50%; display:inline-block; background:${b.color};"></span>
                <span>${b.label}</span>
            </div>
        `;
    });
    div.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">${title}</div>
        ${items || '<div style="font-size:0.82rem;">No data</div>'}
    `;
}

function buildLegendBins(isOtp) {
    const minVal = isOtp ? window.polygonOtpMin : window.polygonMinMean;
    const maxVal = isOtp ? window.polygonOtpMax : window.polygonMaxMean;
    if (minVal == null || maxVal == null) return [];
    const bins = [];
    const steps = 6;
    const span = maxVal - minVal || 1;
    for (let i = 0; i < steps; i++) {
        const start = minVal + (span * i) / steps;
        const end = minVal + (span * (i + 1)) / steps;
        const t = (i + 0.5) / steps;
        const color = isOtp ? bluesGradient(t) : redsGradient(t);
        const label = `${formatLegendVal(start, isOtp)} - ${formatLegendVal(end, isOtp)}`;
        bins.push({ color, label });
    }
    return bins;
}

function formatLegendVal(val, isOtp) {
    return isOtp ? val.toFixed(1) : `${val.toFixed(1)} s`;
}

function redsGradient(t) {
    const c1 = [255, 245, 235];
    const c2 = [203, 24, 29];
    const r = Math.round(c1[0] + t * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + t * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + t * (c2[2] - c1[2]));
    return `rgb(${r},${g},${b})`;
}

function bluesGradient(t) {
    const c1 = [239, 243, 255];
    const c2 = [8, 81, 156];
    const r = Math.round(c1[0] + t * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + t * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + t * (c2[2] - c1[2]));
    return `rgb(${r},${g},${b})`;
}
