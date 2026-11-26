'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

const JourneyMap = dynamic(() => import('@/components/JourneyMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[240px] bg-surface-container-low rounded-2xl animate-pulse flex items-center justify-center text-xs font-bold text-on-surface-variant">
      Loading Udaipur Map...
    </div>
  ),
});

function formatDisplayQuery(val) {
  if (!val) return '';
  const m = String(val).match(/^(?:loc:|@)?-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\|\s*(.+)$/i);
  return m ? m[1] : val;
}

export default function HomePage() {
  const router = useRouter();
  const { lang, t, getStopDisplayName, formatBusPlate } = useLanguage();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [allStops, setAllStops] = useState([]);
  const [suggestions, setSuggestions] = useState({ field: null, stops: [], places: [] });
  const [tripPlan, setTripPlan] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [planError, setPlanError] = useState('');
  const [liveBuses, setLiveBuses] = useState([]);
  const [activeBusCount, setActiveBusCount] = useState(0);
  const [geoLoading, setGeoLoading] = useState(false);

  // Interactive free Udaipur map picker inside Spot Your Bus
  const [mapPickField, setMapPickField] = useState(null); // null | 'origin' | 'destination'
  const [pickedGeo, setPickedGeo] = useState(null);
  const geocodeTimerRef = useRef(null);

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlFrom = urlParams.get('from');
      const urlTo = urlParams.get('to');

      const savedFrom = urlFrom || sessionStorage.getItem('aglibus_search_from') || (lang === 'hi' ? 'चेटक सर्कल' : 'Chetak Circle');
      const savedTo = urlTo || sessionStorage.getItem('aglibus_search_to') || (lang === 'hi' ? 'सुखाड़िया सर्कल' : 'Sukhadia Circle');
      const savedPlan = sessionStorage.getItem('aglibus_search_plan');

      setOrigin(formatDisplayQuery(savedFrom));
      setDestination(formatDisplayQuery(savedTo));
      setOriginQuery(savedFrom);
      setDestQuery(savedTo);

      if (savedPlan && !urlFrom && !urlTo) {
        try {
          const parsed = JSON.parse(savedPlan);
          const ageMs = parsed?.fetchedAt ? Date.now() - parsed.fetchedAt : Infinity;
          if (parsed && parsed.plans && ageMs < 120000) {
            setTripPlan(parsed);
          } else if (savedFrom && savedTo && sessionStorage.getItem('aglibus_search_from')) {
            executePlanTrip(savedFrom, savedTo);
          }
        } catch (e) {
          console.error('Failed to parse cached trip plan:', e);
        }
      } else if (urlFrom && urlTo) {
        executePlanTrip(urlFrom, urlTo);
      }
    } catch (e) {
      console.error('Failed to restore search state:', e);
    }
  }, []);

  useEffect(() => {
    async function fetchStops() {
      try {
        const res = await fetch('/api/stops');
        if (res.ok) {
          setAllStops(await res.json());
        }
      } catch (err) {
        console.error('Failed to load stops:', err);
      }
    }

    async function fetchFleet() {
      try {
        const res = await fetch('/api/fleet');
        if (res.ok) {
          const data = await res.json();
          const buses = data.buses || [];
          const active = buses.filter(b => b.live);
          setActiveBusCount(active.length);
          const sorted = [...active].sort((a, b) => (b.speed || 0) - (a.speed || 0));
          setLiveBuses(sorted.slice(0, 6));
        }
      } catch (e) {
        console.error('Failed to load fleet data:', e);
      }
    }

    fetchStops();
    fetchFleet();
    const interval = setInterval(fetchFleet, 15000);
    return () => clearInterval(interval);
  }, []);

  const persistSearchQuery = (fromVal, toVal) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aglibus_search_from', fromVal);
        sessionStorage.setItem('aglibus_search_to', toVal);
      }
    } catch {}
  };

  const handleInputChange = (field, value) => {
    if (field === 'origin') {
      setOrigin(value);
      setOriginQuery(value);
      persistSearchQuery(value, destQuery || destination);
    } else {
      setDestination(value);
      setDestQuery(value);
      persistSearchQuery(originQuery || origin, value);
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
    const queryVal = kind === 'place' ? item.id : displayName;
    if (field === 'origin') {
      setOrigin(displayName);
      setOriginQuery(queryVal);
      persistSearchQuery(queryVal, destQuery || destination);
    } else {
      setDestination(displayName);
      setDestQuery(queryVal);
      persistSearchQuery(originQuery || origin, queryVal);
    }
    setSuggestions({ field: null, stops: [], places: [] });
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      alert(lang === 'hi' ? 'आपके ब्राउज़र में GPS उपलब्ध नहीं है' : 'Geolocation is not supported by your browser');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
          if (!res.ok) {
            setGeoLoading(false);
            alert(
              lang === 'hi'
                ? 'आपकी वर्तमान GPS लोकेशन उदयपुर बस सेवा क्षेत्र से बाहर दिख रही है। कृपया मैप पर टैप करें या स्टॉप चुनें।'
                : 'Your GPS location appears outside the Udaipur service area. Please tap a spot on the Udaipur Map or pick a stop.'
            );
            setMapPickField('origin');
            return;
          }
          const data = await res.json();
          const label = data.label || (lang === 'hi' ? 'मेरी वर्तमान लोकेशन' : 'My Current Location');
          const coordToken = `loc:${lat.toFixed(5)},${lng.toFixed(5)}|${label}`;
          setOrigin(label);
          setOriginQuery(coordToken);
          persistSearchQuery(coordToken, destQuery || destination);
          setPickedGeo({ lat, lng, label, nearestStops: data.nearestStops || [] });
        } catch {
          const coordToken = `loc:${lat.toFixed(5)},${lng.toFixed(5)}|Current GPS`;
          setOrigin('Current GPS');
          setOriginQuery(coordToken);
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        alert(
          lang === 'hi'
            ? 'GPS लोकेशन की अनुमति नहीं मिली। आप नीचे "Map Pick" से उदयपुर मैप पर टैप करके भी लोकेशन चुन सकते हैं।'
            : 'Location permission denied. You can also tap directly on the Udaipur Map using "Map Pick".'
        );
      }
    );
  };

  const handleMapTap = async ({ lat, lng }) => {
    const targetField = mapPickField || 'origin';
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const data = await res.json();
      const label = data.label || 'Udaipur Map Point';
      const coordToken = `loc:${lat.toFixed(5)},${lng.toFixed(5)}|${label}`;
      setPickedGeo({ lat, lng, label, nearestStops: data.nearestStops || [] });
      if (targetField === 'origin') {
        setOrigin(label);
        setOriginQuery(coordToken);
        persistSearchQuery(coordToken, destQuery || destination);
      } else {
        setDestination(label);
        setDestQuery(coordToken);
        persistSearchQuery(originQuery || origin, coordToken);
      }
    } catch {}
  };

  const swapStops = () => {
    const tempDisp = origin;
    const tempQuery = originQuery || origin;
    const nextOrigDisp = destination;
    const nextOrigQuery = destQuery || destination;
    setOrigin(nextOrigDisp);
    setOriginQuery(nextOrigQuery);
    setDestination(tempDisp);
    setDestQuery(tempQuery);
    persistSearchQuery(nextOrigQuery, tempQuery);
  };

  const executePlanTrip = async (fromVal, toVal) => {
    if (!fromVal?.trim() || !toVal?.trim()) return;
    setIsSearching(true);
    setPlanError('');

    try {
      const res = await fetch(`/api/plan?from=${encodeURIComponent(fromVal)}&to=${encodeURIComponent(toVal)}`);
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || (lang === 'hi' ? 'कोई सीधा रूट नहीं मिला' : 'No route found'));
        setTripPlan(null);
      } else {
        setTripPlan(data);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('aglibus_search_from', fromVal);
          sessionStorage.setItem('aglibus_search_to', toVal);
          sessionStorage.setItem('aglibus_search_plan', JSON.stringify({ ...data, fetchedAt: Date.now() }));
          window.history.replaceState(null, '', `?from=${encodeURIComponent(fromVal)}&to=${encodeURIComponent(toVal)}`);
        }
      }
    } catch {
      setPlanError(lang === 'hi' ? 'रूट खोजने में त्रुटि हुई' : 'Network error while planning trip');
      setTripPlan(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlanTrip = () => {
    const f = (originQuery || origin || '').trim();
    const d = (destQuery || destination || '').trim();
    if (!f || !d) return;
    persistSearchQuery(f, d);
    router.push(`/search?from=${encodeURIComponent(f)}&to=${encodeURIComponent(d)}`);
  };

  const clearSearch = () => {
    const defaultFrom = lang === 'hi' ? 'चेटक सर्कल' : 'Chetak Circle';
    const defaultTo = lang === 'hi' ? 'सुखाड़िया सर्कल' : 'Sukhadia Circle';
    setOrigin(defaultFrom);
    setOriginQuery(defaultFrom);
    setDestination(defaultTo);
    setDestQuery(defaultTo);
    setTripPlan(null);
    setPlanError('');
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('aglibus_search_from');
        sessionStorage.removeItem('aglibus_search_to');
        sessionStorage.removeItem('aglibus_search_plan');
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {}
  };

  const setQuickDestination = (stopName) => {
    setDestination(stopName);
    setDestQuery(stopName);
    persistSearchQuery(originQuery || origin, stopName);
  };

  return (
    <div className="flex flex-col w-full pb-8">
      {/* Hero / Spot Your Bus Card */}
      <section className="px-4 pt-3 pb-3">
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-container-high/60 flex flex-col gap-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-primary text-[22px]">near_me</span>
              <h1 className="font-bold text-[17px] text-on-surface truncate">
                {t('spotYourBus')}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMapPickField(prev => (prev ? null : 'origin'))}
                className={`px-2.5 py-1 rounded-full font-bold text-[11px] flex items-center gap-1 transition-all ${
                  mapPickField
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container text-primary hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">map</span>
                <span>{mapPickField ? (lang === 'hi' ? 'मैप बंद' : 'Hide Map') : (lang === 'hi' ? 'मैप से चुनें' : 'Map Pick')}</span>
              </button>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-[11px] uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                <span>{activeBusCount > 0 ? `${activeBusCount} ${lang === 'hi' ? 'लाइव' : 'Live'}` : t('liveGPS')}</span>
              </div>
            </div>
          </div>

          {/* Interactive Free Udaipur Map Picker (Optional expandable) */}
          {mapPickField && (
            <div className="flex flex-col gap-2 bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 animate-fadeIn">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-on-surface">
                  {lang === 'hi' ? 'उदयपुर मैप पर टैप करके चुनें:' : 'Tap on Udaipur Map to set:'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMapPickField('origin')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                      mapPickField === 'origin' ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    {lang === 'hi' ? 'प्रारंभ (From)' : 'From'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapPickField('destination')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                      mapPickField === 'destination' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    {lang === 'hi' ? 'गंतव्य (To)' : 'To'}
                  </button>
                </div>
              </div>

              <JourneyMap
                pickMode
                pickedCoords={pickedGeo ? [pickedGeo.lat, pickedGeo.lng] : null}
                nearbyHubs={pickedGeo?.nearestStops || []}
                onPickLocation={handleMapTap}
                lang={lang}
                heightClass="h-[220px]"
              />

              {pickedGeo && (
                <div className="text-[11px] bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30 flex flex-col gap-1">
                  <div className="font-bold text-on-surface">
                    📍 {pickedGeo.label}
                  </div>
                  {pickedGeo.nearestStops?.length > 0 && (
                    <div className="text-on-surface-variant">
                      <span className="font-bold text-secondary">
                        {lang === 'hi' ? 'नजदीकी बस स्टॉप: ' : 'Nearest Stops: '}
                      </span>
                      {pickedGeo.nearestStops.slice(0, 3).map((s, idx) => (
                        <span key={s.id}>
                          {idx > 0 ? ' • ' : ''}
                          {getStopDisplayName(s)} ({s.distanceMeters}m, ~{s.walkMinutes}m walk)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stop Inputs Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSuggestions({ field: null, stops: [], places: [] });
              handlePlanTrip();
            }}
            className="flex flex-col gap-3"
          >
            <div className="relative flex flex-col gap-2">
              {/* Origin Input */}
              <div className="relative">
                <div className="flex items-center gap-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 focus-within:border-primary transition-all">
                  <span className="w-3.5 h-3.5 rounded-full bg-secondary flex-shrink-0 ring-4 ring-secondary-fixed/50" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {t('from')}
                    </label>
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => handleInputChange('origin', e.target.value)}
                      placeholder={lang === 'hi' ? 'बस स्टॉप या उदयपुर का कोई स्थान...' : 'Bus stop, landmark, or area in Udaipur...'}
                      className="w-full font-bold text-[15px] text-on-surface bg-transparent focus:outline-none placeholder:text-outline truncate mt-0.5"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUseCurrentGps}
                    disabled={geoLoading}
                    className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
                    title="Use My Current Location (GPS)"
                  >
                    <span className={`material-symbols-outlined text-[20px] ${geoLoading ? 'animate-spin text-primary' : ''}`}>
                      {geoLoading ? 'autorenew' : 'my_location'}
                    </span>
                  </button>
                </div>

                {/* Suggestions dropdown for Origin */}
                {suggestions.field === 'origin' && (suggestions.stops.length > 0 || suggestions.places.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-30 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden max-h-64 overflow-y-auto">
                    {suggestions.stops.map((s) => (
                      <button
                        key={`stop-${s.id}`}
                        type="button"
                        onClick={() => selectSuggestion('origin', s, 'stop')}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b border-outline-variant/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">directions_bus</span>
                          <span className="text-on-surface font-bold truncate">{getStopDisplayName(s)}</span>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed shrink-0 ml-2">
                          Bus Stop
                        </span>
                      </button>
                    ))}
                    {suggestions.places.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectSuggestion('origin', p, 'place')}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">location_on</span>
                          <div className="min-w-0">
                            <div className="text-on-surface font-bold truncate">{p.english}</div>
                            {p.sublabel && <div className="text-[10px] text-on-surface-variant truncate">{p.sublabel}</div>}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed shrink-0 ml-2">
                          Udaipur Place
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div className="flex justify-end pr-3 -my-2.5 z-10 pointer-events-auto">
                <button
                  type="button"
                  onClick={swapStops}
                  className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/50 text-primary shadow-xs flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all active:scale-90"
                  title="Swap Stops"
                >
                  <span className="material-symbols-outlined text-[17px]">swap_vert</span>
                </button>
              </div>

              {/* Destination Input */}
              <div className="relative">
                <div className="flex items-center gap-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 focus-within:border-primary transition-all">
                  <span className="w-3.5 h-3.5 rounded-full bg-primary flex-shrink-0 ring-4 ring-primary-fixed/50" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {t('to')}
                    </label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => handleInputChange('destination', e.target.value)}
                      placeholder={lang === 'hi' ? 'गंतव्य स्टॉप या स्थान (जैसे City Palace)...' : 'Destination stop or place (e.g. City Palace)...'}
                      className="w-full font-bold text-[15px] text-on-surface bg-transparent focus:outline-none placeholder:text-outline truncate mt-0.5"
                    />
                  </div>
                  {destination && (
                    <button
                      type="button"
                      onClick={() => {
                        setDestination('');
                        setDestQuery('');
                      }}
                      className="p-1.5 text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown for Destination */}
                {suggestions.field === 'destination' && (suggestions.stops.length > 0 || suggestions.places.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-30 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden max-h-64 overflow-y-auto">
                    {suggestions.stops.map((s) => (
                      <button
                        key={`stop-${s.id}`}
                        type="button"
                        onClick={() => selectSuggestion('destination', s, 'stop')}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b border-outline-variant/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">directions_bus</span>
                          <span className="text-on-surface font-bold truncate">{getStopDisplayName(s)}</span>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed shrink-0 ml-2">
                          Bus Stop
                        </span>
                      </button>
                    ))}
                    {suggestions.places.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectSuggestion('destination', p, 'place')}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">location_on</span>
                          <div className="min-w-0">
                            <div className="text-on-surface font-bold truncate">{p.english}</div>
                            {p.sublabel && <div className="text-[10px] text-on-surface-variant truncate">{p.sublabel}</div>}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed shrink-0 ml-2">
                          Udaipur Place
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Button: Find Buses */}
            <button
              type="submit"
              disabled={isSearching}
              className="w-full h-12 bg-primary hover:bg-primary/95 text-on-primary font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSearching ? 'autorenew' : 'search'}
              </span>
              <span className="text-sm">
                {isSearching ? t('searchingBuses') : t('searchBuses')}
              </span>
            </button>
          </form>

          {/* Popular Stop & Place Chips */}
          <div className="pt-2">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
              {t('popularStops')}
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { hi: 'चेतक सर्कल', en: 'Chetak Circle' },
                { hi: 'सुखाड़िया सर्कल', en: 'Sukhadia Circle' },
                { hi: 'सिटी पैलेस', en: 'City Palace Udaipur' },
                { hi: 'फतहसागर झील', en: 'Fateh Sagar Lake' },
                { hi: 'डबोक एयरपोर्ट', en: 'Dabok Airport' },
                { hi: 'बलिचा', en: 'Balicha' },
                { hi: 'आईआईएम उदयपुर', en: 'IIM Udaipur' },
                { hi: 'तितरड़ी', en: 'Titrdi' },
              ].map((chip) => (
                <button
                  key={chip.en}
                  type="button"
                  onClick={() => setQuickDestination(lang === 'hi' ? chip.hi : chip.en)}
                  className="px-3 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-medium shrink-0 transition-colors"
                >
                  {lang === 'hi' ? chip.hi : chip.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Plan Trip Results (if searched on Home) */}
      {planError && (
        <section className="px-4 pb-2">
          <div className="p-3 bg-error-container text-on-error-container rounded-xl text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{planError}</span>
          </div>
        </section>
      )}

      {tripPlan && tripPlan.plans && tripPlan.plans.length > 0 && (
        <section className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-on-surface">
                {lang === 'hi' ? 'उपलब्ध बस रूट (Direct & Nearby)' : 'Available Transit Options'}
              </h2>
              <span className="text-xs text-secondary font-bold">
                {tripPlan.plans.length} {lang === 'hi' ? 'विकल्प मिले' : 'Options found'}
              </span>
            </div>
            <button
              type="button"
              onClick={clearSearch}
              className="px-2.5 py-1 text-xs text-on-surface-variant hover:text-error font-medium flex items-center gap-1 rounded-lg bg-surface-container hover:bg-error/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              <span>{lang === 'hi' ? 'रीसेट' : 'Reset'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {tripPlan.plans.map((opt, i) => {
              const totalMin = opt.totalMinutes || opt.minutes || 15;
              const isDirect = (opt.transferCount != null ? opt.transferCount : opt.legs.length - 1) === 0;
              const routePillLabel = opt.legs.map(l => l.routeCode || l.code || l.routeId || l.id).filter(Boolean).join(' ➔ ') || 'Bus';
              const primaryRouteId = opt.legs[0]?.routeId || opt.legs[0]?.id || '4';

              return (
                <div
                  key={i}
                  className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg bg-primary text-on-primary font-extrabold text-xs shadow-2xs">
                        {routePillLabel}
                      </span>
                      <span className="text-xs text-on-surface-variant font-medium">
                        {opt.planKind === 'nearby_direct'
                          ? (lang === 'hi' ? 'पास के स्टॉप से सीधी बस' : 'Direct via Nearby Stop')
                          : isDirect
                          ? (lang === 'hi' ? 'सीधा रूट' : 'Direct Route')
                          : (lang === 'hi' ? '1 ट्रांसफर' : '1 Transfer')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary font-bold text-sm">
                      <span className="material-symbols-outlined text-[16px]">schedule</span>
                      <span>~{totalMin} {t('minutes')}</span>
                    </div>
                  </div>

                  {opt.accessSegment && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                      {lang === 'hi'
                        ? `🚶 पहले ${getStopDisplayName(opt.accessSegment.toStop)} जाएं (${opt.accessSegment.distanceMeters}m • ~${opt.accessSegment.walkMinutes} मिनट पैदल)`
                        : `🚶 First reach ${getStopDisplayName(opt.accessSegment.toStop)} (${opt.accessSegment.distanceMeters}m • ~${opt.accessSegment.walkMinutes} min walk)`}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 pl-2.5 border-l-2 border-primary/30">
                    {opt.legs.map((leg, legIdx) => {
                      const legCode = leg.routeCode || leg.code || leg.routeId || leg.id || `Route ${primaryRouteId}`;
                      const rawTitle = lang === 'en' ? (leg.routeTitleEn || leg.titleEn || leg.routeTitle || leg.title) : (leg.routeTitle || leg.title || leg.routeTitleEn);
                      const legTitle = rawTitle && rawTitle !== '()' ? rawTitle : `${legCode} City Bus`;
                      const fromName = getStopDisplayName(leg.fromStop || leg.from);
                      const toName = getStopDisplayName(leg.toStop || leg.to);
                      const stopsNum = leg.stopsCount || 1;
                      const dirLabel = lang === 'en' ? (leg.directionLabelEn || `Towards ${toName}`) : (leg.directionLabel || `${toName} की ओर`);
                      const routeUpcomingBuses = leg.upcomingBuses || [];

                      return (
                        <div key={legIdx} className="text-xs flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold text-on-surface">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="px-2 py-0.5 rounded-md bg-primary text-on-primary font-black text-[11px] shrink-0">
                                {legCode}
                              </span>
                              <span className="font-extrabold text-on-surface text-[13px] truncate">
                                {legTitle}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-[10.5px] uppercase shrink-0">
                              🎯 {dirLabel}
                            </span>
                          </div>

                          <div className="text-[12px] text-on-surface-variant flex items-center gap-1.5 pl-0.5">
                            <span className="font-semibold text-on-surface">{fromName}</span>
                            <span className="material-symbols-outlined text-[13px] text-primary">arrow_forward</span>
                            <span className="font-semibold text-on-surface">{toName}</span>
                            <span className="text-secondary font-medium">({stopsNum} {lang === 'hi' ? 'स्टॉप्स' : 'stops'})</span>
                          </div>

                          <div className="mt-1 bg-surface-container/50 p-2.5 rounded-xl border border-outline-variant/20 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="flex items-center gap-1.5 text-primary">
                                <span className={`w-2 h-2 rounded-full ${routeUpcomingBuses.length > 0 ? 'bg-secondary animate-pulse' : 'bg-outline'}`} />
                                {routeUpcomingBuses.length > 0
                                  ? (lang === 'hi' ? 'Live GPS • आने वाली बसें:' : 'Live GPS • Upcoming Buses:')
                                  : (lang === 'hi' ? 'Estimated (अनुमानित समय):' : 'Estimated (No Live GPS):')}
                              </span>
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                routeUpcomingBuses.length > 0 ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'
                              }`}>
                                {routeUpcomingBuses.length > 0
                                  ? `${routeUpcomingBuses.length} Live`
                                  : `Estimated • ~${opt.departureTime?.full || '15m'}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-surface-container">
                    <span className="text-xs font-bold text-secondary">
                      {lang === 'hi' ? 'किराया: ₹10 - ₹20' : 'Fare: ₹10 - ₹20'}
                    </span>
                    {(() => {
                      const firstLeg = opt.legs[0];
                      const bestBus = firstLeg?.nextUpcomingBus || firstLeg?.upcomingBuses?.[0] || null;
                      const trackUrl = `/track?route=${firstLeg?.routeId || primaryRouteId}${bestBus ? `&bus=${bestBus.id}` : ''}&dir=${firstLeg?.isReverse ? 'reverse' : 'forward'}&from=${firstLeg?.fromStop?.id ?? ''}&to=${firstLeg?.toStop?.id ?? ''}`;
                      return (
                        <Link
                          href={trackUrl}
                          className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/95 text-on-primary text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">radar</span>
                          <span>{t('trackLive')}</span>
                        </Link>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Action Cards (4 Grid Cards) */}
      <section className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/track"
            className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col justify-between h-24 hover:border-primary/50 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">explore</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            </div>
            <div>
              <span className="block font-bold text-sm text-on-surface">{t('liveTrack')}</span>
              <span className="block text-[11px] text-on-surface-variant">{lang === 'hi' ? 'चलती बसें देखें' : 'Where is my bus'}</span>
            </div>
          </Link>

          <Link
            href="/routes"
            className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col justify-between h-24 hover:border-primary/50 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">alt_route</span>
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
            </div>
            <div>
              <span className="block font-bold text-sm text-on-surface">{t('routes')}</span>
              <span className="block text-[11px] text-on-surface-variant">{lang === 'hi' ? 'सभी 24 रूट लिस्ट' : 'Catalog of 24 Routes'}</span>
            </div>
          </Link>

          <Link
            href="/radar"
            className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col justify-between h-24 hover:border-primary/50 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">radar</span>
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
            </div>
            <div>
              <span className="block font-bold text-sm text-on-surface">{t('radar')}</span>
              <span className="block text-[11px] text-on-surface-variant">{lang === 'hi' ? 'पास की बसें खोजें' : 'Buses near you'}</span>
            </div>
          </Link>

          <Link
            href="/timetable"
            className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col justify-between h-24 hover:border-primary/50 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl bg-surface-container-high text-on-surface flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">schedule</span>
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
            </div>
            <div>
              <span className="block font-bold text-sm text-on-surface">{t('timetable')}</span>
              <span className="block text-[11px] text-on-surface-variant">{lang === 'hi' ? 'ऑफलाइन समय-सारणी' : 'Offline schedule'}</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Live Active Fleet */}
      <section className="px-4 pb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[20px]">sensors</span>
            <h2 className="font-bold text-[16px] text-on-surface">
              {t('activeBusesTitle')}
            </h2>
          </div>
          <span className="text-xs font-semibold text-secondary">
            {activeBusCount} {lang === 'hi' ? 'सक्रिय बसें' : 'Active Buses'}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {liveBuses.length === 0 ? (
            <div className="p-4 rounded-xl bg-surface-container-low text-center text-xs text-on-surface-variant">
              <span>{lang === 'hi' ? 'लाइव बसों का डेटा लोड हो रहा है...' : 'Loading live active buses...'}</span>
            </div>
          ) : (
            liveBuses.map((bus) => {
              const isMoving = bus.speed && bus.speed >= 2;
              const routeTitle = lang === 'en' ? (bus.routeTitleEn || bus.routeTitle) : (bus.routeTitle || bus.routeTitleEn);
              const busPlate = bus.plateFormatted || formatBusPlate(bus.id);
              const nearestStopName = bus.nearestStop ? getStopDisplayName(bus.nearestStop) : null;

              return (
                <div
                  key={bus.id}
                  className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-primary text-on-primary font-extrabold text-[15px] flex items-center justify-center flex-shrink-0 shadow-xs">
                      {bus.routeCode || 'PM'}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 text-on-surface font-extrabold text-[14px] truncate">
                        <span>{routeTitle || 'Udaipur City Transit'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
                        <span className="font-bold text-secondary">{busPlate}</span>
                        <span>•</span>
                        <span className="font-semibold text-primary">
                          {isMoving ? `${Math.round(bus.speed)} km/h` : (lang === 'hi' ? 'खड़ी है' : 'At Halt')}
                        </span>
                        {nearestStopName && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[120px]">{nearestStopName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/track?route=${bus.routeId || '4'}&bus=${bus.id}`}
                    className="px-3 py-2 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-primary font-bold text-xs flex items-center gap-1 flex-shrink-0 active:scale-95 transition-all shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[17px]">radar</span>
                    <span>Live</span>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
