// Shared constants and global state
window.cityConfig = {
    atlanta: { label: 'Atlanta', center: [33.749, -84.388], zoom: 12 },
    auburn: { label: 'Auburn', center: [32.6099, -85.4808], zoom: 12 },
    austin: { label: 'Austin', center: [30.2672, -97.7431], zoom: 12 },
    boston: { label: 'Boston', center: [42.3601, -71.0589], zoom: 12 },
    chicago: { label: 'Chicago', center: [41.8781, -87.6298], zoom: 12 },
    columbus: { label: 'Columbus', center: [39.9612, -82.9988], zoom: 12 },
    houston: { label: 'Houston', center: [29.7604, -95.3698], zoom: 12 },
    los_angeles: { label: 'Los Angeles', center: [34.023457, -118.248732], zoom: 12 },
    miami: { label: 'Miami', center: [25.7617, -80.1918], zoom: 12 },
    new_york_city: { label: 'New York', center: [40.7128, -74.006], zoom: 12 },
    philadelphia: { label: 'Philadelphia', center: [39.9526, -75.1652], zoom: 12 },
    portland: { label: 'Portland', center: [45.510106, -122.680744], zoom: 12 },
    salt_lake_city: { label: 'Salt Lake City', center: [40.7608, -111.891], zoom: 12 },
    san_francisco: { label: 'San Francisco', center: [37.7749, -122.4194], zoom: 12 },
    toronto: { label: 'Toronto', center: [43.6532, -79.3832], zoom: 12 },
    vancouver: { label: 'Vancouver', center: [49.2827, -123.1207], zoom: 12 }
};

window.currentCity = 'san_francisco';
window.BASE_META_URL = `https://raw.githubusercontent.com/eco-trans/GTFS-UI/refs/heads/master/meta/${window.currentCity}`;

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
    window.BASE_META_URL = `https://raw.githubusercontent.com/eco-trans/GTFS-UI/refs/heads/master/meta/${window.currentCity}`;
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
