import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Clock, TrendingUp, AlertCircle } from 'lucide-react';

// Sample station data
const stations = [
  { id: 1, name: 'Central Station', x: 30, y: 40, lat: 40.7128, lon: -74.0060 },
  { id: 2, name: 'North Terminal', x: 45, y: 20, lat: 40.7580, lon: -73.9855 },
  { id: 3, name: 'South Junction', x: 25, y: 65, lat: 40.6782, lon: -73.9442 },
  { id: 4, name: 'East Plaza', x: 70, y: 45, lat: 40.7489, lon: -73.9680 },
  { id: 5, name: 'West Hub', x: 15, y: 50, lat: 40.7614, lon: -73.9776 },
  { id: 6, name: 'Airport Link', x: 80, y: 25, lat: 40.7769, lon: -73.8740 },
  { id: 7, name: 'Downtown', x: 40, y: 55, lat: 40.7061, lon: -74.0087 },
  { id: 8, name: 'University', x: 60, y: 70, lat: 40.7295, lon: -73.9965 },
];

// Generate sample delay data
const generateDelayData = (stationId) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(day => ({
    day,
    avg: Math.floor(Math.random() * 15) + 5,
    min: Math.floor(Math.random() * 5),
    max: Math.floor(Math.random() * 20) + 15,
  }));
};

const generateHourlyData = (stationId) => {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    delay: Math.floor(Math.random() * 20) + 2,
  }));
};

const generatePeakData = (stationId) => {
  const periods = ['Morning Rush', 'Midday', 'Evening Rush', 'Night'];
  return periods.map(period => ({
    period,
    avgDelay: Math.floor(Math.random() * 15) + 5,
    incidents: Math.floor(Math.random() * 10) + 1,
  }));
};

const TransitMap = ({ stations, selectedStation, onStationClick }) => {
  return (
    <div className="relative w-full h-full bg-slate-800 rounded-lg overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Transit lines */}
      <svg className="absolute inset-0 w-full h-full">
        <line x1="30%" y1="40%" x2="45%" y2="20%" stroke="#3b82f6" strokeWidth="3" opacity="0.6" />
        <line x1="30%" y1="40%" x2="25%" y2="65%" stroke="#3b82f6" strokeWidth="3" opacity="0.6" />
        <line x1="45%" y1="20%" x2="70%" y2="45%" stroke="#10b981" strokeWidth="3" opacity="0.6" />
        <line x1="70%" y1="45%" x2="40%" y2="55%" stroke="#10b981" strokeWidth="3" opacity="0.6" />
        <line x1="25%" y1="65%" x2="60%" y2="70%" stroke="#f59e0b" strokeWidth="3" opacity="0.6" />
        <line x1="15%" y1="50%" x2="30%" y2="40%" stroke="#ef4444" strokeWidth="3" opacity="0.6" />
        <line x1="80%" y1="25%" x2="45%" y2="20%" stroke="#8b5cf6" strokeWidth="3" opacity="0.6" />
      </svg>

      {/* Stations */}
      {stations.map(station => (
        <button
          key={station.id}
          onClick={() => onStationClick(station)}
          className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
            selectedStation?.id === station.id
              ? 'scale-150 z-20'
              : 'hover:scale-125 z-10'
          }`}
          style={{ left: `${station.x}%`, top: `${station.y}%` }}
        >
          <div className={`relative ${selectedStation?.id === station.id ? 'animate-pulse' : ''}`}>
            <div className={`w-4 h-4 rounded-full border-3 ${
              selectedStation?.id === station.id
                ? 'bg-blue-400 border-white shadow-lg shadow-blue-400/50'
                : 'bg-white border-slate-700'
            }`} />
            {selectedStation?.id === station.id && (
              <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75" />
            )}
          </div>
          <div className={`absolute left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap text-xs font-medium px-2 py-1 rounded ${
            selectedStation?.id === station.id
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-slate-200'
          }`}>
            {station.name}
          </div>
        </button>
      ))}

      {/* Map label */}
      <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-lg">
        <div className="text-slate-200 font-semibold">Transit Network Map</div>
        <div className="text-slate-400 text-sm">Click on any station for details</div>
      </div>
    </div>
  );
};

const DelayPanel = ({ station }) => {
  const [activeTab, setActiveTab] = useState('delays');
  
  const delayData = generateDelayData(station.id);
  const hourlyData = generateHourlyData(station.id);
  const peakData = generatePeakData(station.id);

  const tabs = [
    { id: 'delays', label: 'Delays', icon: Clock },
    { id: 'accessibility', label: 'Accessibility', icon: TrendingUp },
    { id: 'reliability', label: 'Reliability', icon: AlertCircle },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <h2 className="text-2xl font-bold mb-1">{station.name}</h2>
        <p className="text-blue-100 text-sm">
          Coordinates: {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon size={18} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'delays' && (
          <div className="space-y-6">
            {/* Chart 1: Daily Delays with Min/Max Bounds */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Weekly Delay Analysis
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={delayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" />
                  <YAxis stroke="#64748b" label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="max" stackId="1" stroke="#ef4444" fill="#fee2e2" name="Max Delay" />
                  <Area type="monotone" dataKey="avg" stackId="2" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Avg Delay" />
                  <Area type="monotone" dataKey="min" stackId="3" stroke="#10b981" fill="#d1fae5" name="Min Delay" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Hourly Delay Pattern */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                24-Hour Delay Pattern
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" stroke="#64748b" interval={2} />
                  <YAxis stroke="#64748b" label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="delay" 
                    stroke="#8b5cf6" 
                    strokeWidth={3}
                    dot={{ fill: '#8b5cf6', r: 4 }}
                    name="Delay (min)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Peak Period Analysis */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Peak Period Comparison
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={peakData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" />
                  <YAxis yAxisId="left" stroke="#64748b" label={{ value: 'Avg Delay (min)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" label={{ value: 'Incidents', angle: 90, position: 'insideRight' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="avgDelay" 
                    stroke="#f59e0b" 
                    strokeWidth={3}
                    dot={{ fill: '#f59e0b', r: 5 }}
                    name="Avg Delay"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="incidents" 
                    stroke="#ec4899" 
                    strokeWidth={3}
                    dot={{ fill: '#ec4899', r: 5 }}
                    name="Incidents"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <TrendingUp size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">Accessibility data will be displayed here</p>
          </div>
        )}

        {activeTab === 'reliability' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">Reliability metrics will be displayed here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function GTFSDashboard() {
  const [selectedStation, setSelectedStation] = useState(stations[0]);

  return (
    <div className="h-screen w-screen flex bg-slate-100">
      {/* Left Panel - Map */}
      <div className="w-1/2 p-4">
        <TransitMap 
          stations={stations} 
          selectedStation={selectedStation}
          onStationClick={setSelectedStation}
        />
      </div>

      {/* Right Panel - Data */}
      <div className="w-1/2">
        {selectedStation ? (
          <DelayPanel station={selectedStation} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a station to view details
          </div>
        )}
      </div>
    </div>
  );
}