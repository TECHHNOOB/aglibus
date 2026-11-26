'use client';

import React, { useEffect, useRef, useState } from 'react';

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getStopLabel(stop, lang) {
  if (!stop) return '';
  if (typeof stop === 'string') return stop;
  return lang === 'hi' ? (stop.name || stop.english || '') : (stop.english || stop.name || '');
}

export default function JourneyMap({
  plan = null,
  from = null,
  to = null,
  nearbyHubs = [],
  lang = 'en',
  pickMode = false,
  pickedCoords = null,
  onPickLocation = null,
  onUseNearbyStop = null,
  heightClass = 'h-[280px] sm:h-[320px]',
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);
  const [osrmLoading, setOsrmLoading] = useState(false);

  // Initialize Leaflet OpenStreetMap once
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;
    const L = require('leaflet');

    if (!mapInstanceRef.current) {
      const center = from?.coordinates || pickedCoords || [24.5854, 73.7125];
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(center, 13);

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

  // Handle interactive map click in pickMode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e) => {
      if (pickMode && typeof onPickLocation === 'function') {
        onPickLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [pickMode, onPickLocation]);

  // Render markers, access/egress paths, bus legs & OSRM street snapping
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || typeof window === 'undefined') return;
    const L = require('leaflet');
    let cancelled = false;

    const clearLayers = () => {
      layersRef.current.forEach(layer => {
        try {
          map.removeLayer(layer);
        } catch {}
      });
      layersRef.current = [];
    };

    clearLayers();

    const boundsPts = [];
    const addLayer = (layer) => {
      if (cancelled) return layer;
      layer.addTo(map);
      layersRef.current.push(layer);
      return layer;
    };

    // Pin factory
    const makePin = (color, label, badgeBg = color) =>
      L.divIcon({
        className: 'journey-pin',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
            <div style="
              background:${badgeBg};
              color:#fff;
              padding:3px 7px;
              border-radius:10px;
              font-size:10.5px;
              font-weight:800;
              white-space:nowrap;
              border:2px solid #fff;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);
            ">${escHtml(label)}</div>
            <div style="width:3px;height:6px;background:${badgeBg};"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:${badgeBg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

    // Pick-on-map pin + nearby stops preview
    if (pickMode) {
      if (pickedCoords && pickedCoords.length === 2) {
        boundsPts.push(pickedCoords);
        addLayer(
          L.marker(pickedCoords, {
            icon: makePin('#006b5b', lang === 'hi' ? 'चयनित स्थान' : 'Selected Point'),
          }).bindPopup(`<b>${lang === 'hi' ? 'चयनित स्थान' : 'Selected Location'}</b>`)
        );
      }

      (nearbyHubs || []).forEach((hub, idx) => {
        if (!hub.coordinates) return;
        boundsPts.push(hub.coordinates);
        const icon = L.divIcon({
          className: 'hub-stop-pin',
          html: `
            <div style="
              background:${idx === 0 ? '#0048d4' : '#ffffff'};
              color:${idx === 0 ? '#ffffff' : '#0048d4'};
              border:2px solid #0048d4;
              border-radius:999px;
              width:22px;height:22px;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:900;
              box-shadow:0 2px 6px rgba(0,0,0,0.28);
            ">B</div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const routeCodes = (hub.routes || []).slice(0, 4).map(r => r.code).join(', ');
        addLayer(
          L.marker(hub.coordinates, { icon }).bindPopup(
            `<b>${escHtml(getStopLabel(hub, lang))}</b><br>` +
            `<span style="font-size:11px;color:#006b5b;font-weight:700">${hub.distanceMeters}m • ~${hub.walkMinutes} min walk</span>` +
            (routeCodes ? `<br><span style="font-size:10.5px;color:#444">Buses: ${escHtml(routeCodes)}</span>` : '')
          )
        );
      });

      if (boundsPts.length >= 2) {
        map.fitBounds(L.latLngBounds(boundsPts), { padding: [36, 36], maxZoom: 15 });
      } else if (boundsPts.length === 1) {
        map.setView(boundsPts[0], 15);
      }
      return () => {
        cancelled = true;
      };
    }

    // Standard Journey Visualization Mode
    const accessSeg = plan?.accessSegment || null;
    const egressSeg = plan?.egressSegment || null;
    const legs = plan?.legs || [];

    // Origin Pin
    if (from?.coordinates) {
      boundsPts.push(from.coordinates);
      addLayer(
        L.marker(from.coordinates, {
          icon: makePin('#006b5b', lang === 'hi' ? `शुरू: ${getStopLabel(from, lang).slice(0, 18)}` : `Start: ${getStopLabel(from, lang).slice(0, 18)}`),
        }).bindPopup(`<b>${escHtml(getStopLabel(from, lang))}</b><br><span style="font-size:11px">${lang === 'hi' ? 'यात्रा प्रारंभ' : 'Trip Origin'}</span>`)
      );
    }

    // Destination Pin
    if (to?.coordinates) {
      boundsPts.push(to.coordinates);
      addLayer(
        L.marker(to.coordinates, {
          icon: makePin('#b0071c', lang === 'hi' ? `गंतव्य: ${getStopLabel(to, lang).slice(0, 18)}` : `End: ${getStopLabel(to, lang).slice(0, 18)}`),
        }).bindPopup(`<b>${escHtml(getStopLabel(to, lang))}</b><br><span style="font-size:11px">${lang === 'hi' ? 'गंतव्य स्थान' : 'Destination'}</span>`)
      );
    }

    // Access Segment placeholder polyline (Origin -> Nearby Boarding Stop)
    let accessPolyline = null;
    if (accessSeg?.from?.coordinates && accessSeg?.toStop?.coordinates) {
      const aPts = [accessSeg.from.coordinates, accessSeg.toStop.coordinates];
      boundsPts.push(...aPts);
      accessPolyline = addLayer(
        L.polyline(aPts, {
          color: '#d97706',
          weight: 5,
          opacity: 0.9,
          dashArray: '8, 8',
          lineCap: 'round',
        })
      );

      // Boarding stop badge pin
      addLayer(
        L.marker(accessSeg.toStop.coordinates, {
          icon: makePin('#d97706', lang === 'hi' ? `यहाँ से बस: ${getStopLabel(accessSeg.toStop, lang).slice(0, 18)}` : `Board: ${getStopLabel(accessSeg.toStop, lang).slice(0, 18)}`),
        }).bindPopup(
          `<b>${escHtml(getStopLabel(accessSeg.toStop, lang))}</b><br>` +
          `<span style="font-size:11px;color:#b45309;font-weight:700">${accessSeg.distanceMeters}m • ${accessSeg.mode === 'auto' ? `~${accessSeg.autoMinutes}m Auto` : `~${accessSeg.walkMinutes}m Walk`}</span>`
        )
      );
    }

    // Bus Legs
    const legPolylines = [];
    const legColors = ['#0048d4', '#7c3aed'];
    legs.forEach((leg, lIdx) => {
      const color = legColors[lIdx % legColors.length];
      const basePts = (leg.pathCoords && leg.pathCoords.length >= 2)
        ? leg.pathCoords
        : (leg.stopSequence || []).map(s => s.coordinates).filter(Boolean);

      if (basePts.length >= 2) {
        boundsPts.push(...basePts);
        const line = addLayer(
          L.polyline(basePts, {
            color,
            weight: 5,
            opacity: 0.88,
            lineCap: 'round',
            lineJoin: 'round',
          })
        );
        legPolylines.push({ line, basePts, idx: lIdx });
      }

      // Draw intermediate & endpoint stops for this leg
      (leg.stopSequence || []).forEach((st, sIdx) => {
        if (!st.coordinates) return;
        const isFirst = sIdx === 0;
        const isLast = sIdx === leg.stopSequence.length - 1;
        const stopDot = L.divIcon({
          className: 'bus-leg-stop',
          html: `<div style="width:${isFirst || isLast ? '12px' : '8px'};height:${isFirst || isLast ? '12px' : '8px'};background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        addLayer(
          L.marker(st.coordinates, { icon: stopDot }).bindPopup(
            `<b>${escHtml(getStopLabel(st, lang))}</b><br><span style="font-size:10.5px;color:#444">${escHtml(leg.routeCode || '')}</span>`
          )
        );
      });

      // Transfer interchange badge between legs
      if (legs.length > 1 && lIdx === 0 && leg.toStop?.coordinates) {
        addLayer(
          L.marker(leg.toStop.coordinates, {
            icon: makePin('#7c3aed', lang === 'hi' ? `बस बदलें: ${getStopLabel(leg.toStop, lang).slice(0, 16)}` : `Transfer: ${getStopLabel(leg.toStop, lang).slice(0, 16)}`),
          }).bindPopup(`<b>${escHtml(getStopLabel(leg.toStop, lang))}</b><br><span style="font-size:11px;color:#6d28d9;font-weight:700">${escHtml(legs[0].routeCode)} ➔ ${escHtml(legs[1].routeCode)}</span>`)
        );
      }
    });

    // Egress Segment placeholder (Final Stop -> Destination Place)
    let egressPolyline = null;
    if (egressSeg?.fromStop?.coordinates && egressSeg?.to?.coordinates) {
      const ePts = [egressSeg.fromStop.coordinates, egressSeg.to.coordinates];
      boundsPts.push(...ePts);
      egressPolyline = addLayer(
        L.polyline(ePts, {
          color: '#d97706',
          weight: 5,
          opacity: 0.9,
          dashArray: '8, 8',
          lineCap: 'round',
        })
      );
    }

    // Live upcoming bus markers on leg 0
    const liveBuses = legs[0]?.upcomingBuses || [];
    liveBuses.slice(0, 2).forEach(bus => {
      if (!bus.lat || !bus.lng) return;
      boundsPts.push([bus.lat, bus.lng]);
      const busIcon = L.divIcon({
        className: 'journey-live-bus',
        html: `
          <div style="
            background:#006b5b;color:#fff;padding:3px 7px;border-radius:10px;
            font-size:10px;font-weight:900;border:2px solid #fff;white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,0.4);
          ">🚌 ${escHtml(bus.plate)} • ~${bus.etaMinutes}m</div>
        `,
        iconSize: [110, 24],
        iconAnchor: [55, 12],
      });
      addLayer(
        L.marker([bus.lat, bus.lng], { icon: busIcon }).bindPopup(
          `<b>${escHtml(bus.plate)}</b><br><span style="color:#006b5b;font-weight:700">${bus.speed} km/h • ~${bus.etaMinutes} min ETA</span>`
        )
      );
    });

    // Show other nearby boarding stops around origin if not on exact direct path
    if (nearbyHubs && nearbyHubs.length > 0 && (!plan || plan.viaNearbyStop || plan.planKind !== 'direct')) {
      const usedBoardId = accessSeg?.toStop?.id || legs[0]?.fromStop?.id;
      nearbyHubs.slice(0, 4).forEach(hub => {
        if (!hub.coordinates || hub.id === usedBoardId) return;
        const icon = L.divIcon({
          className: 'alt-nearby-stop',
          html: `<div style="background:#fff;color:#0048d4;border:2px solid #0048d4;border-radius:999px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:900;box-shadow:0 1px 4px rgba(0,0,0,0.3);">B</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const routeList = (hub.routes || []).slice(0, 4).map(r => r.code).join(', ');
        const marker = addLayer(
          L.marker(hub.coordinates, { icon }).bindPopup(
            `<b>${escHtml(getStopLabel(hub, lang))}</b><br>` +
            `<span style="font-size:11px;color:#006b5b">${hub.distanceMeters}m (~${hub.walkMinutes}m walk)</span>` +
            (routeList ? `<br><span style="font-size:10px;color:#555">Routes: ${escHtml(routeList)}</span>` : '')
          )
        );
        if (typeof onUseNearbyStop === 'function') {
          marker.on('dblclick', () => onUseNearbyStop(hub));
        }
      });
    }

    if (boundsPts.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPts), { padding: [42, 42], maxZoom: 15 });
    } else if (boundsPts.length === 1) {
      map.setView(boundsPts[0], 14);
    }

    // Async OSRM enhancement: snap walk/auto & bus segments onto real Udaipur streets!
    const enrichStreetGeometry = async () => {
      const tasks = [];
      if (accessPolyline && accessSeg?.from?.coordinates && accessSeg?.toStop?.coordinates) {
        tasks.push(
          fetch('/api/osm-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile: accessSeg.mode === 'auto' ? 'driving' : 'foot',
              points: [accessSeg.from.coordinates, accessSeg.toStop.coordinates],
            }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
              if (!cancelled && data?.coords?.length >= 2) {
                accessPolyline.setLatLngs(data.coords);
              }
            })
            .catch(() => {})
        );
      }

      if (egressPolyline && egressSeg?.fromStop?.coordinates && egressSeg?.to?.coordinates) {
        tasks.push(
          fetch('/api/osm-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile: egressSeg.mode === 'auto' ? 'driving' : 'foot',
              points: [egressSeg.fromStop.coordinates, egressSeg.to.coordinates],
            }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
              if (!cancelled && data?.coords?.length >= 2) {
                egressPolyline.setLatLngs(data.coords);
              }
            })
            .catch(() => {})
        );
      }

      for (const lp of legPolylines) {
        tasks.push(
          fetch('/api/osm-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: 'driving', points: lp.basePts }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
              if (!cancelled && data?.coords?.length >= 2) {
                lp.line.setLatLngs(data.coords);
              }
            })
            .catch(() => {})
        );
      }

      if (tasks.length > 0) {
        setOsrmLoading(true);
        await Promise.all(tasks);
        if (!cancelled) setOsrmLoading(false);
      }
    };

    enrichStreetGeometry();

    return () => {
      cancelled = true;
    };
  }, [plan, from, to, nearbyHubs, lang, pickMode, pickedCoords, onUseNearbyStop]);

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
      <div className={`relative w-full ${heightClass} bg-surface-container`}>
        <div ref={mapRef} className={`w-full h-full ${pickMode ? 'cursor-crosshair' : ''}`} />
        <div className="absolute top-2.5 left-2.5 z-[400] flex items-center gap-1.5 bg-surface/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm text-[11px] font-extrabold text-on-surface border border-outline-variant/30">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span>{pickMode ? (lang === 'hi' ? 'मैप पर लोकेशन टैप करें • उदयपुर' : 'Tap anywhere on Udaipur Map') : (lang === 'hi' ? 'मुफ़्त उदयपुर रूट मैप' : 'Free Udaipur Route Map')}</span>
          {osrmLoading && (
            <span className="text-[10px] text-primary font-semibold ml-1">• Syncing streets...</span>
          )}
        </div>
      </div>

      {/* Compact Legend Bar */}
      {!pickMode && (
        <div className="px-3 py-2 bg-surface-container-low border-t border-outline-variant/25 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-bold text-on-surface-variant">
          {plan?.accessSegment && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <span className="w-4 border-t-2 border-dashed border-amber-600 inline-block" />
              <span>{lang === 'hi' ? 'पैदल / ऑटो रास्ता' : 'Walk / Auto to Stop'}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5 text-primary">
            <span className="w-4 h-1 rounded bg-[#0048d4] inline-block" />
            <span>{plan?.legs?.[0]?.routeCode || 'Bus 1'}</span>
          </span>
          {plan?.legs?.[1] && (
            <span className="flex items-center gap-1.5 text-purple-700">
              <span className="w-4 h-1 rounded bg-[#7c3aed] inline-block" />
              <span>{plan.legs[1].routeCode || 'Bus 2'}</span>
            </span>
          )}
          {nearbyHubs?.length > 0 && (
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="w-3.5 h-3.5 rounded-full border border-[#0048d4] text-[#0048d4] bg-white inline-flex items-center justify-center text-[8px] font-black">B</span>
              <span>{lang === 'hi' ? 'पास के बस स्टॉप' : 'Nearby Stops'}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
