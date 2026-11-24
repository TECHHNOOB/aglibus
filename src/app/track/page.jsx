'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

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

function LiveTrackerContent() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get('route');
  const busParam = searchParams.get('bus');

  const { lang, t, getStopDisplayName, getRouteTitle, formatBusPlate } = useLanguage();

  const [fleetData, setFleetData] = useState({ buses: [], checkedAt: Date.now() });
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(routeParam || '4');
  const [selectedBusId, setSelectedBusId] = useState(busParam || null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedSec, setLastUpdatedSec] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);

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

          // Initial selection only: if no bus is currently selected, pick one
          setSelectedBusId(prevId => {
            if (prevId) return prevId; // Keep existing selected bus!
            if (busParam) return busParam;
            // Pick a moving bus or first bus on the route
            const activeOnRoute = data.buses.find(b => b.routeId === selectedRouteId && b.speed > 0)
              || data.buses.find(b => b.routeId === selectedRouteId)
              || data.buses.find(b => b.speed > 5)
              || data.buses[0];
            return activeOnRoute ? activeOnRoute.id : null;
          });
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
  }, [selectedRouteId, busParam]);

  // Second counter for "updated X sec ago"
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdatedSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Currently selected route details
  const activeRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId) || routes[0] || null;
  }, [routes, selectedRouteId]);

  // Stops on this route
  const routeStops = useMemo(() => {
    if (!activeRoute || !stops.length) return [];
    return (activeRoute.stops || []).map(id => {
      const match = stops.find(s => s.id === id);
      return match || { id, name: `Stop #${id}`, english: `Stop #${id}`, coordinates: null };
    });
  }, [activeRoute, stops]);

  // Filter buses that match this route or are live
  const matchingBuses = useMemo(() => {
    const list = fleetData.buses || [];
    if (!selectedRouteId) return list;
    const matched = list.filter(bus => {
      if (bus.routeId === selectedRouteId) return true;
      if (bus.matches && bus.matches.some(m => m.routeId === selectedRouteId)) return true;
      if (bus.assignment && (bus.assignment === selectedRouteId || bus.assignment.endsWith(selectedRouteId))) return true;
      if (bus.route && bus.route.includes(selectedRouteId)) return true;
      return false;
    });
    return matched.length ? matched : list.slice(0, 5);
  }, [fleetData, selectedRouteId]);

  // Active bus: always resolve from fresh fleetData using selectedBusId
  const currentBus = useMemo(() => {
    if (selectedBusId && fleetData.buses && fleetData.buses.length > 0) {
      const found = fleetData.buses.find(b => b.id.toLowerCase() === selectedBusId.toLowerCase());
      if (found) return found;
    }
    return matchingBuses[0] || fleetData.buses?.[0] || null;
  }, [selectedBusId, fleetData, matchingBuses]);

  // Handle bus selection (from map click or selector pills)
  const handleSelectBus = (bus) => {
    if (!bus) return;
    setSelectedBusId(bus.id);
    if (bus.routeId && bus.routeId !== selectedRouteId) {
      setSelectedRouteId(bus.routeId);
    }
    // Update URL query parameters without reloading
    const params = new URLSearchParams(window.location.search);
    params.set('bus', bus.id);
    if (bus.routeId) params.set('route', bus.routeId);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  // Handle route change
  const handleSelectRoute = (newRouteId) => {
    setSelectedRouteId(newRouteId);
    // Auto-select first bus on the newly chosen route
    const busOnRoute = fleetData.buses?.find(b => b.routeId === newRouteId);
    if (busOnRoute) {
      setSelectedBusId(busOnRoute.id);
    } else {
      setSelectedBusId(null);
    }
    const params = new URLSearchParams(window.location.search);
    params.set('route', newRouteId);
    if (busOnRoute) params.set('bus', busOnRoute.id);
    else params.delete('bus');
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  // Compute active stop index along the route
  const currentStopIndex = useMemo(() => {
    if (!currentBus || !routeStops.length) return 0;
    // Check nearestStop from API
    if (currentBus.nearestStop?.id) {
      const idx = routeStops.findIndex(s => s.id === currentBus.nearestStop.id);
      if (idx >= 0) return idx;
    }
    // Check matches
    if (currentBus.matches && currentBus.matches.length) {
      const match = currentBus.matches.find(m => m.routeId === selectedRouteId) || currentBus.matches[0];
      if (match?.position?.stopIds) {
        const stopId = match.position.stopIds[0];
        const idx = routeStops.findIndex(s => s.id === stopId);
        if (idx >= 0) return idx;
      }
    }
    return 0;
  }, [currentBus, selectedRouteId, routeStops]);

  // Current speed display
  const isMoving = currentBus?.speed && currentBus.speed >= 2;
  const speedDisplay = currentBus?.speed != null ? `${Math.round(currentBus.speed)} km/h` : (lang === 'hi' ? 'खड़ी है (Halt)' : 'At Halt');

  const currentHaltStop = routeStops[currentStopIndex] || routeStops[0] || { name: 'आरंभिक स्टॉप', english: 'Origin Stop' };

  const handleShare = () => {
    const busPlate = currentBus?.plateFormatted || formatBusPlate(currentBus?.id);
    const text = `Live Tracking Bus ${busPlate} on ${getRouteTitle(activeRoute) || 'Udaipur City Transit'}. Live ETA and Stop Progress: ${window.location.href}`;
    if (navigator.share) {
      navigator.share({ title: 'AgliBus Live Tracking', text, url: window.location.href }).catch(() => {});
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
              {getRouteTitle(activeRoute) || (lang === 'hi' ? 'बड़गांव ➔ बलिचा' : 'Badgaon ➔ Balicha')}
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

      {/* Quick Bus Selector Tray: Allows easy switching between active buses on this route */}
      {matchingBuses.length > 0 && (
        <section className="bg-surface-container-low px-4 py-2 border-b border-outline-variant/30 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase shrink-0">
            {lang === 'hi' ? 'बस चुनें:' : 'Select Bus:'}
          </span>
          {matchingBuses.map(bus => {
            const isSelected = currentBus && currentBus.id === bus.id;
            const busPlate = bus.plateFormatted || formatBusPlate(bus.id);
            const busMoving = bus.speed && bus.speed >= 2;

            return (
              <button
                key={bus.id}
                type="button"
                onClick={() => handleSelectBus(bus)}
                className={`px-3 py-1 rounded-full text-xs font-extrabold shrink-0 flex items-center gap-1.5 transition-all shadow-2xs ${
                  isSelected
                    ? 'bg-primary text-on-primary shadow-xs ring-2 ring-primary/30'
                    : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${busMoving ? 'bg-secondary animate-pulse' : 'bg-outline'}`} />
                <span>{busPlate}</span>
                <span className="text-[10px] opacity-85">
                  {busMoving ? `${Math.round(bus.speed)}km/h` : (lang === 'hi' ? 'खड़ी है' : 'Halt')}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* Live Status & Speed Bar (Iconic Where Is My Train Banner) */}
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

      {/* Map Section */}
      <section className="p-3">
        <BusMap
          buses={matchingBuses}
          selectedBus={currentBus}
          onSelectBus={handleSelectBus}
          routePoints={activeRoute?.points || []}
          stops={routeStops}
          activeStopIndex={currentStopIndex}
        />
      </section>

      {/* Current Halt & Next Stop Banner */}
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

      {/* Vertical Stop Line Journey (Iconic Where Is My Train Track) */}
      <section className="px-4 py-4 flex flex-col">
        <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>{t('allStops')} ({routeStops.length})</span>
          <span className="text-primary font-semibold">{currentBus?.agency || 'PM e-Bus'} Udaipur</span>
        </div>

        {/* Stops Container */}
        <div className="relative flex flex-col pl-2">
          {/* Base Background Track Line */}
          <div className="absolute left-[23px] top-4 bottom-8 w-[5px] bg-outline-variant/60 rounded-full" />
          
          {/* Active Progress Track Line */}
          <div
            className="absolute left-[23px] top-4 w-[5px] bg-secondary rounded-full transition-all duration-500"
            style={{
              height: `${Math.min(100, Math.max(10, (currentStopIndex / Math.max(1, routeStops.length - 1)) * 100))}%`
            }}
          />

          {routeStops.map((stop, index) => {
            const isDeparted = index < currentStopIndex;
            const isCurrent = index === currentStopIndex;
            const isNext = index === currentStopIndex + 1;
            const isFinal = index === routeStops.length - 1;

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
                  className={`flex-1 flex items-start justify-between p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-surface-container-lowest border-2 border-secondary shadow-md'
                      : isNext
                      ? 'bg-surface-container-lowest border-primary/50 shadow-xs'
                      : isDeparted
                      ? 'bg-surface-container-lowest/70 border-outline-variant/30 opacity-70'
                      : 'bg-surface-container-lowest border-outline-variant/30'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
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

                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-bold ${isCurrent ? 'text-secondary' : isNext ? 'text-primary' : 'text-on-surface-variant'}`}>
                      Stop #{index + 1}
                    </span>
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
