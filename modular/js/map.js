window.initMap = function () {
    window.map = L.map('map').setView(window.SF_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(window.map);

    window.polygonsLayer = L.layerGroup().addTo(window.map);
    window.routesLayerGroup = L.layerGroup().addTo(window.map);
    window.stopsLayerGroup = L.layerGroup().addTo(window.map);
};

window.loadMetadata = async function () {
    setOverlayMessage('Loading metadata...');
    try {
        const [stopLoc, routesMeta, stopsMeta, polys, polyStops, spatial] = await Promise.all([
            safeFetchJson(window.STOP_LOCATION_URL),
            safeFetchJson(window.ROUTES_METADATA_URL),
            safeFetchJson(window.STOPS_METADATA_URL),
            safeFetchJson(window.POLYGONS_URL),
            safeFetchJson(window.POLYGON_STOP_MAPPING_URL),
            safeFetchJson(window.SPATIAL_DELAY_URL),
        ]);

        if (!stopLoc || !routesMeta || !stopsMeta || !polys || !polyStops || !spatial) {
            throw new Error('One or more metadata files failed to load');
        }

        window.stopLocations = stopLoc;
        window.routesMetadata = routesMeta;
        window.stopsMetadata = stopsMeta;
        window.polygonsGeoJson = polys;
        window.polygonStopMapping = polyStops;
        window.spatialDelayData = spatial;

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
