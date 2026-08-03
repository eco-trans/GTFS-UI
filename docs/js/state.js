// Shared constants and global state
window.cityConfig = {
    san_francisco: { label: 'San Francisco', center: [37.7749, -122.4194], zoom: 12 },
    atlanta: { label: 'Atlanta', center: [33.749, -84.388], zoom: 12 },
    new_york_city: { label: 'New York', center: [40.7128, -74.006], zoom: 12 },
    salt_lake_city: { label: 'Salt Lake City', center: [40.7608, -111.891], zoom: 12 },
    portland: { label: 'Portland', center: [45.510106, -122.680744], zoom: 12 },
    los_angeles: { label: 'Los Angeles', center: [34.023457, -118.248732], zoom: 12 },

};
window.currentCity = 'san_francisco';
window.BASE_META_URL = `https://raw.githubusercontent.com/eco-trans/GTFS-UI/refs/heads/main/meta/${window.currentCity}`;

window.STOP_LOCATION_URL = `${window.BASE_META_URL}/stop_location.json`;
window.ROUTES_METADATA_URL = `${window.BASE_META_URL}/routes_metadata.json`;
window.STOPS_METADATA_URL = `${window.BASE_META_URL}/stops_metadata.json`;
window.POLYGONS_URL = `${window.BASE_META_URL}/polygons.geojson`;
window.POLYGON_STOP_MAPPING_URL = `${window.BASE_META_URL}/polygon_stop_mapping.json`;
window.SPATIAL_DELAY_URL = `${window.BASE_META_URL}/spatial_delay_data.json`;
window.STOP_ROUTE_MAPPING_BASE = `${window.BASE_META_URL}/stop_route_mapping`;
window.ROUTE_EDGES_BASE = `${window.BASE_META_URL}/route_edges`;
window.ROUTE_DIR_STOP_DELAY_BASE = `${window.BASE_META_URL}/route_direction_stop_delay`;
window.STOP_ROUTE_DELAY_AVG_URL = `${window.BASE_META_URL}/stop_route_delay_avg.json`;
window.STOP_DELAY_AVG_URL = `${window.BASE_META_URL}/stop_delay_avg.json`;
window.STOP_OTP_URL = `${window.BASE_META_URL}/stop_otp.json`;
window.STOP_ROUTE_OTP_URL = `${window.BASE_META_URL}/stop_route_otp.json`;
window.SPATIAL_OTP_URL = `${window.BASE_META_URL}/spatial_otp.json`;

window.map = null;
window.baseLayerColor = null;
window.baseLayerGray = null;
window.currentBaseStyle = 'color';
window.polygonsVisible = true;
window.colorMode = 'delay'; // 'delay' or 'otp'
window.polygonsLayer = null;
window.routesLayerGroup = null;
window.stopsLayerGroup = null;

window.stopLocations = {};
window.routesMetadata = {};
window.stopsMetadata = {};
window.polygonsGeoJson = null;
window.polygonStopMapping = {};
window.spatialDelayData = {};
window.stopRouteDelayAvg = {};
window.stopDelayAvg = {};
window.stopRouteOtp = {};
window.stopOtp = {};
window.spatialOtp = {};
window.polygonOtpMean = {};
window.polygonOtpMin = null;
window.polygonOtpMax = null;

window.polygonMeanDelays = {};
window.polygonMinMean = null;
window.polygonMaxMean = null;

window.stopRouteMappingCache = {};
window.routeEdgesCache = {};

window.routeLayerIndex = {};
window.routeArrowIndex = {};
window.stopMarkerIndex = {};
window.currentRoutesInView = [];

window.selectedPolygonGid = null;
window.selectedRouteId = null;
window.selectedStopId = null;

window.hourlyCharts = { 0: null, 1: null };
window.dailyCharts = { 0: null, 1: null };
window.polygonHistogramChart = null;

window.metaLoaded = false;

window.setCity = function (cityKey) {
    if (!window.cityConfig[cityKey]) return;
    window.currentCity = cityKey;
    window.BASE_META_URL = `https://raw.githubusercontent.com/eco-trans/GTFS-UI/refs/heads/main/meta/${window.currentCity}`;
    window.STOP_LOCATION_URL = `${window.BASE_META_URL}/stop_location.json`;
    window.ROUTES_METADATA_URL = `${window.BASE_META_URL}/routes_metadata.json`;
    window.STOPS_METADATA_URL = `${window.BASE_META_URL}/stops_metadata.json`;
    window.POLYGONS_URL = `${window.BASE_META_URL}/polygons.geojson`;
    window.POLYGON_STOP_MAPPING_URL = `${window.BASE_META_URL}/polygon_stop_mapping.json`;
    window.SPATIAL_DELAY_URL = `${window.BASE_META_URL}/spatial_delay_data.json`;
    window.STOP_ROUTE_MAPPING_BASE = `${window.BASE_META_URL}/stop_route_mapping`;
    window.ROUTE_EDGES_BASE = `${window.BASE_META_URL}/route_edges`;
    window.ROUTE_DIR_STOP_DELAY_BASE = `${window.BASE_META_URL}/route_direction_stop_delay`;
    window.STOP_ROUTE_DELAY_AVG_URL = `${window.BASE_META_URL}/stop_route_delay_avg.json`;
    window.STOP_DELAY_AVG_URL = `${window.BASE_META_URL}/stop_delay_avg.json`;
    window.STOP_OTP_URL = `${window.BASE_META_URL}/stop_otp.json`;
    window.STOP_ROUTE_OTP_URL = `${window.BASE_META_URL}/stop_route_otp.json`;
    window.SPATIAL_OTP_URL = `${window.BASE_META_URL}/spatial_otp.json`;
};
