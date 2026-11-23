'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';

export default function RoutesPage() {
  const { lang, t, getStopDisplayName, getRouteTitle } = useLanguage();

  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, ebus, uctsl, popular
  const [expandedRouteId, setExpandedRouteId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [routesRes, stopsRes] = await Promise.all([
          fetch('/api/routes'),
          fetch('/api/stops')
        ]);
        if (routesRes.ok) setRoutes(await routesRes.json());
        if (stopsRes.ok) setStops(await stopsRes.json());
      } catch (e) {
        console.error('Failed to load routes:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      // Category filter
      if (filter === 'ebus' && r.agency !== 'PM e-Bus') return false;
      if (filter === 'uctsl' && r.agency !== 'UCTSL') return false;
      if (filter === 'popular' && !['1', '2', '4', '7', '10', 'U1', 'U4'].includes(r.id)) return false;

      // Search filter
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const matchId = (r.id || '').toLowerCase().includes(q);
      const matchCode = (r.code || '').toLowerCase().includes(q);
      const matchTitle = (r.title || '').toLowerCase().includes(q) || (r.titleEn || '').toLowerCase().includes(q);
      return matchId || matchCode || matchTitle;
    });
  }, [routes, filter, searchTerm]);

  const toggleExpand = (routeId) => {
    setExpandedRouteId(prev => prev === routeId ? null : routeId);
  };

  const getStopName = (stopId) => {
    const s = stops.find(item => item.id === stopId);
    if (!s) return `Stop #${stopId}`;
    return getStopDisplayName(s);
  };

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Top Header & Search Bar */}
      <section className="px-4 pt-3 pb-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="font-extrabold text-[18px] text-on-surface">
              {t('routes')} • {t('citySubtitle')}
            </h1>
            <p className="text-xs text-on-surface-variant">
              {lang === 'hi' ? 'PM e-Bus और सिटी बस (UCTSL) के सभी आधिकारिक रूट' : 'All official routes of PM e-Bus and City Bus (UCTSL)'}
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-xs">
            {routes.length} {t('routesAvailable')}
          </span>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center w-full">
          <span className="material-symbols-outlined absolute left-3.5 text-primary text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchRoutePlaceholder')}
            className="w-full h-12 pl-11 pr-10 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline text-sm font-medium shadow-sm outline-none border border-outline-variant/30 focus:border-primary transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 text-outline hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
              filter === 'all'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {t('allRoutes')}
          </button>

          <button
            type="button"
            onClick={() => setFilter('ebus')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 transition-all ${
              filter === 'ebus'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">bolt</span>
            <span>{t('ebus')}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('uctsl')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 transition-all ${
              filter === 'uctsl'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">directions_bus</span>
            <span>{t('cityBus')}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('popular')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 transition-all ${
              filter === 'popular'
                ? 'bg-tertiary text-on-tertiary shadow-sm'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">star</span>
            <span>{t('popular')}</span>
          </button>
        </div>
      </section>

      {/* Routes List */}
      <section className="px-4 flex flex-col gap-3 mt-1">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-on-surface-variant gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">autorenew</span>
            <span className="text-sm font-semibold">{lang === 'hi' ? 'रूट लोड हो रहे हैं...' : 'Loading routes...'}</span>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="p-8 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 text-outline">search_off</span>
            <p className="font-bold text-sm">{t('noRoutesFound')}</p>
            <p className="text-xs mt-1">{t('tryAnotherSearch')}</p>
          </div>
        ) : (
          filteredRoutes.map((route) => {
            const isExpanded = expandedRouteId === route.id;
            const isElectric = route.agency === 'PM e-Bus';

            return (
              <div
                key={route.id}
                className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 hover:border-primary/40 transition-all flex flex-col gap-3"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`px-2.5 py-1 rounded-xl font-extrabold text-sm shadow-xs shrink-0 ${
                        isElectric
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      {route.code || route.id}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <h2 className="font-extrabold text-[15px] text-on-surface truncate">
                        {getRouteTitle(route)}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium mt-0.5">
                        <span>{route.agency}</span>
                        <span>•</span>
                        <span>{route.km ? `${route.km} ${t('km')}` : `15 ${t('km')}`}</span>
                        <span>•</span>
                        <span>~{route.minutes || 45} {t('minutes')}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/track?route=${route.id}`}
                    className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">radar</span>
                    <span>Live</span>
                  </Link>
                </div>

                {/* Sub info & stops toggle */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-container text-xs text-on-surface-variant font-medium">
                  <span className="flex items-center gap-1 text-secondary font-bold">
                    <span className="material-symbols-outlined text-[15px]">timer</span>
                    <span>{t('everyXMin', { X: route.headway || '15-20' })}</span>
                  </span>

                  {route.stops && route.stops.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(route.id)}
                      className="flex items-center gap-1 font-bold text-primary hover:underline"
                    >
                      <span>{route.stops.length} {lang === 'hi' ? 'स्टॉप्स' : 'Stops'}</span>
                      <span className="material-symbols-outlined text-[16px]">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Expanded Stops Sequence */}
                {isExpanded && route.stops && (
                  <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex flex-col gap-2 animate-fadeIn">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {lang === 'hi' ? 'स्टॉप सूची (क्रमवार)' : 'Stop Sequence (Ordered)'}
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                      {route.stops.map((stopId, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-on-surface font-medium truncate">
                            {getStopName(stopId)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
