'use client';

import React, { useEffect, useRef } from 'react';

export default function BusMap({
  buses = [],
  selectedBus = null,
  onSelectBus = () => {},
  routePoints = [],
  stops = [],
  activeStopIndex = 0
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const busMarkersRef = useRef(new Map());
  const routePolylineRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const lastCenteredBusIdRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = require('leaflet');

    if (!mapInstanceRef.current && mapRef.current) {
      // Default center: Udaipur
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([24.5854, 73.7125], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Route Polyline & Stops
  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return;
    const L = require('leaflet');
    const map = mapInstanceRef.current;

    // Remove existing polyline
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    // Remove existing stop markers
    stopMarkersRef.current.forEach(m => map.removeLayer(m));
    stopMarkersRef.current = [];

    // Add polyline if route points exist
    const validPoints = (routePoints || []).filter(p => p && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (validPoints.length > 1) {
      const polyline = L.polyline(validPoints, {
        color: '#0048d4',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: null
      }).addTo(map);
      routePolylineRef.current = polyline;

      // Fit bounds only if no bus has been centered yet
      if (!selectedBus && !lastCenteredBusIdRef.current) {
        map.fitBounds(polyline.getBounds(), { padding: [30, 30], maxZoom: 15 });
      }
    }

    // Add stop markers
    stops.forEach((stop, index) => {
      if (!stop.coordinates) return;
      const isPast = index < activeStopIndex;
      const isCurrent = index === activeStopIndex;
      const color = isCurrent ? '#006b5b' : isPast ? '#737687' : '#0048d4';

      const stopIcon = L.divIcon({
        className: 'custom-stop-marker',
        html: `
          <div style="
            width: ${isCurrent ? '16px' : '10px'};
            height: ${isCurrent ? '16px' : '10px'};
            background-color: ${color};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            ${isCurrent ? 'box-shadow: 0 0 0 4px rgba(0,107,91,0.3);' : ''}
          "></div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([stop.coordinates[0], stop.coordinates[1]], { icon: stopIcon })
        .bindPopup(`<b>${stop.english || stop.name}</b><br><span style="font-size:11px;color:#666">${stop.name || ''}</span>`)
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });

  }, [routePoints, stops, activeStopIndex]);

  // Update Buses on Map
  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return;
    const L = require('leaflet');
    const map = mapInstanceRef.current;
    const currentMarkerMap = busMarkersRef.current;

    const seenIds = new Set();

    buses.forEach(bus => {
      if (!bus.lat || !bus.lng) return;
      seenIds.add(bus.id);

      const isSelected = selectedBus && selectedBus.id === bus.id;
      const isMoving = bus.speed && bus.speed >= 2;
      const agencyColor = bus.agency === 'PM e-Bus' ? '#006b5b' : '#0048d4';
      const labelText = bus.routeCode ? `${bus.routeCode} • ${bus.plateFormatted || bus.id}` : (bus.plateFormatted || bus.id);

      const busIconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
          ${isMoving ? `
            <div class="absolute -inset-2 rounded-full animate-ping-slow opacity-60" style="background-color: ${agencyColor}"></div>
          ` : ''}
          <div style="
            background-color: ${isSelected ? '#b0071c' : agencyColor};
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 3px 8px rgba(0,0,0,0.35);
            border: 2px solid white;
            white-space: nowrap;
          ">
            <span class="material-symbols-outlined" style="font-size: 14px;">directions_bus</span>
            <span>${labelText}</span>
            ${bus.speed != null ? `<span style="font-size: 9px; opacity: 0.9; margin-left: 2px; background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 6px;">${Math.round(bus.speed)}km/h</span>` : ''}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-bus-marker',
        html: busIconHtml,
        iconSize: [120, 28],
        iconAnchor: [60, 14]
      });

      if (currentMarkerMap.has(bus.id)) {
        const marker = currentMarkerMap.get(bus.id);
        marker.setLatLng([bus.lat, bus.lng]);
        marker.setIcon(customIcon);
        // Update click listener to current bus object
        marker.off('click');
        marker.on('click', () => {
          lastCenteredBusIdRef.current = bus.id;
          map.setView([bus.lat, bus.lng], 15, { animate: true });
          onSelectBus(bus);
        });
      } else {
        const marker = L.marker([bus.lat, bus.lng], { icon: customIcon })
          .on('click', () => {
            lastCenteredBusIdRef.current = bus.id;
            map.setView([bus.lat, bus.lng], 15, { animate: true });
            onSelectBus(bus);
          })
          .bindPopup(`<b>${bus.plateFormatted || bus.id}</b><br><span>${bus.routeTitle || 'PM e-Bus Udaipur'}</span><br><span style="font-size:11px;color:#006b5b;font-weight:bold">${Math.round(bus.speed || 0)} km/h</span>`)
          .addTo(map);
        currentMarkerMap.set(bus.id, marker);
      }
    });

    // Clean up old markers
    for (const [id, marker] of currentMarkerMap.entries()) {
      if (!seenIds.has(id)) {
        map.removeLayer(marker);
        currentMarkerMap.delete(id);
      }
    }

    // Center on selected bus ONLY when selectedBus ID changes (do NOT jump every 15s polling!)
    if (selectedBus && selectedBus.lat && selectedBus.lng) {
      if (lastCenteredBusIdRef.current !== selectedBus.id) {
        lastCenteredBusIdRef.current = selectedBus.id;
        map.setView([selectedBus.lat, selectedBus.lng], 15, { animate: true });
      }
    }
  }, [buses, selectedBus, onSelectBus]);

  const handleCenterSelectedBus = () => {
    if (mapInstanceRef.current && selectedBus && selectedBus.lat && selectedBus.lng) {
      mapInstanceRef.current.setView([selectedBus.lat, selectedBus.lng], 16, { animate: true });
    }
  };

  return (
    <div className="relative w-full h-[260px] md:h-[320px] bg-surface-container rounded-2xl overflow-hidden shadow-inner border border-outline-variant/30">
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute top-2.5 left-2.5 z-[400] flex items-center gap-1.5 bg-surface/90 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm text-xs font-bold text-on-surface border border-outline-variant/30">
        <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
        <span>Live Map • उदयपुर</span>
      </div>

      {selectedBus && (
        <button
          type="button"
          onClick={handleCenterSelectedBus}
          className="absolute bottom-3 right-3 z-[400] p-2 rounded-xl bg-surface/95 backdrop-blur-md border border-outline-variant/40 text-primary shadow-md flex items-center gap-1 text-xs font-bold active:scale-95 hover:bg-primary hover:text-on-primary transition-all"
          title="Center on tracked bus"
        >
          <span className="material-symbols-outlined text-[18px]">my_location</span>
          <span>बस देखें</span>
        </button>
      )}
    </div>
  );
}
