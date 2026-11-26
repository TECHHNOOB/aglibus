'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

const JourneyMap = dynamic(() => import('@/components/JourneyMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[280px] bg-surface-container-low rounded-2xl animate-pulse flex items-center justify-center text-xs font-bold text-on-surface-variant">
      Loading Udaipur Route Map...
    </div>
  ),
});

function formatDisplayQuery(val) {
  if (!val) return '';
  const m = String(val).match(/^(?:loc:|@)?-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\|\s*(.+)$/i);
  return m ? m[1] : val;
}

function formatAccessGuidance(seg, lang, getStopDisplayName) {
  if (!seg) return '';
  const targetName = seg.toStop ? getStopDisplayName(seg.toStop) : getStopDisplayName(seg.to);
  const distText = seg.distanceMeters >= 1000 ? `${(seg.distanceMeters / 1000).toFixed(1)} km` : `${seg.distanceMeters}m`;
  const dirText = lang === 'hi' ? (seg.direction?.hi || '') : (seg.direction?.en || '');
  if (lang === 'hi') {
    if (seg.mode === 'walk') {
      return `${targetName} तक पैदल जाएँ (${distText} ${dirText} • ~${seg.walkMinutes} मिनट)`;
    }
    if (seg.mode === 'walk_or_auto') {
      return `${targetName} पहुँचें (${distText} ${dirText} • ~${seg.walkMinutes} मिनट पैदल या ~${seg.autoMinutes} मिनट ऑटो)`;
    }
    return `${targetName} तक ऑटो / ई-रिक्शा लें (${distText} ${dirText} • ~${seg.autoMinutes} मिनट)`;
  }
  if (seg.mode === 'walk') {
    return `Walk ${distText} ${dirText} to ${targetName} (~${seg.walkMinutes} min walk)`;
  }
  if (seg.mode === 'walk_or_auto') {
    return `Reach ${targetName} (${distText} ${dirText} • ~${seg.walkMinutes}m walk or ~${seg.autoMinutes}m auto)`;
  }
  return `Take Auto / E-Rickshaw ${distText} ${dirText} to ${targetName} (~${seg.autoMinutes} mins)`;
}

function SearchResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t, getStopDisplayName } = useLanguage();

  const paramFrom = searchParams.get('from');
  const paramTo = searchParams.get('to');

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [tripPlan, setTripPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [planError, setPlanError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'electric' | 'next30' | 'direct'
  const [alarms, setAlarms] = useState(new Set());
  const [expandedStops, setExpandedStops] = useState(new Set());
  const [toastMessage, setToastMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [allStops, setAllStops] = useState([]);
  const [suggestions, setSuggestions] = useState({ field: null, stops: [], places: [] });

  // Interactive free Udaipur journey map state
  const [showMap, setShowMap] = useState(false);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const geocodeTimerRef = useRef(null);
  const mapSectionRef = useRef(null);

  useEffect(() => {
    async function fetchStops() {
      try {
        const res = await fetch('/api/stops');
        if (res.ok) setAllStops(await res.json());
      } catch (e) {
        console.error('Failed to load stops:', e);
      }
    }
    fetchStops();
  }, []);

  useEffect(() => {
    const savedFrom = paramFrom || (typeof window !== 'undefined' ? sessionStorage.getItem('aglibus_search_from') : '') || (lang === 'hi' ? 'चेटक सर्कल' : 'Chetak Circle');
    const savedTo = paramTo || (typeof window !== 'undefined' ? sessionStorage.getItem('aglibus_search_to') : '') || (lang === 'hi' ? 'सुखाड़िया सर्कल' : 'Sukhadia Circle');

    setOrigin(formatDisplayQuery(savedFrom));
    setDestination(formatDisplayQuery(savedTo));
    setOriginQuery(savedFrom);
    setDestQuery(savedTo);

    async function loadPlan(fromVal, toVal) {
      if (!fromVal?.trim() || !toVal?.trim()) return;
      setIsLoading(true);
      setPlanError('');
      setSelectedPlanIdx(0);
      try {
        const res = await fetch(`/api/plan?from=${encodeURIComponent(fromVal)}&to=${encodeURIComponent(toVal)}`);
        const data = await res.json();
        if (!res.ok) {
          setPlanError(data.error || (lang === 'hi' ? 'कोई सीधा रूट नहीं मिला' : 'No route found'));
          setTripPlan(null);
        } else {
          setTripPlan(data);
          // Show the interactive free Udaipur map automatically when any transit plans exist
          setShowMap(Boolean(data.plans?.length > 0 || !data.hasDirectBus || data.from?.isCustomPlace || data.to?.isCustomPlace));

          if (typeof window !== 'undefined') {
            sessionStorage.setItem('aglibus_search_from', fromVal);
            sessionStorage.setItem('aglibus_search_to', toVal);
            sessionStorage.setItem('aglibus_search_plan', JSON.stringify({ ...data, fetchedAt: Date.now() }));
          }
        }
      } catch {
        setPlanError(lang === 'hi' ? 'रूट खोजने में त्रुटि हुई' : 'Network error while planning trip');
        setTripPlan(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadPlan(savedFrom, savedTo);
  }, [paramFrom, paramTo, lang]);

  const handleSwap = () => {
    const fQ = originQuery || origin;
    const dQ = destQuery || destination;
    router.push(`/search?from=${encodeURIComponent(dQ)}&to=${encodeURIComponent(fQ)}`);
  };

  const toggleAlarm = (planKey, routeCode) => {
    setAlarms(prev => {
      const next = new Set(prev);
      if (next.has(planKey)) {
        next.delete(planKey);
        showToast(lang === 'hi' ? `${routeCode} के लिए अलार्म हटाया गया` : `Alarm removed for ${routeCode}`);
      } else {
        next.add(planKey);
        showToast(lang === 'hi' ? `🔔 ${routeCode} के आगमन का अलार्म सेट किया गया!` : `🔔 Arrival alarm set for ${routeCode}!`);
        if (typeof window !== 'undefined' && window.navigator?.vibrate) {
          window.navigator.vibrate(50);
        }
      }
      return next;
    });
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const toggleStopsAccordion = (idx) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleInputChange = (field, value) => {
    if (field === 'origin') {
      setOrigin(value);
      setOriginQuery(value);
    } else {
      setDestination(value);
      setDestQuery(value);
    }

    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);

    if (value.trim().length > 1) {
      const q = value.toLowerCase().trim().replace(/partap/g, 'pratap');
      const noSpaceQ = q.replace(/\s+/g, '');
      const localStops = allStops.filter(s => {
        const hi = (s.name || '').toLowerCase();
        const en = (s.english || '').toLowerCase();
        const combined = `${hi} ${en}`.replace(/\s+/g, '');
        if (hi.includes(q) || en.includes(q) || combined.includes(noSpaceQ)) return true;
        if (q.includes('city') && (hi.includes('सिटी') || en.includes('udaipur railway'))) return true;
        return false;
      }).slice(0, 5);

      setSuggestions({ field, stops: localStops, places: [] });

      geocodeTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(value.trim())}`);
          if (res.ok) {
            const data = await res.json();
            setSuggestions(prev => {
              if (prev.field !== field) return prev;
              return {
                field,
                stops: data.stops?.length ? data.stops : localStops,
                places: data.places || [],
              };
            });
          }
        } catch {}
      }, 250);
    } else {
      setSuggestions({ field: null, stops: [], places: [] });
    }
  };

  const selectSuggestion = (field, item, kind = 'stop') => {
    const displayName = getStopDisplayName(item);
    const qVal = kind === 'place' ? item.id : displayName;
    if (field === 'origin') {
      setOrigin(displayName);
      setOriginQuery(qVal);
    } else {
      setDestination(displayName);
      setDestQuery(qVal);
    }
    setSuggestions({ field: null, stops: [], places: [] });
  };

  const applyStopEdit = () => {
    setIsEditing(false);
    router.push(`/search?from=${encodeURIComponent(originQuery || origin)}&to=${encodeURIComponent(destQuery || destination)}`);
  };

  const getDepartureInfo = (opt, idx) => {
    if (opt.departureTime && opt.arrivalTime) {
      return {
        dep: opt.departureTime,
        arr: opt.arrivalTime,
        depMinutesFromNow: opt.departureMinutes || 10,
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
      depMinutesFromNow,
    };
  };

  const todayFormatted = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', { day: 'numeric', month: 'short' });
  }, [lang]);

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

  const activeMapPlan = filteredPlans[selectedPlanIdx] || filteredPlans[0] || null;

  const headerMeta = useMemo(() => {
    if (!tripPlan || !tripPlan.plans || tripPlan.plans.length === 0) {
      return { stops: 0, dist: tripPlan?.originDestDistanceMeters ? (tripPlan.originDestDistanceMeters / 1000).toFixed(1) : '—', freq: lang === 'hi' ? 'नज़दीकी स्टॉप सुझाव' : 'Nearby Stop Options' };
    }
    const firstPlan = tripPlan.plans[0];
    const totalStops = firstPlan.legs.reduce((acc, l) => acc + (l.stopsCount || 4), 0);
    const distEst = tripPlan.originDestDistanceMeters ? (tripPlan.originDestDistanceMeters / 1000).toFixed(1) : (totalStops * 0.7).toFixed(1);
    const isDirect = (firstPlan.transferCount != null ? firstPlan.transferCount : firstPlan.legs.length - 1) === 0;
    const freq = firstPlan.planKind === 'nearby_direct'
      ? (lang === 'hi' ? 'पास के स्टॉप से सीधी बस' : 'Direct via Nearby Stop')
      : isDirect
      ? (lang === 'hi' ? 'सीधा रूट' : 'Direct Bus Route')
      : (lang === 'hi' ? '1 ट्रांसफर रूट' : '1 Transfer Route');
    return { stops: totalStops, dist: distEst, freq };
  }, [tripPlan, lang]);

  const originLabel = tripPlan?.from ? getStopDisplayName(tripPlan.from) : origin;
  const destLabel = tripPlan?.to ? getStopDisplayName(tripPlan.to) : destination;

  const handleOpenPlanOnMap = (idx) => {
    setSelectedPlanIdx(idx);
    setShowMap(true);
    setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleSearchFromHubStop = (hub) => {
    const toVal = tripPlan?.to?.id ?? (destQuery || destination);
    router.push(`/search?from=${encodeURIComponent(hub.id)}&to=${encodeURIComponent(toVal)}`);
  };

  return (
    <div className="flex flex-col w-full pb-8 bg-surface min-h-[calc(100vh-8rem)]">
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[18px] text-secondary-fixed">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Row */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-outline-variant/30 bg-surface/90 backdrop-blur-md">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>{lang === 'hi' ? 'होम पेज' : 'Back to Home'}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMap(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
              showMap ? 'bg-secondary text-on-secondary' : 'bg-primary-fixed text-on-primary-fixed hover:bg-primary/15'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">map</span>
            <span>{showMap ? (lang === 'hi' ? 'मैप छुपाएं' : 'Hide Map') : (lang === 'hi' ? 'उदयपुर मैप' : 'Udaipur Map')}</span>
          </button>
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

      {/* Inline Stop Edit Form */}
      {isEditing && (
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/30 flex flex-col gap-3 animate-fadeIn">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {t('from')}
              </label>
              <input
                type="text"
                value={origin}
                onChange={(e) => handleInputChange('origin', e.target.value)}
                placeholder={lang === 'hi' ? 'प्रस्थान स्टॉप या स्थान...' : 'Boarding stop or Udaipur place...'}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
              />
              {suggestions.field === 'origin' && (suggestions.stops.length > 0 || suggestions.places.length > 0) && (
                <div className="absolute top-full left-0 right-0 z-40 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden max-h-56 overflow-y-auto">
                  {suggestions.stops.map((s) => (
                    <button
                      key={`es-${s.id}`}
                      type="button"
                      onClick={() => selectSuggestion('origin', s, 'stop')}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b border-outline-variant/20"
                    >
                      <span>{getStopDisplayName(s)}</span>
                      <span className="text-[10px] text-primary font-bold">Bus Stop</span>
                    </button>
                  ))}
                  {suggestions.places.map((p) => (
                    <button
                      key={`ep-${p.id}`}
                      type="button"
                      onClick={() => selectSuggestion('origin', p, 'place')}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span>{p.english}</span>
                      <span className="text-[10px] text-secondary font-bold">Udaipur Place</span>
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
                placeholder={lang === 'hi' ? 'गंतव्य स्टॉप या स्थान...' : 'Destination stop or Udaipur place...'}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
              />
              {suggestions.field === 'destination' && (suggestions.stops.length > 0 || suggestions.places.length > 0) && (
                <div className="absolute top-full left-0 right-0 z-40 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden max-h-56 overflow-y-auto">
                  {suggestions.stops.map((s) => (
                    <button
                      key={`ds-${s.id}`}
                      type="button"
                      onClick={() => selectSuggestion('destination', s, 'stop')}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b border-outline-variant/20"
                    >
                      <span>{getStopDisplayName(s)}</span>
                      <span className="text-[10px] text-primary font-bold">Bus Stop</span>
                    </button>
                  ))}
                  {suggestions.places.map((p) => (
                    <button
                      key={`dp-${p.id}`}
                      type="button"
                      onClick={() => selectSuggestion('destination', p, 'place')}
                      className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span>{p.english}</span>
                      <span className="text-[10px] text-secondary font-bold">Udaipur Place</span>
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

      {/* Search Summary Header Card */}
      <section className="bg-primary text-on-primary px-4 py-3.5 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary-container flex-shrink-0" />
              <div className="truncate">
                <span className="font-extrabold text-[15px] tracking-tight">{originLabel}</span>
                {tripPlan?.from && !tripPlan.from.isCustomPlace && (
                  <span className="text-[11px] text-primary-fixed opacity-90 ml-1.5 font-medium">
                    ({lang === 'hi' ? tripPlan.from.english : tripPlan.from.name})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center pl-1 my-0.5">
              <div className="w-0.5 h-4 bg-primary-fixed-dim/40 ml-[3px]" />
              <span className="text-[10.5px] font-semibold text-primary-fixed-dim ml-3.5">
                {headerMeta.dist} km • {headerMeta.stops} Stops • {headerMeta.freq}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary-fixed flex-shrink-0" />
              <div className="truncate">
                <span className="font-extrabold text-[15px] tracking-tight">{destLabel}</span>
                {tripPlan?.to && !tripPlan.to.isCustomPlace && (
                  <span className="text-[11px] text-primary-fixed opacity-90 ml-1.5 font-medium">
                    ({lang === 'hi' ? tripPlan.to.english : tripPlan.to.name})
                  </span>
                )}
              </div>
            </div>
          </div>

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

        <div className="mt-3 pt-2.5 border-t border-primary-fixed-dim/20 flex items-center justify-between text-on-primary-container">
          <div className="flex items-center gap-1.5 text-[11px] font-bold bg-on-primary/15 px-2.5 py-1 rounded-full">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            <span>{lang === 'hi' ? `आज (Today), ${todayFormatted}` : `Today, ${todayFormatted}`}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-primary-fixed">
            <span className="w-2 h-2 rounded-full bg-secondary-fixed animate-pulse" />
            <span>{lang === 'hi' ? 'लाइव जीपीएस + उदयपुर मैप' : 'Live GPS + Udaipur Map'}</span>
          </div>
        </div>
      </section>

      {/* Direct vs No-Direct / Nearby Stop Status Banner */}
      {!isLoading && tripPlan && (
        <section className="px-4 pt-3">
          {tripPlan.hasDirectBus ? (
            <div className="p-3 rounded-2xl bg-secondary-container/35 border border-secondary/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">check_circle</span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-on-surface">
                    {lang === 'hi' ? 'सीधी बस उपलब्ध है (Direct Bus Available)' : 'Direct Bus Available'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant font-medium truncate">
                    {lang === 'hi'
                      ? `${originLabel} से सीधे ${destLabel} जाने वाली बस नीचे देखें`
                      : `Direct city buses run between ${originLabel} and ${destLabel}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMap(prev => !prev)}
                className="px-2.5 py-1.5 rounded-xl bg-secondary text-on-secondary text-[11px] font-bold shrink-0 flex items-center gap-1 active:scale-95"
              >
                <span className="material-symbols-outlined text-[14px]">map</span>
                <span>{showMap ? (lang === 'hi' ? 'छुपाएं' : 'Hide') : (lang === 'hi' ? 'मैप देखें' : 'View Map')}</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined text-amber-700 text-[20px] shrink-0 mt-0.5">
                    {tripPlan.plannerMode === 'location_to_nearest_stop' ? 'explore' : 'alt_route'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-amber-950">
                      {tripPlan.plannerMode === 'location_to_nearest_stop'
                        ? (lang === 'hi'
                          ? `नज़दीकी बस स्टॉप से यात्रा सुझाव (${originLabel} ➔ ${destLabel})`
                          : `Suggested Route via Nearest Udaipur Bus Stop`)
                        : (lang === 'hi'
                          ? `${originLabel} से ${destLabel} के लिए सीधी बस नहीं है`
                          : `No Direct Bus from ${originLabel} to ${destLabel}`)}
                    </p>
                    <p className="text-[11px] text-amber-900 font-medium mt-0.5 leading-snug">
                      {tripPlan.hasNearbyDirectBus
                        ? (lang === 'hi'
                          ? 'नीचे बताया गया है कि किस नज़दीकी बस स्टॉप पर कैसे पहुँचें (पैदल/ऑटो) जहाँ से सीधी बस मिलेगी, या ट्रांसफर विकल्प चुनें।'
                          : 'See below how to reach the nearest bus stop for a direct bus, or take a 1-transfer connecting bus.')
                        : (lang === 'hi'
                          ? 'नीचे दिए गए 1-ट्रांसफर बस रूट या नज़दीकी बस स्टॉप से यात्रा करें।'
                          : 'Take a 1-transfer connecting bus below or head to one of the nearest bus stops shown.')}
                    </p>
                  </div>
                </div>
              </div>
              {tripPlan.isShortWalk && tripPlan.originDestDistanceMeters && (
                <div className="mt-1 px-2.5 py-1.5 rounded-xl bg-white/80 border border-amber-200 text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-amber-700">directions_walk</span>
                  <span>
                    {lang === 'hi'
                      ? `ये दोनों स्थान केवल ~${tripPlan.originDestDistanceMeters}m दूर हैं (~${Math.max(1, Math.round(tripPlan.originDestDistanceMeters / 75))} मिनट पैदल)`
                      : `Both places are only ~${tripPlan.originDestDistanceMeters}m apart (~${Math.max(1, Math.round(tripPlan.originDestDistanceMeters / 75))} min walk)`}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Interactive Free Udaipur Journey Map */}
      {!isLoading && showMap && tripPlan && (
        <section ref={mapSectionRef} className="px-4 pt-3 flex flex-col gap-2 animate-fadeIn">
          <JourneyMap
            plan={activeMapPlan}
            from={tripPlan.from}
            to={tripPlan.to}
            nearbyHubs={tripPlan.nearbyBoardingHubs || []}
            lang={lang}
            onUseNearbyStop={handleSearchFromHubStop}
          />
          {activeMapPlan && (
            <div className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-[11px] font-semibold text-on-surface flex flex-wrap items-center gap-1.5">
              <span className="font-extrabold text-primary">
                {lang === 'hi' ? 'मार्ग निर्देश:' : 'Guide:'}
              </span>
              {activeMapPlan.accessSegment && (
                <span className="text-amber-800 font-bold">
                  1️⃣ {formatAccessGuidance(activeMapPlan.accessSegment, lang, getStopDisplayName)} ➔
                </span>
              )}
              {activeMapPlan.legs.map((lg, i) => (
                <span key={i} className="text-on-surface font-bold">
                  {activeMapPlan.accessSegment ? (i === 0 ? '2️⃣' : '3️⃣') : `${i + 1}️⃣`}{' '}
                  {lg.routeCode} ({getStopDisplayName(lg.fromStop)} ➔ {getStopDisplayName(lg.toStop)})
                  {i < activeMapPlan.legs.length - 1 ? ' ➔' : ''}
                </span>
              ))}
              {activeMapPlan.egressSegment && (
                <span className="text-amber-800 font-bold">
                  ➔ 🏁 {formatAccessGuidance(activeMapPlan.egressSegment, lang, getStopDisplayName)}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* Horizontal Filter Chips */}
      <section className="w-full overflow-x-auto py-2.5 px-4 mt-1 flex items-center gap-2 bg-surface-container-low shadow-xs no-scrollbar">
        {[
          { id: 'all', hi: 'सभी बसें (All)', en: 'All Buses' },
          { id: 'electric', hi: 'इलेक्ट्रिक बस (AC)', en: 'AC Electric', icon: 'bolt', iconColor: 'text-secondary' },
          { id: 'next30', hi: 'अगले 30 मिनट में', en: 'Next 30 Mins', icon: 'schedule', iconColor: 'text-primary' },
          { id: 'direct', hi: 'केवल सीधी बस (Direct)', en: 'Direct Only' },
        ].map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => {
              setActiveFilter(chip.id);
              setSelectedPlanIdx(0);
            }}
            className={`px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap flex items-center gap-1 active:scale-95 transition-all ${
              activeFilter === chip.id
                ? 'bg-primary-container text-on-primary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container'
            }`}
          >
            {chip.icon && <span className={`material-symbols-outlined text-[15px] ${chip.iconColor}`}>{chip.icon}</span>}
            <span>{lang === 'hi' ? chip.hi : chip.en}</span>
          </button>
        ))}
      </section>

      {/* Results Count Bar */}
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-[15px] text-on-surface">
            {isLoading ? (lang === 'hi' ? 'खोज रहे हैं...' : 'Searching...') : `${filteredPlans.length} ${lang === 'hi' ? 'विकल्प उपलब्ध' : 'Options Available'}`}
          </span>
        </div>
        <div className="flex items-center gap-1 text-secondary font-bold text-[11px]">
          <span className="material-symbols-outlined text-[16px]">cell_tower</span>
          <span>GPS + OSM Udaipur</span>
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
            const isNearbyDirect = opt.planKind === 'nearby_direct';
            const primaryLeg = opt.legs[0];
            const secondLeg = opt.legs[1] || null;
            const primaryRouteId = primaryLeg?.routeId || primaryLeg?.id || '4';
            const routeCode = opt.legs.map(l => l.routeCode || l.code || `Route ${l.routeId || l.id}`).join(' ➔ ');
            const isFastest = i === 0;
            const isAlarmSet = alarms.has(i);
            const isStopsExpanded = expandedStops.has(i);
            const isMapActive = showMap && selectedPlanIdx === i;

            const times = getDepartureInfo(opt, i);
            const stopsCount = opt.legs.reduce((acc, l) => acc + (l.stopsCount || 4), 0);
            const distanceEst = (stopsCount * 0.75).toFixed(1);

            const allUpcomingBuses = primaryLeg?.upcomingBuses || [];
            const nextUpcomingBus = primaryLeg?.nextUpcomingBus || allUpcomingBuses[0] || null;
            const hasUpcomingBus = allUpcomingBuses.length > 0;
            const recentlyDepartedBus = primaryLeg?.departedBuses?.[0] || null;
            const isServiceClosed = Boolean(opt.isServiceClosed || tripPlan?.isServiceClosed);
            const dirLabel = lang === 'en'
              ? (primaryLeg?.directionLabelEn || `Towards ${destLabel}`)
              : (primaryLeg?.directionLabel || `${destLabel} की ओर`);

            return (
              <article
                key={i}
                className={`bg-surface-container-lowest rounded-2xl shadow-sm border p-4 relative overflow-hidden flex flex-col gap-3 transition-colors ${
                  isMapActive
                    ? 'border-primary ring-2 ring-primary/20'
                    : hasUpcomingBus
                    ? 'border-secondary/40 hover:border-secondary'
                    : 'border-outline-variant/30 hover:border-primary/40'
                }`}
              >
                {/* Top Badges & Alarm Bar */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="bg-primary text-on-primary font-bold text-xs px-2.5 py-1 rounded-lg tracking-wide shadow-2xs">
                      {routeCode}
                    </span>

                    {hasUpcomingBus ? (
                      <span className="bg-secondary-fixed text-on-secondary-fixed text-[10.5px] px-2 py-0.5 rounded-full flex items-center gap-1 font-extrabold">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping" />
                        <span>Live GPS</span>
                      </span>
                    ) : opt.scheduleSource === 'gtfs' ? (
                      <span className="bg-primary-fixed text-on-primary-fixed text-[10.5px] px-2 py-0.5 rounded-full flex items-center gap-1 font-extrabold">
                        <span className="material-symbols-outlined text-[12px]">event_note</span>
                        <span>GTFS Estimated</span>
                      </span>
                    ) : (
                      <span className="bg-surface-container-high text-on-surface-variant text-[10.5px] px-2 py-0.5 rounded-full flex items-center gap-1 font-extrabold border border-outline-variant/40">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        <span>Estimated</span>
                      </span>
                    )}

                    {isNearbyDirect ? (
                      <span className="bg-amber-100 text-amber-900 text-[10.5px] px-2 py-0.5 rounded-full font-extrabold">
                        {lang === 'hi' ? 'पास के स्टॉप से सीधी बस' : 'Direct via Nearby Stop'}
                      </span>
                    ) : isDirect ? (
                      <span className="bg-secondary-container/40 text-on-secondary-container text-[10.5px] px-2 py-0.5 rounded-full font-bold">
                        {lang === 'hi' ? 'सीधी बस' : 'Direct'}
                      </span>
                    ) : (
                      <span className="bg-tertiary-container/40 text-on-tertiary-container text-[10.5px] px-2 py-0.5 rounded-full font-bold">
                        {lang === 'hi' ? '1 ट्रांसफर' : '1 Transfer'}
                      </span>
                    )}

                    {isFastest && (
                      <span className="bg-primary-fixed text-on-primary-fixed text-[10.5px] px-2 py-0.5 rounded-full font-bold">
                        {lang === 'hi' ? 'सबसे बेहतर' : 'BEST'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label="Set Stop Arrival Alarm"
                    onClick={() => toggleAlarm(i, routeCode)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                      isAlarmSet ? 'bg-primary text-on-primary shadow-xs' : 'bg-surface-container text-on-surface-variant hover:text-primary'
                    }`}
                    title={isAlarmSet ? 'Alarm Active' : 'Set Arrival Alarm'}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {isAlarmSet ? 'notifications_active' : 'notifications_none'}
                    </span>
                  </button>
                </div>

                {/* Step 1 Access Guide (When user needs to reach a nearby boarding stop!) */}
                {opt.accessSegment && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0 mt-0.5">
                        {opt.accessSegment.mode === 'auto' ? 'local_taxi' : 'directions_walk'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-extrabold text-amber-950 text-[11.5px]">
                          {lang === 'hi' ? 'कदम 1: नज़दीकी बस स्टॉप पहुँचें' : 'Step 1: Reach Nearby Bus Stop'}
                        </p>
                        <p className="text-amber-900 font-semibold text-[11px] leading-snug">
                          {formatAccessGuidance(opt.accessSegment, lang, getStopDisplayName)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearchFromHubStop(opt.accessSegment.toStop)}
                      className="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[10px] shrink-0 hover:bg-amber-100"
                    >
                      {lang === 'hi' ? 'यहीं से देखें' : 'From Here'}
                    </button>
                  </div>
                )}

                {/* Live / Scheduled Next Bus Box */}
                <div className={`rounded-xl p-3 flex flex-col gap-2 border ${
                  hasUpcomingBus
                    ? 'bg-secondary-container/25 border-secondary-container/50'
                    : isServiceClosed
                    ? 'bg-error-container/20 border-error/25'
                    : 'bg-surface-container-low border-outline-variant/30'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        hasUpcomingBus ? 'bg-secondary animate-pulse' : isServiceClosed ? 'bg-error' : 'bg-outline'
                      }`} />
                      <div className="min-w-0">
                        {hasUpcomingBus ? (
                          <>
                            <p className="text-xs sm:text-[13px] font-extrabold text-on-surface flex items-center gap-1.5 flex-wrap">
                              <span className="text-secondary">
                                {lang === 'hi' ? 'अगली बस:' : 'Next Bus:'}
                              </span>
                              <span>{nextUpcomingBus.plate}</span>
                              <span className="px-1.5 py-0.2 rounded bg-secondary text-on-secondary text-[10px] font-black">
                                {nextUpcomingBus.isAtStop
                                  ? (lang === 'hi' ? 'यहीं है!' : 'Here!')
                                  : `~${nextUpcomingBus.etaMinutes} ${t('minutes')}`}
                              </span>
                              <span className="text-[10.5px] font-semibold text-on-surface-variant">
                                ({nextUpcomingBus.speed > 0 ? `${nextUpcomingBus.speed} km/h` : (lang === 'hi' ? 'स्टॉप पर' : 'Halt')})
                              </span>
                            </p>
                            <p className="text-[11px] text-secondary font-bold truncate mt-0.5">
                              📍 {nextUpcomingBus.isAtStop
                                ? (lang === 'hi' ? `अभी ${getStopDisplayName(primaryLeg.fromStop)} पर है` : `At ${getStopDisplayName(primaryLeg.fromStop)} right now`)
                                : `${nextUpcomingBus.stopsAway} ${lang === 'hi' ? 'स्टॉप दूर' : 'stops away'} (${nextUpcomingBus.nearStop.name || nextUpcomingBus.nearStop.english}) • 🎯 ${dirLabel}`}
                            </p>
                          </>
                        ) : isServiceClosed ? (
                          <>
                            <p className="text-xs font-extrabold text-error truncate">
                              {lang === 'hi' ? '🌙 रात्रि में बस सेवा बंद है' : '🌙 Night Service Closed'}
                            </p>
                            <p className="text-[10.5px] text-on-surface-variant font-medium truncate mt-0.5">
                              {lang === 'hi'
                                ? `रात 9:30 से सुबह 6:30 तक बंद • पहली बस ${times.dep.time} ${times.dep.ampm}`
                                : `Closed 9:30 PM – 6:30 AM • First morning bus ${times.dep.time} ${times.dep.ampm}`}
                            </p>
                          </>
                        ) : opt.scheduleSource === 'gtfs' && opt.nextScheduledTimes?.length > 0 ? (
                          <>
                            <p className="text-xs font-extrabold text-on-surface truncate flex items-center gap-1.5">
                              <span className="text-primary">
                                {lang === 'hi' ? `📅 अगली बस (${opt.nextScheduledTimes[0]})` : `📅 Next Bus (${opt.nextScheduledTimes[0]})`}
                              </span>
                              <span className="text-[10px] text-on-surface-variant font-semibold">• Estimated</span>
                            </p>
                            <p className="text-[10.5px] text-on-surface-variant font-medium truncate mt-0.5">
                              {lang === 'hi' ? 'लाइव GPS नहीं • समय सारणी:' : 'No live GPS • Times:'} {opt.nextScheduledTimes.join(' • ')}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-extrabold text-on-surface truncate flex items-center gap-1.5">
                              <span>
                                {lang === 'hi' ? `🕒 अगली अनुमानित बस ~${times.dep.time} ${times.dep.ampm}` : `🕒 Next Estimated ~${times.dep.time} ${times.dep.ampm}`}
                              </span>
                            </p>
                            <p className="text-[10.5px] text-on-surface-variant font-medium truncate mt-0.5">
                              {lang === 'hi' ? `लाइव GPS उपलब्ध नहीं • हर ${primaryLeg?.headway || '15-20'} मिनट में • 🎯 ${dirLabel}` : `No live GPS • Every ${primaryLeg?.headway || '15-20'} mins • 🎯 ${dirLabel}`}
                              {recentlyDepartedBus && (
                                <span className="text-outline ml-1.5 font-normal">
                                  ({lang === 'hi' ? 'पिछली बस निकल चुकी' : 'Past bus left'})
                                </span>
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {hasUpcomingBus && allUpcomingBuses.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-secondary-container/30">
                      <span className="text-[10px] font-bold text-secondary uppercase mr-0.5">
                        {lang === 'hi' ? `आने वाली (${allUpcomingBuses.length}):` : `Incoming (${allUpcomingBuses.length}):`}
                      </span>
                      {allUpcomingBuses.map((bus) => (
                        <Link
                          key={bus.id}
                          href={`/track?route=${primaryRouteId}&bus=${bus.id}&dir=${primaryLeg?.isReverse ? 'reverse' : 'forward'}&from=${primaryLeg?.fromStop?.id ?? ''}&to=${primaryLeg?.toStop?.id ?? ''}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest hover:bg-primary hover:text-on-primary border border-outline-variant/40 text-on-surface font-bold text-[10.5px] transition-all shadow-2xs group"
                        >
                          <span className="material-symbols-outlined text-[13px] text-primary group-hover:text-on-primary">directions_bus</span>
                          <span>{bus.plate}</span>
                          <span className="px-1 py-0.2 rounded bg-secondary-fixed text-on-secondary-fixed text-[9.5px] font-extrabold">
                            {bus.isAtStop ? (lang === 'hi' ? 'यहीं' : 'Here') : `~${bus.etaMinutes}m`}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear 1-Transfer Instruction */}
                {!isDirect && secondLeg && (
                  <div className="px-3 py-2 rounded-xl bg-tertiary-container/20 border border-tertiary/20 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 font-bold text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-tertiary shrink-0">transfer_within_a_station</span>
                      <span className="truncate">
                        {lang === 'hi'
                          ? `${getStopDisplayName(primaryLeg.toStop || primaryLeg.to)} पर बदलें: ${primaryLeg.routeCode} ➔ ${secondLeg.routeCode}`
                          : `Change at ${getStopDisplayName(primaryLeg.toStop || primaryLeg.to)}: ${primaryLeg.routeCode} ➔ ${secondLeg.routeCode}`}
                      </span>
                    </div>
                    <span className="text-[10.5px] font-bold text-tertiary shrink-0">
                      {secondLeg.stopsCount} stops
                    </span>
                  </div>
                )}

                {/* Final Egress Guidance (when destination is off the alight stop) */}
                {opt.egressSegment && (
                  <div className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">flag</span>
                    <span>
                      {lang === 'hi'
                        ? `अंतिम चरण: ${getStopDisplayName(opt.egressSegment.fromStop)} पर उतरकर ${getStopDisplayName(opt.egressSegment.to)} पहुँचें (${opt.egressSegment.distanceMeters}m • ~${opt.egressSegment.mode === 'auto' ? `${opt.egressSegment.autoMinutes}m ऑटो` : `${opt.egressSegment.walkMinutes}m पैदल`})`
                        : `Final step: Alight at ${getStopDisplayName(opt.egressSegment.fromStop)}, then ${opt.egressSegment.distanceMeters}m (${opt.egressSegment.mode === 'auto' ? `~${opt.egressSegment.autoMinutes}m auto` : `~${opt.egressSegment.walkMinutes}m walk`}) to ${getStopDisplayName(opt.egressSegment.to)}`}
                    </span>
                  </div>
                )}

                {/* Schedule Matrix */}
                <div className="grid grid-cols-3 items-center py-0.5">
                  <div className="flex flex-col">
                    <span className="text-[24px] font-black text-on-surface tracking-tight leading-none">
                      {times.dep.time}
                    </span>
                    <span className="text-[11px] font-bold text-secondary mt-1">
                      {times.dep.ampm} • {primaryLeg?.agency || 'City Bus'}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium truncate mt-0.5">
                      {getStopDisplayName(primaryLeg?.fromStop || originLabel)}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[11px] font-bold text-on-surface-variant">
                      ~{totalMin} {t('minutes')}
                    </span>
                    <div className="w-full flex items-center my-1">
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

                  <div className="flex flex-col items-end text-right">
                    <span className="text-[24px] font-black text-on-surface tracking-tight leading-none">
                      {times.arr.time}
                    </span>
                    <span className="text-[11px] font-bold text-on-surface mt-1">
                      {times.arr.ampm} • ₹10–₹20
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium truncate mt-0.5">
                      {getStopDisplayName(opt.legs[opt.legs.length - 1]?.toStop || destLabel)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-0.5">
                  <Link
                    href={`/track?route=${primaryRouteId}${nextUpcomingBus ? `&bus=${nextUpcomingBus.id}` : ''}&dir=${primaryLeg?.isReverse ? 'reverse' : 'forward'}&from=${primaryLeg?.fromStop?.id ?? ''}&to=${primaryLeg?.toStop?.id ?? ''}`}
                    className={`flex-1 h-11 active:scale-[0.98] rounded-xl flex items-center justify-center gap-2 font-bold text-xs shadow-xs transition-all ${
                      hasUpcomingBus
                        ? 'bg-secondary hover:bg-secondary/90 text-on-secondary'
                        : 'bg-primary hover:bg-primary/95 text-on-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {hasUpcomingBus ? 'near_me' : 'alt_route'}
                    </span>
                    <span>
                      {hasUpcomingBus
                        ? (lang === 'hi' ? `लाइव ट्रैक करें (${nextUpcomingBus.plate})` : `Track Live (${nextUpcomingBus.plate})`)
                        : (lang === 'hi' ? 'रूट व समय देखें / Route Map' : 'View Route & Schedule')}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleOpenPlanOnMap(i)}
                    className={`h-11 px-3 rounded-xl flex items-center justify-center font-bold text-xs gap-1 transition-colors ${
                      isMapActive ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container hover:bg-surface-container-high text-primary'
                    }`}
                    title="Show journey path on Udaipur Map"
                  >
                    <span className="material-symbols-outlined text-[16px]">map</span>
                    <span>{lang === 'hi' ? 'मैप' : 'Map'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleStopsAccordion(i)}
                    className="h-11 px-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl flex items-center justify-center font-bold text-xs gap-1 transition-colors"
                    title="View Intermediate Stops"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {isStopsExpanded ? 'expand_less' : 'info'}
                    </span>
                    <span>{isStopsExpanded ? (lang === 'hi' ? 'बंद' : 'Hide') : (lang === 'hi' ? 'स्टॉप्स' : 'Stops')}</span>
                  </button>
                </div>

                {/* Stops Sequence Accordion */}
                {isStopsExpanded && (
                  <div className="mt-2 pt-3 border-t border-outline-variant/30 flex flex-col gap-3 animate-fadeIn">
                    {opt.legs.map((legItem, lIdx) => (
                      <div key={lIdx} className="flex flex-col gap-2">
                        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                          {opt.legs.length > 1
                            ? `${legItem.routeCode} (${getStopDisplayName(legItem.fromStop)} ➔ ${getStopDisplayName(legItem.toStop)})`
                            : (lang === 'hi' ? 'रूट के सभी स्टॉप्स (Stop Sequence)' : 'Route Stop Sequence')}
                        </span>
                        <div className="flex flex-col pl-2 border-l-2 border-primary/30 ml-2 py-1 gap-2">
                          {legItem.stopSequence && legItem.stopSequence.length > 0 ? (
                            legItem.stopSequence.map((s, sIdx) => {
                              const isStart = sIdx === 0;
                              const isEnd = sIdx === legItem.stopSequence.length - 1;
                              return (
                                <div key={`${lIdx}-${s.id || sIdx}`} className="flex items-center gap-2 text-xs">
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
                                  {isStart && <span className="text-[10px] font-bold text-secondary uppercase">(Board)</span>}
                                  {isEnd && <span className="text-[10px] font-bold text-tertiary uppercase">({lIdx === 0 && opt.legs.length > 1 ? 'Transfer' : 'Alight'})</span>}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-on-surface-variant">
                              {legItem.from} ➔ {legItem.to}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredPlans.length === 0 && !planError && (
        <div className="p-6 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[36px] text-outline">bus_alert</span>
          <span className="font-bold text-sm">
            {activeFilter !== 'all'
              ? (lang === 'hi' ? 'इस फ़िल्टर के साथ कोई बस नहीं मिली' : 'No buses match this filter')
              : (lang === 'hi' ? 'सीधा रूट नहीं मिला — नीचे नज़दीकी बस स्टॉप देखें' : 'No route matched — check nearest bus stops below')}
          </span>
          {activeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="text-primary font-bold text-xs underline mt-1"
            >
              {lang === 'hi' ? 'सभी बसें देखें' : 'Reset Filters to All'}
            </button>
          )}
        </div>
      )}

      {/* Nearest Boarding Stops Section (Shown whenever no exact direct bus OR custom location!) */}
      {!isLoading && tripPlan && !tripPlan.hasDirectBus && tripPlan.nearbyBoardingHubs?.length > 0 && (
        <section className="mx-4 mt-4 bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[19px]">signpost</span>
              <h2 className="font-extrabold text-[13.5px] text-on-surface">
                {lang === 'hi' ? `${originLabel} के पास मुख्य बस स्टॉप` : `Nearest Bus Stops Around ${originLabel}`}
              </h2>
            </div>
            <span className="text-[10.5px] font-bold text-secondary">
              {lang === 'hi' ? 'यहाँ से बस पकड़ें' : 'Board from here'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {tripPlan.nearbyBoardingHubs.slice(0, 4).map((hub) => {
              const distText = hub.distanceMeters >= 1000 ? `${(hub.distanceMeters / 1000).toFixed(1)} km` : `${hub.distanceMeters}m`;
              const dirText = lang === 'hi' ? (hub.direction?.hi || '') : (hub.direction?.en || '');
              const howToReach = hub.mode === 'auto'
                ? (lang === 'hi' ? `~${hub.autoMinutes}m ऑटो` : `~${hub.autoMinutes}m auto`)
                : (lang === 'hi' ? `~${hub.walkMinutes}m पैदल` : `~${hub.walkMinutes}m walk`);

              return (
                <div
                  key={hub.id}
                  className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-xs text-on-surface truncate">
                      {getStopDisplayName(hub)}
                    </p>
                    <p className="text-[10.5px] text-secondary font-bold mt-0.5">
                      {distText} {dirText} • {howToReach}
                    </p>
                    {hub.routes?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {hub.routes.slice(0, 5).map(r => (
                          <span key={r.id} className="px-1.5 py-0.2 rounded bg-primary-fixed text-on-primary-fixed text-[9.5px] font-extrabold">
                            {r.code}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchFromHubStop(hub)}
                    className="px-2.5 py-1.5 rounded-xl bg-primary text-on-primary text-[11px] font-bold shrink-0 active:scale-95"
                  >
                    {lang === 'hi' ? 'यहाँ से रूट →' : 'Bus from Here →'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Offline Banner */}
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
              ? 'उदयपुर की गलियों में कमजोर नेटवर्क होने पर भी Udaipur City Bus ऑफलाइन समय-सारणी का उपयोग करता है।'
              : 'Udaipur City Bus uses offline timetables and local cell towers when GPS network is low in Udaipur lanes.'}
          </span>
        </div>
      </section>
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
