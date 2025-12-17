window.initMap = function () {
    window.map = L.map('map').setView(window.SF_CENTER, 13);

    window.baseLayerColor = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
    });
    window.baseLayerGray = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors & Carto',
    });
    // window.baseLayerColor.addTo(window.map);
    // window.currentBaseStyle = 'color';

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
};

window.loadMetadata = async function () {
    setOverlayMessage('Loading metadata...');
    try {
        const [stopLoc, routesMeta, stopsMeta, polys, polyStops, spatial, stopRouteDelayAvg] = await Promise.all([
            safeFetchJson(window.STOP_LOCATION_URL),
            safeFetchJson(window.ROUTES_METADATA_URL),
            safeFetchJson(window.STOPS_METADATA_URL),
            safeFetchJson(window.POLYGONS_URL),
            safeFetchJson(window.POLYGON_STOP_MAPPING_URL),
            safeFetchJson(window.SPATIAL_DELAY_URL),
            safeFetchJson(window.STOP_ROUTE_DELAY_AVG_URL),
        ]);

        if (!stopLoc || !routesMeta || !stopsMeta || !polys || !polyStops || !spatial || !stopRouteDelayAvg) {
            throw new Error('One or more metadata files failed to load');
        }

        window.stopLocations = stopLoc;
        window.routesMetadata = routesMeta;
        window.stopsMetadata = stopsMeta;
        window.polygonsGeoJson = polys;
        window.polygonStopMapping = polyStops;
        window.spatialDelayData = spatial;
        window.stopRouteDelayAvg = stopRouteDelayAvg;

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
        window.metaLoaded = true;

        initPolygonsLayer();
        setOverlayMessage('', false);
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
            polyBtn.innerHTML = '⬚';
            polyBtn.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                togglePolygons();
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
