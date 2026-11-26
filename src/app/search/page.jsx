'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

function SearchResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t, getStopDisplayName, formatBusPlate } = useLanguage();

  const paramFrom = searchParams.get('from');
  const paramTo = searchParams.get('to');

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [tripPlan, setTripPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [planError, setPlanError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'electric' | 'next30' | 'direct'
  const [alarms, setAlarms] = useState(new Set());
  const [expandedStops, setExpandedStops] = useState(new Set());
  const [toastMessage, setToastMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [allStops, setAllStops] = useState([]);
  const [suggestions, setSuggestions] = useState({ field: null, items: [] });

  // Load all stops for editing autocomplete
  useEffect(() => {
    async function fetchStops() {
      try {
        const res = await fetch('/api/stops');
        if (res.ok) {
          const data = await res.json();
          setAllStops(data);
        }
      } catch (e) {
        console.error('Failed to load stops:', e);
      }
    }
    fetchStops();
  }, []);

  // Fetch or restore trip plan
  useEffect(() => {
    const savedFrom = paramFrom || (typeof window !== 'undefined' ? sessionStorage.getItem('aglibus_search_from') : '') || (lang === 'hi' ? 'चेटक सर्कल' : 'Chetak Circle');
    const savedTo = paramTo || (typeof window !== 'undefined' ? sessionStorage.getItem('aglibus_search_to') : '') || (lang === 'hi' ? 'सुखाड़िया सर्कल' : 'Sukhadia Circle');

    setOrigin(savedFrom);
    setDestination(savedTo);

    async function loadPlan(fromVal, toVal) {
      if (!fromVal?.trim() || !toVal?.trim()) return;
      setIsLoading(true);
      setPlanError('');
      try {
        const res = await fetch(`/api/plan?from=${encodeURIComponent(fromVal)}&to=${encodeURIComponent(toVal)}`);
        const data = await res.json();
        if (!res.ok) {
          setPlanError(data.error || (lang === 'hi' ? 'कोई सीधा रूट नहीं मिला' : 'No direct or connecting route found'));
          setTripPlan(null);
        } else {
          setTripPlan(data);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('aglibus_search_from', fromVal);
            sessionStorage.setItem('aglibus_search_to', toVal);
            sessionStorage.setItem('aglibus_search_plan', JSON.stringify(data));
          }
        }
      } catch (err) {
        setPlanError(lang === 'hi' ? 'रूट खोजने में त्रुटि हुई' : 'Network error while planning trip');
        setTripPlan(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadPlan(savedFrom, savedTo);
  }, [paramFrom, paramTo, lang]);

  // Swap stops function
  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    router.push(`/search?from=${encodeURIComponent(destination)}&to=${encodeURIComponent(temp)}`);
  };

  // Toggle alarm function with vibration and toast
  const toggleAlarm = (planKey, routeCode) => {
    setAlarms(prev => {
      const next = new Set(prev);
      if (next.has(planKey)) {
        next.delete(planKey);
        showToast(lang === 'hi' ? `${routeCode} के लिए अलार्म हटाया गया` : `Alarm removed for ${routeCode}`);
      } else {
        next.add(planKey);
        showToast(lang === 'hi' ? `🔔 ${routeCode} के आगमन का अलार्म सेट किया गया!` : `🔔 Arrival alarm set for ${routeCode}!`);
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(50);
        }
      }
      return next;
    });
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  // Toggle expanded stop list
  const toggleStopsAccordion = (idx) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Suggestions handler for stop editing
  const handleInputChange = (field, value) => {
    if (field === 'origin') setOrigin(value);
    else setDestination(value);

    if (value.trim().length > 1) {
      const q = value.toLowerCase();
      const matched = allStops.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.english && s.english.toLowerCase().includes(q))
      ).slice(0, 6);
      setSuggestions({ field, items: matched });
    } else {
      setSuggestions({ field: null, items: [] });
    }
  };

  const selectSuggestion = (field, stop) => {
    const displayName = getStopDisplayName(stop);
    if (field === 'origin') setOrigin(displayName);
    else setDestination(displayName);
    setSuggestions({ field: null, items: [] });
  };

  const applyStopEdit = () => {
    setIsEditing(false);
    router.push(`/search?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`);
  };

  // Read realistic departure and arrival times from API plan data
  const getDepartureInfo = (opt, idx) => {
    if (opt.departureTime && opt.arrivalTime) {
      return {
        dep: opt.departureTime,
        arr: opt.arrivalTime,
        depMinutesFromNow: opt.departureMinutes || 10
      };
    }
    const now = new Date();
    const depMinutesFromNow = opt.departureMinutes || (8 + idx * 10);
    const depDate = new Date(now.getTime() + depMinutesFromNow * 60000);
    const arrDate = new Date(depDate.getTime() + (opt.totalMinutes || 20) * 60000);

    const formatT = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      let h = ist.getUTCHours();
      const m = ist.getUTCMinutes().toString().padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return { time: `${h}:${m}`, ampm };
    };

    return {
      dep: formatT(depDate),
      arr: formatT(arrDate),
      depMinutesFromNow
    };
  };

  // Current formatted date for header
  const todayFormatted = useMemo(() => {
    const now = new Date();
    const options = { day: 'numeric', month: 'short' };
    return now.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', options);
  }, [lang]);

  // Filter plans based on active filter
  const filteredPlans = useMemo(() => {
    if (!tripPlan || !tripPlan.plans) return [];
    return tripPlan.plans.filter((p, idx) => {
      if (activeFilter === 'direct') {
        return (p.transferCount != null ? p.transferCount : p.legs.length - 1) === 0;
      }
      if (activeFilter === 'electric') {
        return p.legs.some(l => /pm|electric|e-bus/i.test(l.agency || l.code || ''));
      }
      if (activeFilter === 'next30') {
        const depInfo = getDepartureInfo(p, idx);
        return depInfo.depMinutesFromNow <= 30;
      }
      return true;
    });
  }, [tripPlan, activeFilter]);

  // Overall metadata for header summary
  const headerMeta = useMemo(() => {
    if (!tripPlan || !tripPlan.plans || tripPlan.plans.length === 0) {
      return { stops: 6, dist: '4.8', freq: lang === 'hi' ? 'हर 15 मिनट' : 'Frequent Route' };
    }
    const firstPlan = tripPlan.plans[0];
    const totalStops = firstPlan.legs.reduce((acc, l) => acc + (l.stopsCount || 4), 0);
    const distEst = (totalStops * 0.7).toFixed(1);
    const isDirect = (firstPlan.transferCount != null ? firstPlan.transferCount : firstPlan.legs.length - 1) === 0;
    return {
      stops: totalStops,
      dist: distEst,
      freq: isDirect ? (lang === 'hi' ? 'सीधा रूट • नियमित सेवा' : 'Direct • Frequent Route') : (lang === 'hi' ? '1 ट्रांसफर सेवा' : '1 Transfer Service')
    };
  }, [tripPlan, lang]);

  return (
    <div className="flex flex-col w-full pb-8 bg-surface min-h-[calc(100vh-8rem)]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[18px] text-secondary-fixed">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Row: Back to Home & Title */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-outline-variant/30 bg-surface/90 backdrop-blur-md">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>{lang === 'hi' ? 'होम पेज' : 'Back to Home'}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">edit</span>
            <span>{isEditing ? (lang === 'hi' ? 'बंद करें' : 'Close') : (lang === 'hi' ? 'स्टॉप बदलें' : 'Change Stops')}</span>
          </button>
        </div>
      </div>

      {/* Inline Stop Edit Form (Expandable) */}
      {isEditing && (
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/30 flex flex-col gap-3 transition-all animate-fadeIn">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {t('from')}
              </label>
              <input
                type="text"
                value={origin}
                onChange={(e) => handleInputChange('origin', e.target.value)}
                placeholder={lang === 'hi' ? 'प्रस्थान स्टॉप...' : 'Boarding stop...'}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
              />
              {suggestions.field === 'origin' && suggestions.items.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-40 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden">
                  {suggestions.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSuggestion('origin', s)}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span>{getStopDisplayName(s)}</span>
                      <span className="text-[10px] text-on-surface-variant">{lang === 'hi' ? s.english : s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {t('to')}
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => handleInputChange('destination', e.target.value)}
                placeholder={lang === 'hi' ? 'गंतव्य स्टॉप...' : 'Destination stop...'}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
              />
              {suggestions.field === 'destination' && suggestions.items.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-40 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden">
                  {suggestions.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSuggestion('destination', s)}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span>{getStopDisplayName(s)}</span>
                      <span className="text-[10px] text-on-surface-variant">{lang === 'hi' ? s.english : s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={applyStopEdit}
            className="w-full h-10 bg-primary text-on-primary rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            <span>{lang === 'hi' ? 'नया रूट खोजें' : 'Search Updated Route'}</span>
          </button>
        </div>
      )}

      {/* Search Summary Header Box (Where Is My Train style high contrast card) */}
      <section className="bg-primary text-on-primary px-4 py-3.5 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col flex-1 min-w-0">
            {/* Origin */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary-container flex-shrink-0" />
              <div className="truncate">
                <span className="font-extrabold text-[15px] tracking-tight">{origin}</span>
                {tripPlan?.from && (
                  <span className="text-[11px] text-primary-fixed opacity-90 ml-1.5 font-medium">
                    ({lang === 'hi' ? (tripPlan.from.english || origin) : (tripPlan.from.name || origin)})
                  </span>
                )}
              </div>
            </div>

            {/* Connector Line & Route Metadata */}
            <div className="flex items-center pl-1 my-0.5">
              <div className="w-0.5 h-4 bg-primary-fixed-dim/40 ml-[3px]" />
              <span className="text-[10.5px] font-semibold text-primary-fixed-dim ml-3.5">
                {headerMeta.dist} km • {headerMeta.stops} Stops • {headerMeta.freq}
              </span>
            </div>

            {/* Destination */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary-fixed flex-shrink-0" />
              <div className="truncate">
                <span className="font-extrabold text-[15px] tracking-tight">{destination}</span>
                {tripPlan?.to && (
                  <span className="text-[11px] text-primary-fixed opacity-90 ml-1.5 font-medium">
                    ({lang === 'hi' ? (tripPlan.to.english || destination) : (tripPlan.to.name || destination)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap Locations"
            className="w-10 h-10 rounded-full bg-on-primary/10 hover:bg-on-primary/20 active:scale-90 flex items-center justify-center text-on-primary flex-shrink-0 transition-transform shadow-xs"
            title="Swap Origin and Destination"
          >
            <span className="material-symbols-outlined text-[20px]">swap_vert</span>
          </button>
        </div>

        {/* Date and Route Quick Toggle Bar */}
        <div className="mt-3 pt-2.5 border-t border-primary-fixed-dim/20 flex items-center justify-between text-on-primary-container">
          <div className="flex items-center gap-1.5 text-[11px] font-bold bg-on-primary/15 px-2.5 py-1 rounded-full">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            <span>{lang === 'hi' ? `आज (Today), ${todayFormatted}` : `Today, ${todayFormatted}`}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-primary-fixed">
            <span className="w-2 h-2 rounded-full bg-secondary-fixed animate-pulse" />
            <span>{lang === 'hi' ? 'लाइव जीपीएस सक्रिय' : 'Live Telemetry Active'}</span>
          </div>
        </div>
      </section>

      {/* Horizontal Filter Chips (Quick accessible swipeable pill bar) */}
      <section className="w-full overflow-x-auto py-2.5 px-4 flex items-center gap-2 bg-surface-container-low shadow-xs no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap active:scale-95 transition-all ${
            activeFilter === 'all'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
          }`}
        >
          {lang === 'hi' ? 'सभी बसें (All)' : 'All Buses'}
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('electric')}
          className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap flex items-center gap-1 active:scale-95 transition-all ${
            activeFilter === 'electric'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[15px] text-secondary">bolt</span>
          <span>{lang === 'hi' ? 'इलेक्ट्रिक बस (AC)' : 'AC Electric'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('next30')}
          className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap flex items-center gap-1 active:scale-95 transition-all ${
            activeFilter === 'next30'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[15px] text-primary">schedule</span>
          <span>{lang === 'hi' ? 'अगले 30 मिनट में' : 'Next 30 Mins'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('direct')}
          className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap active:scale-95 transition-all ${
            activeFilter === 'direct'
              ? 'bg-primary-container text-on-primary shadow-xs'
              : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
          }`}
        >
          <span>{lang === 'hi' ? 'केवल सीधी बस (Direct)' : 'Direct Only'}</span>
        </button>
      </section>

      {/* Results Count Bar with Telemetry Hint */}
      <div className="px-4 pt-3.5 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-[15px] text-on-surface">
            {isLoading ? (lang === 'hi' ? 'खोज रहे हैं...' : 'Searching...') : `${filteredPlans.length} ${lang === 'hi' ? 'बसें उपलब्ध' : 'Buses Available'}`}
          </span>
          {!isLoading && (
            <span className="text-[11px] text-on-surface-variant font-medium">
              ({filteredPlans.length} {lang === 'hi' ? 'विकल्प' : 'options'})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-secondary font-bold text-[11px]">
          <span className="material-symbols-outlined text-[16px]">cell_tower</span>
          <span>GPS + Cell Sync</span>
        </div>
      </div>

      {/* Error state */}
      {planError && (
        <section className="px-4 py-3">
          <div className="p-3.5 bg-error-container text-on-error-container rounded-2xl text-xs font-semibold flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{planError}</span>
          </div>
        </section>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3 px-4 mt-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/20 animate-pulse flex flex-col gap-3">
              <div className="h-5 bg-surface-container rounded-md w-1/3" />
              <div className="grid grid-cols-3 gap-2 py-2">
                <div className="h-10 bg-surface-container rounded-lg" />
                <div className="h-10 bg-surface-container rounded-lg" />
                <div className="h-10 bg-surface-container rounded-lg" />
              </div>
              <div className="h-8 bg-surface-container rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Bus Cards Container */}
      {!isLoading && filteredPlans.length > 0 && (
        <div className="flex flex-col gap-3.5 px-4 mt-2">
          {filteredPlans.map((opt, i) => {
            const totalMin = opt.totalMinutes || opt.minutes || 15;
            const isDirect = (opt.transferCount != null ? opt.transferCount : opt.legs.length - 1) === 0;
            const primaryLeg = opt.legs[0];
            const primaryRouteId = primaryLeg?.routeId || primaryLeg?.id || '4';
            const routeCode = primaryLeg?.routeCode || primaryLeg?.code || `Route ${primaryRouteId}`;
            const isFastest = i === 0;
            const isElectric = opt.legs.some(l => /pm|electric|e-bus/i.test(l.agency || l.code || ''));
            const isAlarmSet = alarms.has(i);
            const isStopsExpanded = expandedStops.has(i);

            // Dep & Arr Times from API plan
            const times = getDepartureInfo(opt, i);
            const stopsCount = opt.legs.reduce((acc, l) => acc + (l.stopsCount || 4), 0);
            const distanceEst = (stopsCount * 0.75).toFixed(1);

            // UPCOMING LIVE BUSES ONLY (Buses that have NOT passed the boarding stop!)
            const allUpcomingBuses = primaryLeg?.upcomingBuses || [];
            const nextUpcomingBus = primaryLeg?.nextUpcomingBus || allUpcomingBuses[0] || null;
            const hasUpcomingBus = allUpcomingBuses.length > 0;
            const recentlyDepartedBus = primaryLeg?.departedBuses?.[0] || null;
            const isServiceClosed = Boolean(opt.isServiceClosed || tripPlan?.isServiceClosed);

            return (
              <article
                key={i}
                className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 p-4 relative overflow-hidden flex flex-col gap-3.5 hover:border-primary/40 transition-colors"
              >
                {/* Top Badges & Alarm Bar */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-primary text-on-primary font-bold text-xs px-2.5 py-1 rounded-lg tracking-wide shadow-2xs">
                      {routeCode}
                    </span>
                    <span className="text-xs font-semibold text-on-surface-variant">
                      {primaryLeg?.agency || 'PM e-Bus'}
                    </span>

                    {/* Highlights: FASTEST / ELECTRIC / FREQUENT */}
                    {isFastest ? (
                      <span className="bg-secondary-fixed text-on-secondary-fixed text-[10.5px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping" />
                        {lang === 'hi' ? 'सबसे तेज (FASTEST)' : 'FASTEST'}
                      </span>
                    ) : isElectric ? (
                      <span className="bg-secondary-container text-on-secondary-container text-[10.5px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                        <span className="material-symbols-outlined text-[13px]">bolt</span>
                        {lang === 'hi' ? 'स्मार्ट ई-बस' : 'Smart E-Bus (AC)'}
                      </span>
                    ) : (
                      <span className="bg-surface-container-high text-on-surface-variant text-[10.5px] px-2 py-0.5 rounded-full font-bold">
                        {lang === 'hi' ? 'हर 15 मिनट' : 'Every 15 Mins'}
                      </span>
                    )}

                    {!isDirect && (
                      <span className="bg-surface-container text-primary text-[10.5px] px-2 py-0.5 rounded-full font-bold">
                        {lang === 'hi' ? '1 ट्रांसफर' : '1 Transfer'}
                      </span>
                    )}
                  </div>

                  {/* Alarm Bell Action */}
                  <button
                    type="button"
                    aria-label="Set Stop Arrival Alarm"
                    onClick={() => toggleAlarm(i, routeCode)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                      isAlarmSet
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container text-on-surface-variant hover:text-primary'
                    }`}
                    title={isAlarmSet ? 'Alarm Active' : 'Set Arrival Alarm'}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {isAlarmSet ? 'notifications_active' : 'notifications_none'}
                    </span>
                  </button>
                </div>

                {/* Schedule Matrix (Where Is My Train bold readable timing) */}
                <div className="grid grid-cols-3 items-center py-1">
                  {/* Departure */}
                  <div className="flex flex-col">
                    <span className="text-[26px] font-black text-on-surface tracking-tight leading-none">
                      {times.dep.time}
                    </span>
                    <span className="text-[11px] font-bold text-secondary mt-1">
                      {times.dep.ampm} • Stand {primaryRouteId}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium truncate mt-0.5">
                      {origin}
                    </span>
                  </div>

                  {/* Journey Duration & Graphical Divider */}
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[11px] font-bold text-on-surface-variant">
                      {totalMin} mins
                    </span>
                    <div className="w-full flex items-center my-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      <div className="flex-1 h-0.5 bg-primary-fixed-dim relative flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-[14px] absolute bg-surface-container-lowest px-0.5">
                          directions_bus
                        </span>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-secondary flex-shrink-0" />
                    </div>
                    <span className="text-[10px] text-outline font-medium">
                      {distanceEst} km • {stopsCount} stops
                    </span>
                  </div>

                  {/* Arrival */}
                  <div className="flex flex-col items-end text-right">
                    <span className="text-[26px] font-black text-on-surface tracking-tight leading-none">
                      {times.arr.time}
                    </span>
                    <span className="text-[11px] font-bold text-on-surface mt-1">
                      {times.arr.ampm}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium truncate mt-0.5">
                      {destination}
                    </span>
                  </div>
                </div>

                {/* Live Telemetry Status Banner (Only shows genuinely UPCOMING buses) */}
                <div className={`rounded-xl p-2.5 flex flex-col gap-2 border ${
                  hasUpcomingBus
                    ? 'bg-secondary-container/25 border-secondary-container/40'
                    : isServiceClosed
                    ? 'bg-error-container/20 border-error/20'
                    : 'bg-surface-container-low border-outline-variant/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        hasUpcomingBus ? 'bg-secondary animate-pulse' : isServiceClosed ? 'bg-error' : 'bg-outline'
                      }`} />
                      <div className="truncate">
                        {hasUpcomingBus ? (
                          <>
                            <p className="text-xs font-bold text-on-secondary-container truncate flex items-center gap-1.5">
                              <span className="text-secondary font-black">
                                {lang === 'hi' ? `आने वाली बस (${allUpcomingBuses.length}):` : `Upcoming (${allUpcomingBuses.length}):`}
                              </span>
                              <span>{nextUpcomingBus.plate}</span>
                              <span className="px-1.5 py-0.2 rounded bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold">
                                {nextUpcomingBus.speed > 0 ? `${nextUpcomingBus.speed} km/h` : (lang === 'hi' ? 'स्टॉप' : 'Halt')}
                              </span>
                            </p>
                            <p className="text-[10.5px] text-secondary font-bold truncate mt-0.5">
                              📍 {nextUpcomingBus.isAtStop
                                ? (lang === 'hi' ? 'अभी आपके स्टॉप पर है (At Stop Now)' : 'At your stop now')
                                : `${nextUpcomingBus.stopsAway} ${lang === 'hi' ? 'स्टॉप दूर' : 'stops away'} (${nextUpcomingBus.nearStop.name || nextUpcomingBus.nearStop.english}) • ~${nextUpcomingBus.etaMinutes} ${t('minutes')}`}
                            </p>
                          </>
                        ) : isServiceClosed ? (
                          <>
                            <p className="text-xs font-bold text-error truncate">
                              {lang === 'hi' ? '🌙 रात्रि में बस सेवा बंद है' : '🌙 Night Service Closed'}
                            </p>
                            <p className="text-[10.5px] text-on-surface-variant font-medium truncate mt-0.5">
                              {lang === 'hi'
                                ? `रात 9:30 से सुबह 6:30 तक सेवा बंद • पहली बस ${times.dep.time} ${times.dep.ampm}`
                                : `Closed 9:30 PM – 6:30 AM • Next morning bus ${times.dep.time} ${times.dep.ampm}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-bold text-on-surface truncate">
                              {lang === 'hi' ? 'अगली निर्धारित बस (Next Scheduled Bus)' : 'Next Scheduled Bus'}
                            </p>
                            <p className="text-[10.5px] text-on-surface-variant font-medium truncate mt-0.5">
                              {lang === 'hi' ? 'नियमित बस सेवा (हर 15-20 मिनट में) • समय पर' : 'Regular Service (Every 15-20 mins) • On Time'}
                              {recentlyDepartedBus && (
                                <span className="text-outline ml-1.5 font-normal">
                                  ({lang === 'hi' ? `पिछली बस निकल चुकी है` : `Past bus departed`})
                                </span>
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 pl-2">
                      <span className="text-sm font-black text-on-surface">₹10 - ₹20</span>
                      <span className="block text-[10px] text-secondary font-bold">Pass / UPI</span>
                    </div>
                  </div>

                  {/* All Upcoming Buses on this Route in User's Direction */}
                  {hasUpcomingBus && allUpcomingBuses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-secondary-container/30">
                      {allUpcomingBuses.map((bus) => (
                        <Link
                          key={bus.id}
                          href={`/track?route=${primaryRouteId}&bus=${bus.id}&dir=${primaryLeg?.isReverse ? 'reverse' : 'forward'}&from=${primaryLeg?.fromStop?.id ?? ''}&to=${primaryLeg?.toStop?.id ?? ''}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-lowest hover:bg-primary hover:text-on-primary border border-outline-variant/40 text-on-surface font-bold text-[10.5px] transition-all shadow-2xs group"
                        >
                          <span className="material-symbols-outlined text-[13px] text-primary group-hover:text-on-primary">directions_bus</span>
                          <span>{bus.plate}</span>
                          <span className="px-1 py-0.2 rounded bg-secondary-fixed text-on-secondary-fixed text-[9.5px] font-extrabold">
                            {bus.isAtStop ? (lang === 'hi' ? 'यहीं है' : 'Here') : `~${bus.etaMinutes}m`}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons: Big Live Track CTA + Stops Accordion Toggle */}
                <div className="flex items-center gap-2 pt-0.5">
                  <Link
                    href={`/track?route=${primaryRouteId}${nextUpcomingBus ? `&bus=${nextUpcomingBus.id}` : ''}&dir=${primaryLeg?.isReverse ? 'reverse' : 'forward'}&from=${primaryLeg?.fromStop?.id ?? ''}&to=${primaryLeg?.toStop?.id ?? ''}`}
                    className="flex-1 h-11 bg-secondary hover:bg-secondary/90 active:scale-[0.98] text-on-secondary rounded-xl flex items-center justify-center gap-2 font-bold text-xs shadow-xs transition-all"
                  >
                    <span className="material-symbols-outlined text-[19px]">near_me</span>
                    <span>
                      {hasUpcomingBus
                        ? (lang === 'hi' ? `लाइव ट्रैक करें (${nextUpcomingBus.plate})` : `Track Live (${nextUpcomingBus.plate})`)
                        : (lang === 'hi' ? 'लाइव देखें / Live Track' : 'Live Track Route')}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => toggleStopsAccordion(i)}
                    className="h-11 px-3.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl flex items-center justify-center font-bold text-xs gap-1 transition-colors"
                    title="View Intermediate Stops"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {isStopsExpanded ? 'expand_less' : 'info'}
                    </span>
                    <span>{isStopsExpanded ? (lang === 'hi' ? 'बंद' : 'Hide') : (lang === 'hi' ? 'स्टॉप्स' : 'Stops')}</span>
                  </button>
                </div>

                {/* Stops Sequence Accordion (Expandable) */}
                {isStopsExpanded && (
                  <div className="mt-2 pt-3 border-t border-outline-variant/30 flex flex-col gap-2 animate-fadeIn">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {lang === 'hi' ? 'रूट के सभी स्टॉप्स (Stop Sequence)' : 'Route Stop Sequence'}
                    </span>
                    <div className="flex flex-col pl-2 border-l-2 border-primary/30 ml-2 py-1 gap-2.5">
                      {primaryLeg.stopSequence && primaryLeg.stopSequence.length > 0 ? (
                        primaryLeg.stopSequence.map((s, sIdx) => {
                          const isStart = sIdx === 0;
                          const isEnd = sIdx === primaryLeg.stopSequence.length - 1;
                          return (
                            <div key={s.id || sIdx} className="flex items-center gap-2 text-xs">
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 -ml-[13px] ${
                                  isStart
                                    ? 'bg-secondary ring-4 ring-secondary-fixed/40'
                                    : isEnd
                                    ? 'bg-tertiary ring-4 ring-tertiary-fixed/40'
                                    : 'bg-primary'
                                }`}
                              />
                              <span className={`font-semibold ${isStart || isEnd ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}>
                                {lang === 'hi' ? (s.name || s.english) : (s.english || s.name)}
                              </span>
                              {isStart && <span className="text-[10px] font-bold text-secondary uppercase">(Boarding)</span>}
                              {isEnd && <span className="text-[10px] font-bold text-tertiary uppercase">(Destination)</span>}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-on-surface-variant">
                          {origin} ➔ {destination} ({stopsCount} stops)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredPlans.length === 0 && !planError && (
        <div className="p-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[36px] text-outline">bus_alert</span>
          <span className="font-bold text-sm">
            {lang === 'hi' ? 'इस फ़िल्टर के साथ कोई बस नहीं मिली' : 'No buses match this filter'}
          </span>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className="text-primary font-bold text-xs underline mt-1"
          >
            {lang === 'hi' ? 'सभी बसें देखें' : 'Reset Filters to All'}
          </button>
        </div>
      )}

      {/* Offline & Low Connectivity Micro-Banner (Signature 'Where Is My Train' reliability promise) */}
      <section className="mt-5 mx-4 bg-surface-container-low rounded-2xl p-4 flex items-center gap-3 border border-outline-variant/20 shadow-2xs">
        <div className="w-10 h-10 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary flex-shrink-0">
          <span className="material-symbols-outlined text-[22px]">offline_bolt</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-xs text-on-surface leading-tight">
            {lang === 'hi' ? 'बिना इंटरनेट भी चलेगा (Works Offline)' : 'Works without Internet'}
          </span>
          <span className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
            {lang === 'hi'
              ? 'उदयपुर की गलियों में कमजोर नेटवर्क होने पर भी अगलीबस ऑफलाइन समय-सारणी का उपयोग करती है।'
              : 'AgliBus uses offline timetables and local cell towers when GPS network is low in Udaipur lanes.'}
          </span>
        </div>
      </section>

      {/* Community / Commuter Tip Pill */}
      <div className="mx-4 mt-3 p-2.5 bg-surface-container-high/60 rounded-xl flex items-center justify-center gap-1.5 text-on-surface-variant text-center">
        <span className="material-symbols-outlined text-[16px] text-primary flex-shrink-0">campaign</span>
        <span className="text-[11px] font-semibold">
          {lang === 'hi'
            ? 'चेतक सर्कल और सूरजपोल पर सुबह व शाम पीक समय पर पीएम ई-बसें उच्च फ्रीक्वेंसी में उपलब्ध हैं।'
            : 'Peak rush at Chetak Circle expected during office hours • Frequency enhanced on PM routes.'}
        </span>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-on-surface-variant font-bold text-sm">
          Loading bus search...
        </div>
      }
    >
      <SearchResultsContent />
    </Suspense>
  );
}
