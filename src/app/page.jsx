'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/LanguageContext';

export default function HomePage() {
  const router = useRouter();
  const { lang, t, getStopDisplayName, getRouteTitle, formatBusPlate } = useLanguage();

  const [origin, setOrigin] = useState(lang === 'hi' ? 'चेटक सर्कल' : 'Chetak Circle');
  const [destination, setDestination] = useState(lang === 'hi' ? 'सुखाड़िया सर्कल' : 'Sukhadia Circle');
  const [allStops, setAllStops] = useState([]);
  const [suggestions, setSuggestions] = useState({ field: null, items: [] });
  const [tripPlan, setTripPlan] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [planError, setPlanError] = useState('');
  const [liveBuses, setLiveBuses] = useState([]);
  const [activeBusCount, setActiveBusCount] = useState(0);

  // Fetch stops list once for autocomplete and live fleet
  useEffect(() => {
    async function fetchStops() {
      try {
        const res = await fetch('/api/stops');
        if (res.ok) {
          const data = await res.json();
          setAllStops(data);
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
          const active = buses.filter(b => b.gpsAt && (data.checkedAt - b.gpsAt <= 300000));
          setActiveBusCount(active.length || buses.length);

          // Sort by moving buses first, then recent GPS
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

  const swapStops = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handlePlanTrip = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setIsSearching(true);
    setPlanError('');
    setTripPlan(null);

    try {
      const res = await fetch(`/api/plan?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`);
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || (lang === 'hi' ? 'कोई सीधा रूट नहीं मिला' : 'No direct or connecting route found'));
      } else {
        setTripPlan(data);
      }
    } catch (err) {
      setPlanError(lang === 'hi' ? 'रूट खोजने में त्रुटि हुई' : 'Network error while planning trip');
    } finally {
      setIsSearching(false);
    }
  };

  const setQuickDestination = (stopName) => {
    setDestination(stopName);
  };

  return (
    <div className="flex flex-col w-full pb-8">
      {/* Hero / Spot Your Bus Card */}
      <section className="px-4 pt-3 pb-3">
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-container-high/60 flex flex-col gap-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">near_me</span>
              <h1 className="font-bold text-[17px] text-on-surface">
                {t('spotYourBus')}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold text-[11px] uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span>{activeBusCount > 0 ? `${activeBusCount} ${lang === 'hi' ? 'लाइव बसें' : 'Live Buses'}` : t('liveGPS')}</span>
            </div>
          </div>

          {/* Stop Inputs */}
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
                    placeholder={lang === 'hi' ? 'बस स्टॉप का नाम...' : 'Boarding stop name...'}
                    className="w-full font-bold text-[15px] text-on-surface bg-transparent focus:outline-none placeholder:text-outline truncate mt-0.5"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        () => setOrigin(lang === 'hi' ? 'चेटक सर्कल (वर्तमान स्थान)' : 'Chetak Circle (Current)'),
                        () => alert(lang === 'hi' ? 'लोकेशन की अनुमति नहीं मिली' : 'Location permission denied')
                      );
                    }
                  }}
                  className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
                  title="Use My Location"
                >
                  <span className="material-symbols-outlined text-[20px]">my_location</span>
                </button>
              </div>

              {/* Suggestions dropdown for Origin */}
              {suggestions.field === 'origin' && suggestions.items.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden">
                  {suggestions.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSuggestion('origin', s)}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span className="text-on-surface font-bold">{getStopDisplayName(s)}</span>
                      <span className="text-on-surface-variant text-[11px]">{lang === 'hi' ? s.english : s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Swap Button (Absolute Centered) */}
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
                    placeholder={lang === 'hi' ? 'गंतव्य स्टॉप का नाम...' : 'Destination stop name...'}
                    className="w-full font-bold text-[15px] text-on-surface bg-transparent focus:outline-none placeholder:text-outline truncate mt-0.5"
                  />
                </div>
                {destination && (
                  <button
                    type="button"
                    onClick={() => setDestination('')}
                    className="p-1.5 text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>

              {/* Suggestions dropdown for Destination */}
              {suggestions.field === 'destination' && suggestions.items.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 mt-1 overflow-hidden">
                  {suggestions.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSuggestion('destination', s)}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-surface-container flex items-center justify-between border-b last:border-b-0 border-outline-variant/20"
                    >
                      <span className="text-on-surface font-bold">{getStopDisplayName(s)}</span>
                      <span className="text-on-surface-variant text-[11px]">{lang === 'hi' ? s.english : s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Find Buses */}
          <button
            type="button"
            onClick={handlePlanTrip}
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

          {/* Popular Stop Chips */}
          <div className="pt-2">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
              {t('popularStops')}
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { hi: 'चेतक सर्कल', en: 'Chetak Circle' },
                { hi: 'सुखाड़िया सर्कल', en: 'Sukhadia Circle' },
                { hi: 'डबोक एयरपोर्ट', en: 'Dabok Airport' },
                { hi: 'बलिचा', en: 'Balicha' },
                { hi: 'बड़गांव', en: 'Badgaon' },
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

      {/* Plan Trip Results (if searched) */}
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
            <h2 className="font-bold text-sm text-on-surface">
              {lang === 'hi' ? 'उपलब्ध बस रूट (Direct & Connecting)' : 'Available Transit Options'}
            </h2>
            <span className="text-xs text-secondary font-bold">
              {tripPlan.plans.length} {lang === 'hi' ? 'विकल्प मिले' : 'Options'}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {tripPlan.plans.map((opt, i) => (
              <div
                key={i}
                className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-primary text-on-primary font-bold text-xs">
                      {opt.legs.map(l => l.code).join(' ➔ ')}
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      {opt.legs.length === 1 ? (lang === 'hi' ? 'सीधा रूट' : 'Direct Route') : (lang === 'hi' ? '1 ट्रांसफर' : '1 Transfer')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-primary font-bold text-sm">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span>~{opt.minutes} {t('minutes')}</span>
                  </div>
                </div>

                {/* Route legs detail */}
                <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-primary/30">
                  {opt.legs.map((leg, legIdx) => (
                    <div key={legIdx} className="text-xs">
                      <span className="font-bold text-on-surface">{leg.code} ({leg.title})</span>
                      <span className="block text-[11px] text-on-surface-variant">
                        {leg.from} ➔ {leg.to} ({leg.stopsCount} stops)
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-surface-container">
                  <span className="text-xs font-bold text-secondary">
                    {lang === 'hi' ? 'किराया: ₹10 - ₹20' : 'Fare: ₹10 - ₹20'}
                  </span>
                  <Link
                    href={`/track?route=${opt.legs[0].id}`}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">radar</span>
                    <span>{t('trackLive')}</span>
                  </Link>
                </div>
              </div>
            ))}
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

      {/* DYNAMIC REAL-TIME ACTIVE FLEET CARDS (Replaces demo data!) */}
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
