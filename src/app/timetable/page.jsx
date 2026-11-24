'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';

export default function TimetablePage() {
  const { lang, t, getStopDisplayName, getRouteTitle } = useLanguage();

  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('4');
  const [direction, setDirection] = useState('up'); // up (forward), down (reverse)
  const [activeShift, setActiveShift] = useState('all'); // all, morning, afternoon, evening
  const [selectedDay, setSelectedDay] = useState('mon-sat'); // mon-sat, sunday, holiday
  const [viewMode, setViewMode] = useState('grid'); // grid, list, stops
  const [expandedTripIndex, setExpandedTripIndex] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [routesRes, stopsRes] = await Promise.all([
          fetch('/api/routes'),
          fetch('/api/stops')
        ]);
        if (routesRes.ok) setRoutes(await routesRes.json());
        if (stopsRes.ok) setStops(await stopsRes.json());
      } catch (err) {
        console.error('Failed to load timetable data:', err);
      }
    }
    loadData();
  }, []);

  const activeRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId) || routes[0] || {
      id: '4',
      code: 'PM4',
      title: 'बड़गांव → बलिचा',
      titleEn: 'Badgaon ➔ Balicha',
      km: 14.6,
      minutes: 45,
      headway: '19',
      agency: 'PM e-Bus',
      stops: []
    };
  }, [routes, selectedRouteId]);

  // Stops on this route according to selected direction
  const routeStops = useMemo(() => {
    if (!activeRoute || !stops.length) return [];
    const ordered = (activeRoute.stops || []).map(id => {
      const match = stops.find(s => s.id === id);
      return match || { id, name: `Stop #${id}`, english: `Stop #${id}` };
    });
    return direction === 'down' ? [...ordered].reverse() : ordered;
  }, [activeRoute, stops, direction]);

  const originStop = routeStops[0] || { name: 'आरंभिक स्टॉप', english: 'Origin Stop' };
  const destStop = routeStops[routeStops.length - 1] || { name: 'अंतिम स्टॉप', english: 'Destination Stop' };

  // Calculate arrival time at stop for a given trip start
  const calculateStopTime = (tripStartMin, stopIndex, totalStops, totalMinutes) => {
    const elapsed = Math.round((stopIndex / Math.max(1, totalStops - 1)) * totalMinutes);
    const stopMin = tripStartMin + elapsed;
    const h = Math.floor(stopMin / 60) % 24;
    const m = stopMin % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m.toString().padStart(2, '0');
    return `${displayH}:${displayM} ${ampm}`;
  };

  // Generate Trips list
  const trips = useMemo(() => {
    const headway = parseInt(activeRoute.headway, 10) || 20;
    const totalMinutes = activeRoute.minutes || 45;
    const list = [];
    let startMin = 6 * 60; // 06:00 AM
    const endMin = 21 * 60 + 30; // 09:30 PM
    let index = 1;

    while (startMin <= endMin) {
      const h = Math.floor(startMin / 60);
      const m = startMin % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = m.toString().padStart(2, '0');
      const startTimeStr = `${displayH}:${displayM} ${ampm}`;

      // Arrival at destination
      const endTotalMin = startMin + totalMinutes;
      const endH = Math.floor(endTotalMin / 60) % 24;
      const endM = endTotalMin % 60;
      const endAmpm = endH >= 12 ? 'PM' : 'AM';
      const displayEndH = endH % 12 === 0 ? 12 : endH % 12;
      const displayEndM = endM.toString().padStart(2, '0');
      const endTimeStr = `${displayEndH}:${displayEndM} ${endAmpm}`;

      let shift = 'morning';
      if (startMin >= 12 * 60 && startMin < 17 * 60) shift = 'afternoon';
      else if (startMin >= 17 * 60) shift = 'evening';

      list.push({
        tripNumber: index,
        startMin,
        startTimeStr,
        endTimeStr,
        shift,
        totalMinutes
      });

      startMin += headway;
      index++;
    }

    return list;
  }, [activeRoute]);

  // Filter trips by shift
  const filteredTrips = useMemo(() => {
    if (activeShift === 'all') return trips;
    return trips.filter(t => t.shift === activeShift);
  }, [trips, activeShift]);

  return (
    <div className="flex flex-col w-full pb-12">
      {/* Offline Assurance Banner */}
      <section className="px-4 pt-3 pb-2">
        <div className="bg-secondary-fixed/40 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-3 border border-secondary/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-on-secondary shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[18px]">cloud_off</span>
            </div>
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs text-secondary uppercase tracking-tight">
                  {t('offlineReady')}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-secondary text-on-secondary text-[10px] font-bold">
                  {t('activeTag')}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate">
                {t('offlineSubtext')}
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-secondary text-[22px]">verified</span>
        </div>
      </section>

      {/* Route Selector Card */}
      <section className="px-4 py-2">
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2.5 py-1 rounded-xl bg-primary text-on-primary font-extrabold text-sm shadow-xs shrink-0">
                {activeRoute.code || activeRoute.id}
              </span>
              <div className="min-w-0 flex flex-col">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  {activeRoute.agency || 'PM e-Bus'}
                </span>
                <h1 className="font-extrabold text-[15px] text-on-surface truncate">
                  {getStopDisplayName(originStop)} ➔ {getStopDisplayName(destStop)}
                </h1>
              </div>
            </div>

            {/* Route Dropdown */}
            <select
              value={selectedRouteId}
              onChange={(e) => {
                setSelectedRouteId(e.target.value);
                setExpandedTripIndex(null);
              }}
              className="bg-surface-container text-primary font-bold text-xs py-1.5 px-2 rounded-xl border border-outline-variant/40 focus:outline-none cursor-pointer max-w-[130px] truncate"
            >
              {routes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.code || r.id} - {getRouteTitle(r)}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Route Stats */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-surface-container text-center">
            <div className="p-2 rounded-xl bg-surface-container-low">
              <span className="block text-[10px] text-on-surface-variant font-bold uppercase">{t('totalDistance')}</span>
              <span className="text-xs font-extrabold text-on-surface">{activeRoute.km || 15} {t('km')}</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-container-low">
              <span className="block text-[10px] text-on-surface-variant font-bold uppercase">{t('tripTime')}</span>
              <span className="text-xs font-extrabold text-on-surface">~{activeRoute.minutes || 45} {t('minutes')}</span>
            </div>
            <div className="p-2 rounded-xl bg-surface-container-low">
              <span className="block text-[10px] text-on-surface-variant font-bold uppercase">{t('frequency')}</span>
              <span className="text-xs font-extrabold text-secondary">{t('everyXMin', { X: activeRoute.headway || 20 })}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Direction Switcher */}
      <section className="px-4 py-1">
        <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-1.5 rounded-2xl border border-outline-variant/30">
          <button
            type="button"
            onClick={() => setDirection('up')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
              direction === 'up'
                ? 'bg-surface-container-lowest text-primary shadow-sm border border-outline-variant/20'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">near_me</span>
              <span className="truncate max-w-[110px]">{getStopDisplayName(originStop)}</span>
              <span>➔</span>
            </div>
            <span className="text-[10px] font-semibold opacity-80 mt-0.5">{t('forwardDir')}</span>
          </button>

          <button
            type="button"
            onClick={() => setDirection('down')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
              direction === 'down'
                ? 'bg-surface-container-lowest text-primary shadow-sm border border-outline-variant/20'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
              <span className="truncate max-w-[110px]">{getStopDisplayName(destStop)}</span>
              <span>➔</span>
            </div>
            <span className="text-[10px] font-semibold opacity-80 mt-0.5">{t('reverseDir')}</span>
          </button>
        </div>
      </section>

      {/* Shift Time Filters (All / Morning / Afternoon / Evening) */}
      <section className="px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: t('allTrips'), icon: 'all_inclusive' },
            { id: 'morning', label: t('morningShift'), icon: 'wb_sunny' },
            { id: 'afternoon', label: t('afternoonShift'), icon: 'light_mode' },
            { id: 'evening', label: t('eveningShift'), icon: 'nights_stay' },
          ].map(shift => (
            <button
              key={shift.id}
              type="button"
              onClick={() => setActiveShift(shift.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 transition-all shadow-xs ${
                activeShift === shift.id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{shift.icon}</span>
              <span>{shift.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* View Mode Switcher: "Quick Grid (with Stop Name)" vs "Detailed Cards" vs "Stop-by-Stop" */}
      <section className="px-4 py-2">
        <div className="flex items-center justify-between border-b border-surface-container pb-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                viewMode === 'grid'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">grid_view</span>
              <span>समय ग्रिड ({filteredTrips.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                viewMode === 'list'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">view_list</span>
              <span>विस्तृत ट्रिप्स</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stops')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                viewMode === 'stops'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">alt_route</span>
              <span>{t('stopSchedule')}</span>
            </button>
          </div>

          <span className="text-xs text-secondary font-bold">
            {activeRoute.agency || 'PM e-Bus'}
          </span>
        </div>
      </section>

      {/* VIEW MODE 1: TIMINGS GRID (Direct response to user screenshot - shows real STOP NAME instead of 'सेवा #X') */}
      {viewMode === 'grid' && (
        <section className="px-4 py-2">
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                <span className="font-extrabold text-sm text-on-surface">
                  {lang === 'hi' ? 'दैनिक प्रस्थान समय (स्टॉप नाम सहित)' : 'Departure Timings (with Stop Name)'}
                </span>
              </div>
              <span className="text-xs font-extrabold text-secondary">
                ➔ {getStopDisplayName(destStop)}
              </span>
            </div>

            {/* 3-Column Time Pill Grid as in User's Screenshot, but with REAL STOP NAME! */}
            <div className="grid grid-cols-3 gap-2.5">
              {filteredTrips.map((trip) => (
                <div
                  key={trip.tripNumber}
                  className="bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
                  onClick={() => {
                    setViewMode('list');
                    setExpandedTripIndex(trip.tripNumber);
                  }}
                >
                  <span className="font-extrabold text-[13px] text-on-surface tracking-tight group-hover:text-primary">
                    {trip.startTimeStr}
                  </span>
                  {/* REAL STOP NAME displayed underneath each time, completely replacing generic 'सेवा #1' */}
                  <span className="text-[11px] font-bold text-secondary truncate max-w-full px-1 mt-0.5">
                    ➔ {getStopDisplayName(destStop)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 text-center text-xs text-on-surface-variant font-medium">
              <span>{lang === 'hi' ? 'किसी भी समय पर क्लिक करके उस ट्रिप के सभी स्टॉप्स देखें' : 'Tap any time to view all intermediate stops for that trip'}</span>
            </div>
          </div>
        </section>
      )}

      {/* VIEW MODE 2: DETAILED TRIPS LIST (Cards with Origin, Destination & All Intermediate Stops) */}
      {viewMode === 'list' && (
        <section className="px-4 py-2 flex flex-col gap-3">
          {filteredTrips.map((trip) => {
            const isFirst = trip.tripNumber === 1;
            const isLast = trip.tripNumber === trips.length;
            const isExpanded = expandedTripIndex === trip.tripNumber;

            return (
              <div
                key={trip.tripNumber}
                className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/40 transition-all"
              >
                {/* Trip Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="font-extrabold text-xl text-primary tracking-tight">
                      {trip.startTimeStr}
                    </span>
                    {isFirst && (
                      <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-[10px] font-bold uppercase">
                        {t('firstBus')}
                      </span>
                    )}
                    {isLast && (
                      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-[10px] font-bold uppercase">
                        {t('lastBus')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed/40 text-secondary text-xs font-bold">
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    <span>{activeRoute.agency || 'PM e-Bus'}</span>
                  </div>
                </div>

                {/* Actual Stop Names Timeline (Origin ➔ Destination) */}
                <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20">
                  {/* Origin Stop */}
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {t('departureTime')}
                    </span>
                    <span className="font-extrabold text-[14px] text-on-surface truncate">
                      {getStopDisplayName(originStop)}
                    </span>
                    <span className="text-[11px] text-secondary font-semibold">
                      {trip.startTimeStr}
                    </span>
                  </div>

                  {/* Mid arrow / Duration */}
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[10px] font-bold text-on-surface-variant">
                      ~{activeRoute.minutes || 45} {t('minutes')}
                    </span>
                    <div className="flex items-center gap-1 text-primary my-0.5">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <div className="w-8 h-0.5 bg-primary" />
                      <span className="material-symbols-outlined text-[16px] -ml-1">chevron_right</span>
                    </div>
                    <span className="text-[10px] font-bold text-secondary">
                      {activeRoute.km || 15} {t('km')}
                    </span>
                  </div>

                  {/* Destination Stop */}
                  <div className="flex flex-col text-right min-w-0">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {t('arrivalTime')}
                    </span>
                    <span className="font-extrabold text-[14px] text-on-surface truncate">
                      {getStopDisplayName(destStop)}
                    </span>
                    <span className="text-[11px] font-extrabold text-primary">
                      {trip.endTimeStr}
                    </span>
                  </div>
                </div>

                {/* Expand Stop-by-Stop Schedule Toggle */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setExpandedTripIndex(isExpanded ? null : trip.tripNumber)}
                    className="flex items-center gap-1 text-primary font-bold hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isExpanded ? 'expand_less' : 'schedule'}
                    </span>
                    <span>
                      {isExpanded ? t('hideStopTimetable') : `${t('viewStopTimetable')} (${routeStops.length} ${lang === 'hi' ? 'स्टॉप्स' : 'Stops'})`}
                    </span>
                  </button>

                  <Link
                    href={`/track?route=${activeRoute.id}`}
                    className="px-2.5 py-1 rounded-lg bg-surface-container text-primary font-bold text-xs flex items-center gap-1 hover:bg-primary hover:text-on-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">radar</span>
                    <span>{t('trackLive')}</span>
                  </Link>
                </div>

                {/* Expanded Intermediate Stops Timetable */}
                {isExpanded && routeStops.length > 0 && (
                  <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex flex-col gap-2">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {t('tripStopTimings')}
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {routeStops.map((stop, sIdx) => {
                        const stopTime = calculateStopTime(
                          trip.startMin,
                          sIdx,
                          routeStops.length,
                          trip.totalMinutes
                        );
                        const isFirstStop = sIdx === 0;
                        const isLastStop = sIdx === routeStops.length - 1;

                        return (
                          <div
                            key={sIdx}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                              isFirstStop || isLastStop
                                ? 'bg-surface-container-lowest font-bold border border-outline-variant/30'
                                : 'hover:bg-surface-container'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                                {sIdx + 1}
                              </span>
                              <span className="text-on-surface truncate">
                                {getStopDisplayName(stop)}
                              </span>
                            </div>
                            <span className="font-extrabold text-primary shrink-0 ml-2">
                              {stopTime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* VIEW MODE 3: FULL STOP-BY-STOP SCHEDULE */}
      {viewMode === 'stops' && (
        <section className="px-4 py-2 flex flex-col gap-3">
          <div className="p-3 rounded-xl bg-surface-container text-xs text-on-surface-variant">
            <span>रूट: </span>
            <strong className="text-on-surface">{getStopDisplayName(originStop)} ➔ {getStopDisplayName(destStop)}</strong>
            <span className="block mt-0.5">{lang === 'hi' ? 'नीचे प्रत्येक स्टॉप पर बस के आगमन का समय दर्शाया गया है:' : 'Estimated arrival time at every stop along this route:'}</span>
          </div>

          <div className="flex flex-col gap-2">
            {routeStops.map((stop, sIdx) => {
              const morningTime = calculateStopTime(6 * 60, sIdx, routeStops.length, activeRoute.minutes || 45);
              const afternoonTime = calculateStopTime(13 * 60, sIdx, routeStops.length, activeRoute.minutes || 45);
              const eveningTime = calculateStopTime(18 * 60, sIdx, routeStops.length, activeRoute.minutes || 45);

              return (
                <div
                  key={stop.id || sIdx}
                  className="bg-surface-container-lowest rounded-xl p-3.5 shadow-sm border border-outline-variant/30 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-xs flex items-center justify-center shrink-0">
                        {sIdx + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-sm text-on-surface truncate">
                          {getStopDisplayName(stop)}
                        </span>
                        {stop.english && lang === 'hi' && (
                          <span className="text-[11px] text-on-surface-variant">{stop.english}</span>
                        )}
                        {stop.name && lang === 'en' && (
                          <span className="text-[11px] text-on-surface-variant">{stop.name}</span>
                        )}
                      </div>
                    </div>

                    <span className="text-[11px] font-bold text-secondary shrink-0">
                      {sIdx === 0
                        ? (lang === 'hi' ? 'आरंभ (Origin)' : 'Origin')
                        : `+${Math.round(sIdx * (activeRoute.minutes || 45) / Math.max(1, routeStops.length - 1))} ${lang === 'hi' ? 'मिनट (ETA)' : 'min (ETA)'}`}
                    </span>
                  </div>

                  {/* Sample departure times at this specific stop */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-surface-container text-center">
                    <div className="p-1.5 rounded-lg bg-surface-container-low">
                      <span className="block text-[9px] font-bold text-on-surface-variant uppercase">{t('morningShift')}</span>
                      <span className="text-xs font-bold text-on-surface">{morningTime}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-surface-container-low">
                      <span className="block text-[9px] font-bold text-on-surface-variant uppercase">{t('afternoonShift')}</span>
                      <span className="text-xs font-bold text-on-surface">{afternoonTime}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-surface-container-low">
                      <span className="block text-[9px] font-bold text-on-surface-variant uppercase">{t('eveningShift')}</span>
                      <span className="text-xs font-bold text-on-surface">{eveningTime}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
