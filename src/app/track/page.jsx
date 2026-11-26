'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';
import { dutyRouteHints, stopLocations, canonicalStop } from '@/lib/network.mjs';

// Dynamically import BusMap with SSR disabled
const BusMap = dynamic(() => import('@/components/BusMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[260px] bg-surface-container-low rounded-2xl animate-pulse flex items-center justify-center text-on-surface-variant font-bold text-sm">
      <span className="material-symbols-outlined text-2xl mr-2 animate-spin">autorenew</span>
      लोड हो रहा है मैप...
    </div>
  )
});

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanRouteId(rId) {
  return String(rId || '').replace(/^PM/i, '').replace(/^R/i, 'U').trim();
}

function LiveTrackerContent() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get('route');
  const busParam = searchParams.get('bus');
  const dirParam = searchParams.get('dir');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const { lang, t, getStopDisplayName, getRouteTitle, formatBusPlate } = useLanguage();

  const [fleetData, setFleetData] = useState({ buses: [], checkedAt: Date.now() });
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(routeParam || '4');
  const [selectedBusId, setSelectedBusId] = useState(busParam || null);
  const [isReverse, setIsReverse] = useState(dirParam === 'reverse');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedSec, setLastUpdatedSec] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);
  const [showMap, setShowMap] = useState(false); // Map hidden by default as requested

  // Fetch static data (routes and stops)
  useEffect(() => {
    async function loadStaticData() {
      try {
        const [routesRes, stopsRes] = await Promise.all([
          fetch('/api/routes'),
          fetch('/api/stops')
        ]);
        if (routesRes.ok) setRoutes(await routesRes.json());
        if (stopsRes.ok) setStops(await stopsRes.json());
      } catch (e) {
        console.error('Failed to load static transit data:', e);
      }
    }
    loadStaticData();
  }, []);

  // Sync state if route or bus URL query params change via navigation
  useEffect(() => {
    if (routeParam && routeParam !== selectedRouteId) {
      setSelectedRouteId(routeParam);
    }
  }, [routeParam]);

  useEffect(() => {
    if (busParam && busParam !== selectedBusId) {
      setSelectedBusId(busParam);
    }
  }, [busParam]);

  // Synchronize direction based on dir query or from/to stop sequence
  useEffect(() => {
    if (dirParam === 'reverse') {
      setIsReverse(true);
      return;
    }
    if (dirParam === 'forward') {
      setIsReverse(false);
      return;
    }
    if (fromParam && toParam && routes.length > 0) {
      const active = routes.find(r => r.id === selectedRouteId || r.code === selectedRouteId);
      if (active && active.stops) {
        const fId = canonicalStop(Number(fromParam));
        const tId = canonicalStop(Number(toParam));
        const fIdx = active.stops.indexOf(fId);
        const tIdx = active.stops.indexOf(tId);
        if (fIdx >= 0 && tIdx >= 0) {
          setIsReverse(fIdx > tIdx);
        }
      }
    }
  }, [dirParam, fromParam, toParam, routes, selectedRouteId]);

  // Currently selected route details
  const activeRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId || r.code === selectedRouteId) || routes[0] || null;
  }, [routes, selectedRouteId]);

  // Directional Title (e.g. Chetak -> Kanpur vs Kanpur -> Chetak)
  const directionalTitle = useMemo(() => {
    if (!activeRoute) return '';
    const fullTitle = lang === 'en' ? (activeRoute.titleEn || activeRoute.title) : activeRoute.title;
    if (!isReverse) return fullTitle;
    const parts = fullTitle.split(/\s*(?:→|➔|↔)\s*/);
    if (parts.length === 2) {
      return `${parts[1]} ➔ ${parts[0]}`;
    }
    return fullTitle;
  }, [activeRoute, isReverse, lang]);

  // Ordered Stops on this route based on travel direction
  const routeStops = useMemo(() => {
    if (!activeRoute || !stops.length) return [];
    const baseStops = activeRoute.stops || [];
    const orderedIds = isReverse ? [...baseStops].reverse() : baseStops;
    return orderedIds.map(id => {
      const match = stops.find(s => s.id === id);
      return match || { id, name: `Stop #${id}`, english: `Stop #${id}`, coordinates: stopLocations[id] || null };
    });
  }, [activeRoute, stops, isReverse]);

  // Filter live buses that genuinely belong to this route (exclude stale & unconfirmed shared_corridor buses)
  const matchingBuses = useMemo(() => {
    const list = fleetData.buses || [];
    if (!selectedRouteId || !activeRoute) return [];

    const curRId = String(activeRoute.id || selectedRouteId);
    const curCode = String(activeRoute.code || selectedRouteId);
    const curClean = cleanRouteId(curRId);
    const targetDir = isReverse ? -1 : 1;

    return list
      .filter(bus => {
        if (bus.live === false || bus.source === 'last') return false;
        const confirmedMatch = bus.matches?.some(m =>
          m.basis !== 'shared_corridor' && (m.routeId === curRId || cleanRouteId(m.routeId) === curClean)
        );
        if (confirmedMatch) return true;
        const bHint = dutyRouteHints[bus.id] ? String(dutyRouteHints[bus.id]) : '';
        if (bHint && (bHint === curRId || bHint === curClean)) return true;
        if (bus.routeId === curRId || bus.routeId === curCode || cleanRouteId(bus.routeId) === curClean) return true;
        if (bus.routeCode && (bus.routeCode === curCode || cleanRouteId(bus.routeCode) === curClean)) return true;
        if (bus.assignment && (bus.assignment === curRId || bus.assignment === curCode || bus.assignment.endsWith(curClean))) return true;
        if (bus.route && (bus.route.includes(curRId) || bus.route.includes(curCode))) return true;
        return false;
      })
      .sort((a, b) => {
        const dirA = a.matches?.find(m => m.routeId === curRId)?.direction || 0;
        const dirB = b.matches?.find(m => m.routeId === curRId)?.direction || 0;
        const scoreA = dirA === targetDir ? 2 : dirA === 0 ? 1 : 0;
        const scoreB = dirB === targetDir ? 2 : dirB === 0 ? 1 : 0;
        return scoreB - scoreA || (b.speed || 0) - (a.speed || 0);
      });
  }, [fleetData, selectedRouteId, activeRoute, isReverse]);

  // Poll Fleet data every 15 seconds
  useEffect(() => {
    let timer;
    async function fetchFleet() {
      try {
        const res = await fetch('/api/fleet');
        if (res.ok) {
          const data = await res.json();
          setFleetData(data);
          setLastUpdatedSec(0);
        }
      } catch (err) {
        console.error('Fleet polling failed:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchFleet();
    timer = setInterval(fetchFleet, 15000);
    return () => clearInterval(timer);
  }, [selectedRouteId]);

  // Keep selected bus valid within matching buses, prioritizing buses moving in the selected direction
  useEffect(() => {
    if (matchingBuses.length === 0) {
      setSelectedBusId(null);
      return;
    }
    // If busParam matches a bus on route, select it
    if (busParam && matchingBuses.some(b => b.id.toLowerCase() === busParam.toLowerCase())) {
      setSelectedBusId(busParam);
      return;
    }
    const targetDir = isReverse ? -1 : 1;
    const curRId = String(activeRoute?.id || selectedRouteId);

    // Otherwise keep current or auto-select bus moving in the user's direction
    setSelectedBusId(prev => {
      if (prev && matchingBuses.some(b => b.id.toLowerCase() === prev.toLowerCase())) {
        return prev;
      }
      const sameDir = matchingBuses.find(b =>
        b.matches?.some(m => m.routeId === curRId && m.direction === targetDir)
      );
      if (sameDir) return sameDir.id;
      const moving = matchingBuses.find(b => b.speed > 0);
      return moving ? moving.id : matchingBuses[0].id;
    });
  }, [matchingBuses, busParam, isReverse, activeRoute, selectedRouteId]);

  // Active bus: strictly from matchingBuses
  const currentBus = useMemo(() => {
    if (!matchingBuses.length) return null;
    if (selectedBusId) {
      const found = matchingBuses.find(b => b.id.toLowerCase() === selectedBusId.toLowerCase());
      if (found) return found;
    }
    return matchingBuses[0] || null;
  }, [selectedBusId, matchingBuses]);

  // Compute active stop index along directional route stops
  const currentStopIndex = useMemo(() => {
    if (!currentBus || !routeStops.length) return 0;

    let bestIdx = 0;
    let minDist = Infinity;

    routeStops.forEach((stop, idx) => {
      const coords = stop.coordinates || stopLocations[stop.id];
      if (coords && coords.length === 2) {
        const d = getDistanceMeters(currentBus.lat, currentBus.lng, coords[0], coords[1]);
        if (d < minDist) {
          minDist = d;
          bestIdx = idx;
        }
      }
    });

    return bestIdx;
  }, [currentBus, routeStops]);

  // Second counter for "updated X sec ago"
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle bus selection (from map click or selector pills)
  const handleSelectBus = (bus) => {
    if (!bus) return;
    setSelectedBusId(bus.id);
    const params = new URLSearchParams(window.location.search);
    params.set('bus', bus.id);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  // Handle route change
  const handleSelectRoute = (newRouteId) => {
    setSelectedRouteId(newRouteId);
    setSelectedBusId(null);
    const params = new URLSearchParams(window.location.search);
    params.set('route', newRouteId);
    params.delete('bus');
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  // Toggle direction (Forward ⇄ Reverse)
  const handleToggleDirection = () => {
    const nextRev = !isReverse;
    setIsReverse(nextRev);
    const params = new URLSearchParams(window.location.search);
    params.set('dir', nextRev ? 'reverse' : 'forward');
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  // Current speed display
  const isMoving = currentBus?.speed && currentBus.speed >= 2;
  const speedDisplay = currentBus?.speed != null ? `${Math.round(currentBus.speed)} km/h` : (lang === 'hi' ? 'खड़ी है' : 'Halt');
  const currentHaltStop = routeStops[currentStopIndex] || routeStops[0] || { name: 'आरंभिक स्टॉप', english: 'Origin Stop' };

  // Calculate dynamic ETA time for each stop based on current bus position & time
  const getStopETA = (index) => {
    const now = new Date();
    const totalRouteMin = activeRoute?.minutes || 35;
    const totalStops = Math.max(1, routeStops.length - 1);
    const avgMinPerStop = Math.max(2, Math.round(totalRouteMin / totalStops));

    const diff = index - currentStopIndex;
    const targetTimestamp = new Date(now.getTime() + diff * avgMinPerStop * 60000);
    const ist = new Date(targetTimestamp.getTime() + 5.5 * 60 * 60 * 1000);

    let h = ist.getUTCHours();
    const m = ist.getUTCMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const timeStr = `${h}:${m} ${ampm}`;
    const etaMinutes = Math.abs(diff * avgMinPerStop);

    return {
      timeStr,
      etaMinutes,
      diff
    };
  };

  const handleShare = () => {
    const busPlate = currentBus?.plateFormatted || formatBusPlate(currentBus?.id) || 'City Bus';
    const text = `Live Tracking Route ${activeRoute?.code || selectedRouteId} (${directionalTitle}) on Udaipur City Bus. Live ETA & Stops: ${window.location.href}`;
    if (navigator.share) {
      navigator.share({ title: 'Udaipur City Bus Live Tracking', text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert(t('shareCopiedMsg'));
    }
  };

  const handleToggleAlarm = () => {
    setAlarmActive(!alarmActive);
    if (!alarmActive) {
      alert(t('alarmSetMsg'));
    }
  };

  return (
    <div className="flex flex-col w-full pb-20">
      {/* Route Selector Header Bar */}
      <section className="bg-primary text-on-primary px-4 py-3 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="px-2.5 py-1 rounded-lg bg-surface-container-lowest text-primary font-extrabold text-[15px] shadow-xs shrink-0">
            {activeRoute?.code || selectedRouteId}
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[15px] font-extrabold text-on-primary truncate tracking-tight">
              {directionalTitle || (lang === 'hi' ? 'बड़गांव ➔ बलिचा' : 'Badgaon ➔ Balicha')}
            </h1>
            <div className="flex items-center gap-2 text-inverse-on-surface text-[11px]">
              <span>{activeRoute?.agency || 'PM e-Bus'}</span>
              <span>•</span>
              <span>{activeRoute?.km || 14} {t('km')}</span>
              <span>•</span>
              <span>{t('everyXMin', { X: activeRoute?.headway || '15-20' })}</span>
            </div>
          </div>
        </div>

        {/* Change Route Dropdown */}
        <select
          value={selectedRouteId}
          onChange={(e) => handleSelectRoute(e.target.value)}
          className="bg-surface-container-lowest/20 hover:bg-surface-container-lowest/30 text-on-primary font-bold text-xs py-1.5 px-2 rounded-lg border border-on-primary/30 focus:outline-none focus:ring-1 focus:ring-white cursor-pointer max-w-[130px] truncate"
        >
          {routes.map(r => (
            <option key={r.id} value={r.id} className="text-on-surface bg-surface">
              {r.code || r.id} - {getRouteTitle(r)}
            </option>
          ))}
        </select>
      </section>

      {/* Direction Switch Bar: Allows commuter to swap direction (Kanpur ➔ Chetak vs Chetak ➔ Kanpur) */}
      <section className="bg-surface-container-low px-4 py-2 border-b border-outline-variant/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0 text-xs font-bold text-on-surface">
          <span className="material-symbols-outlined text-primary text-[17px] shrink-0">navigation</span>
          <span className="text-on-surface-variant font-medium shrink-0">{lang === 'hi' ? 'दिशा:' : 'Towards:'}</span>
          <span className="truncate text-primary font-extrabold">
            {routeStops.length > 0 ? getStopDisplayName(routeStops[routeStops.length - 1]) : directionalTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggleDirection}
          className="px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary hover:text-on-primary text-primary font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs shrink-0"
          title={lang === 'hi' ? 'दिशा बदलें' : 'Switch Direction'}
        >
          <span className="material-symbols-outlined text-[15px]">swap_vert</span>
          <span>{lang === 'hi' ? 'दिशा बदलें' : 'Switch Direction'}</span>
        </button>
      </section>

      {/* Quick Bus Selector Tray: Shows ONLY genuinely active buses on this route */}
      {matchingBuses.length > 0 && (
        <section className="bg-surface-container-low px-4 py-2 border-b border-outline-variant/30 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase shrink-0">
            {lang === 'hi' ? 'मार्ग की बसें:' : 'Route Buses:'}
          </span>
          {matchingBuses.map(bus => {
            const isSelected = currentBus && currentBus.id === bus.id;
            const busPlate = bus.plateFormatted || formatBusPlate(bus.id);
            const busMoving = bus.speed && bus.speed >= 2;
            const targetDir = isReverse ? -1 : 1;
            const curRId = String(activeRoute?.id || selectedRouteId);
            const busMatch = bus.matches?.find(m => m.routeId === curRId);
            const busDir = busMatch?.direction || 0;
            const isSameDir = busDir === targetDir;
            const isOppositeDir = busDir !== 0 && busDir !== targetDir;

            return (
              <button
                key={bus.id}
                type="button"
                onClick={() => handleSelectBus(bus)}
                className={`px-3 py-1 rounded-full text-xs font-extrabold shrink-0 flex items-center gap-1.5 transition-all shadow-2xs ${
                  isSelected
                    ? 'bg-primary text-on-primary shadow-xs ring-2 ring-primary/30'
                    : isOppositeDir
                    ? 'bg-surface-container-lowest/60 text-on-surface-variant border border-outline-variant/30 opacity-75'
                    : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${busMoving ? 'bg-secondary animate-pulse' : 'bg-outline'}`} />
                <span>{busPlate}</span>
                {isSameDir && (
                  <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold ${isSelected ? 'bg-secondary text-on-secondary' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>
                    ➔
                  </span>
                )}
                {isOppositeDir && (
                  <span className="text-[9.5px] px-1 py-0.2 rounded bg-error-container text-on-error-container font-bold" title={lang === 'hi' ? 'विपरीत दिशा' : 'Opposite direction'}>
                    ⇄
                  </span>
                )}
                <span className="text-[10px] opacity-85">
                  {busMoving ? `${Math.round(bus.speed)}km/h` : (lang === 'hi' ? 'खड़ी है' : 'Halt')}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* Status Banner when No Live Buses are currently on this route */}
      {matchingBuses.length === 0 && !isLoading && (
        <section className="px-4 py-3">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-surface-container-high text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">schedule</span>
              </span>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-xs text-on-surface">
                  {lang === 'hi' ? 'लाइव GPS डेटा उपलब्ध नहीं है' : 'No Live GPS Data Available'}
                </span>
                <span className="text-[11px] text-on-surface-variant mt-0.5">
                  {lang === 'hi'
                    ? `डेटाबेस व समय सारणी (हर ${activeRoute?.headway || '15-20'} मिनट) के अनुसार अनुमानित समय नीचे देखें`
                    : `Showing estimated times from database & schedule (every ${activeRoute?.headway || '15-20'} mins)`}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-extrabold shrink-0 border border-outline-variant/40">
              Estimated
            </span>
          </div>
        </section>
      )}

      {/* Live Status & Speed Bar (Only when bus is active) */}
      {currentBus && (
        <section className="bg-secondary text-on-secondary px-4 py-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary-fixed">
              verified
            </span>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-on-secondary leading-tight">
                {isMoving ? t('onTrack') : t('atStop')}
              </span>
              <span className="text-[11px] text-secondary-fixed opacity-95">
                {lastUpdatedSec < 5 ? t('updatedJustNow') : `${lastUpdatedSec} ${t('secondsAgo')}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-on-secondary-fixed/20 px-3 py-1 rounded-full text-secondary-fixed text-[13px] font-extrabold">
            <span className="material-symbols-outlined text-[16px]">speed</span>
            <span>{speedDisplay}</span>
          </div>
        </section>
      )}

      {/* Map Toggle & Map Section (Hidden by default as requested) */}
      <div className="px-4 py-2 flex items-center justify-between bg-surface-container-low/60 border-b border-outline-variant/20">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-primary">
            {showMap ? 'map' : 'explore'}
          </span>
          <span>{showMap ? (lang === 'hi' ? 'लाइव मैप सक्रिय' : 'Live Map Visible') : (lang === 'hi' ? 'लाइव मैप छिपा हुआ है' : 'Live Map is Hidden')}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-primary font-bold text-xs flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
        >
          <span className="material-symbols-outlined text-[15px]">
            {showMap ? 'visibility_off' : 'visibility'}
          </span>
          <span>{showMap ? (lang === 'hi' ? 'मैप छुपाएं' : 'Hide Map') : (lang === 'hi' ? 'मैप देखें' : 'Show Map')}</span>
        </button>
      </div>

      {showMap && (
        <section className="p-3 animate-fadeIn">
          <BusMap
            buses={matchingBuses}
            selectedBus={currentBus}
            onSelectBus={handleSelectBus}
            routePoints={activeRoute?.points || []}
            stops={routeStops}
            activeStopIndex={currentBus ? currentStopIndex : -1}
          />
        </section>
      )}

      {/* Current Halt & Next Stop Banner */}
      {currentBus && (
        <section className="px-4 py-1">
          <div className="bg-secondary-container text-on-secondary-container p-3 rounded-2xl border border-secondary-fixed-dim/40 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">directions_bus</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                  {t('currentStatus')}
                </span>
                <span className="text-[15px] font-extrabold text-on-surface truncate">
                  {getStopDisplayName(currentHaltStop)}
                </span>
                <span className="text-[12px] font-semibold text-secondary">
                  {isMoving ? t('approachingStop') : t('haltAtStop')}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-secondary text-on-secondary font-extrabold text-xs tracking-wide">
                {currentBus?.plateFormatted || formatBusPlate(currentBus?.id)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Vertical Stop Line Journey (Iconic Where Is My Train Track) */}
      <section className="px-4 py-4 flex flex-col">
        <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>{t('allStops')} ({routeStops.length})</span>
          <span className="text-primary font-semibold">{activeRoute?.agency || 'PM e-Bus'} Udaipur</span>
        </div>

        {/* Stops Container */}
        <div className="relative flex flex-col pl-2">
          {/* Base Background Track Line */}
          <div className="absolute left-[23px] top-4 bottom-8 w-[5px] bg-outline-variant/60 rounded-full" />
          
          {/* Active Progress Track Line (Only when bus is active) */}
          {currentBus && (
            <div
              className="absolute left-[23px] top-4 w-[5px] bg-secondary rounded-full transition-all duration-500"
              style={{
                height: `${Math.min(100, Math.max(10, (currentStopIndex / Math.max(1, routeStops.length - 1)) * 100))}%`
              }}
            />
          )}

          {routeStops.map((stop, index) => {
            const hasBus = Boolean(currentBus);
            const isDeparted = hasBus && index < currentStopIndex;
            const isCurrent = hasBus && index === currentStopIndex;
            const isNext = hasBus && index === currentStopIndex + 1;
            const isFinal = index === routeStops.length - 1;
            const stopEta = getStopETA(index);

            return (
              <div key={stop.id || index} className="relative flex items-start gap-3 py-2.5">
                {/* Node indicator */}
                <div className="flex flex-col items-center justify-center w-[20px] flex-shrink-0 mt-1.5 relative z-10">
                  {isCurrent ? (
                    <div className="relative flex items-center justify-center">
                      <span className="animate-ping absolute -top-1 w-8 h-8 rounded-full bg-secondary opacity-60" />
                      <div className="relative w-8 h-8 rounded-full bg-secondary text-on-secondary shadow-md flex items-center justify-center">
                        <span className="material-symbols-outlined text-[17px]">directions_bus</span>
                      </div>
                    </div>
                  ) : isDeparted ? (
                    <div className="w-4 h-4 rounded-full bg-secondary border-3 border-surface shadow-xs flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-surface" />
                    </div>
                  ) : isFinal ? (
                    <div className="w-4 h-4 rounded-full bg-primary border-3 border-surface shadow-xs" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-surface border-2 border-outline-variant" />
                  )}
                </div>

                {/* Stop Card */}
                <div
                  className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-surface-container-lowest border-2 border-secondary shadow-md'
                      : isNext
                      ? 'bg-surface-container-lowest border-primary/50 shadow-xs'
                      : isDeparted
                      ? 'bg-surface-container-lowest/70 border-outline-variant/30 opacity-70'
                      : 'bg-surface-container-lowest border-outline-variant/30'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[15px] font-bold ${isDeparted ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                        {getStopDisplayName(stop)}
                      </span>
                      <span className="text-[12px] text-on-surface-variant font-medium">
                        {lang === 'hi' ? stop.english : stop.name}
                      </span>
                    </div>

                    {isCurrent ? (
                      <div className="flex items-center gap-1 mt-1 text-secondary font-bold text-xs">
                        <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                        <span>{t('currentPosition')}</span>
                      </div>
                    ) : isNext ? (
                      <span className="text-xs text-primary font-bold mt-0.5">
                        {t('nextStopAway')}
                      </span>
                    ) : isDeparted ? (
                      <span className="text-[11px] text-secondary font-medium">
                        {t('departed')}
                      </span>
                    ) : isFinal ? (
                      <span className="text-xs text-primary font-bold mt-0.5">
                        {t('finalDestination')}
                      </span>
                    ) : null}
                  </div>

                  {/* Real-time ETA Display */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end justify-center">
                    {isCurrent ? (
                      <>
                        <span className="text-[14px] font-black text-secondary tracking-tight leading-tight">
                          {stopEta.timeStr}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-extrabold flex items-center gap-1 mt-1 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                          <span>{lang === 'hi' ? 'वर्तमान (Live)' : 'Live Now'}</span>
                        </span>
                      </>
                    ) : isDeparted ? (
                      <>
                        <span className="text-[12px] font-semibold text-outline line-through leading-tight">
                          {stopEta.timeStr}
                        </span>
                        <span className="text-[10px] font-bold text-outline/80 mt-0.5">
                          {lang === 'hi' ? 'छूट चुकी' : 'Departed'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`text-[14px] font-black tracking-tight leading-tight ${isNext ? 'text-primary' : 'text-on-surface'}`}>
                          {stopEta.timeStr}
                        </span>
                        <span className={`text-[10.5px] font-extrabold mt-0.5 ${isNext ? 'text-primary' : 'text-secondary'}`}>
                          {!hasBus
                            ? (lang === 'hi' ? 'Estimated (अनुमानित)' : 'Estimated')
                            : stopEta.etaMinutes <= 1
                            ? (lang === 'hi' ? 'पहुँचने वाली' : 'Arriving')
                            : `~${stopEta.etaMinutes} ${lang === 'hi' ? 'मिनट' : 'mins'}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Floating Action Bar (Alarm & WhatsApp Share) */}
      <div className="fixed bottom-16 left-0 right-0 max-w-2xl mx-auto p-3 bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant/30 shadow-lg z-40 flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggleAlarm}
          className={`flex-1 h-12 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs border ${
            alarmActive
              ? 'bg-tertiary text-on-tertiary border-tertiary animate-pulse'
              : 'bg-surface-container hover:bg-surface-container-high text-on-surface border-outline-variant/40'
          }`}
        >
          <span className="material-symbols-outlined text-[19px]">
            {alarmActive ? 'notifications_active' : 'notifications'}
          </span>
          <span>{alarmActive ? t('alarmActive') : t('alarm')}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex-1 h-12 rounded-xl bg-secondary hover:bg-secondary/95 text-on-secondary font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[19px]">share</span>
          <span>{t('shareStatus')}</span>
        </button>
      </div>
    </div>
  );
}

export default function LiveTrackerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm font-semibold text-on-surface-variant flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-3xl animate-spin text-primary">autorenew</span>
          <span>लाइव ट्रैकर लोड हो रहा है...</span>
        </div>
      }
    >
      <LiveTrackerContent />
    </Suspense>
  );
}
