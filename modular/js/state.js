// Shared constants and global state
window.BASE_META_URL = "https://raw.githubusercontent.com/eco-trans/GTFS-UI/refs/heads/main/meta/san_francisco";
window.STOP_LOCATION_URL = `${BASE_META_URL}/stop_location.json`;
window.ROUTES_METADATA_URL = `${BASE_META_URL}/routes_metadata.json`;
window.STOPS_METADATA_URL = `${BASE_META_URL}/stops_metadata.json`;
window.POLYGONS_URL = `${BASE_META_URL}/polygons.geojson`;
window.POLYGON_STOP_MAPPING_URL = `${BASE_META_URL}/polygon_stop_mapping.json`;
window.SPATIAL_DELAY_URL = `${BASE_META_URL}/spatial_delay_data.json`;
window.STOP_ROUTE_MAPPING_BASE = `${BASE_META_URL}/stop_route_mapping`;
window.ROUTE_EDGES_BASE = `${BASE_META_URL}/route_edges`;
window.ROUTE_DIR_STOP_DELAY_BASE = `${BASE_META_URL}/route_direction_stop_delay`;
window.SF_CENTER = [37.758458, -122.435435];

window.map = null;
window.polygonsLayer = null;
window.routesLayerGroup = null;
window.stopsLayerGroup = null;

window.stopLocations = {};
window.routesMetadata = {};
window.stopsMetadata = {};
window.polygonsGeoJson = null;
window.polygonStopMapping = {};
window.spatialDelayData = {};

window.polygonMeanDelays = {};
window.polygonMinMean = null;
window.polygonMaxMean = null;

window.stopRouteMappingCache = {};
window.routeEdgesCache = {};

window.routeLayerIndex = {};
window.routeArrowIndex = {};
window.stopMarkerIndex = {};

window.selectedPolygonGid = null;
window.selectedRouteId = null;
window.selectedStopId = null;

window.hourlyCharts = { 0: null, 1: null };
window.dailyCharts = { 0: null, 1: null };
window.polygonHistogramChart = null;

window.metaLoaded = false;
