'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';

export default function RadarPage() {
  const { lang, t, getStopDisplayName, formatBusPlate } = useLanguage();

  // Default location: Chetak Circle, Udaipur
  const [userLocation, setUserLocation] = useState({
    lat: 24.591011,
    lng: 73.690539,
    name: lang === 'hi' ? 'चेटक सर्कल (Chetak Circle)' : 'Chetak Circle'
  });

  const [radiusKm, setRadiusKm] = useState(2); // 0.5, 1, 2, 5
  const [fleet, setFleet] = useState([]);
  const [stops, setStops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [geoLocating, setGeoLocating] = useState(false);

  // Load stops and fleet
  useEffect(() => {
    async function loadData() {
      try {
        const [fleetRes, stopsRes] = await Promise.all([
          fetch('/api/fleet'),
          fetch('/api/stops')
        ]);
        if (fleetRes.ok) {
          const data = await fleetRes.json();
          setFleet(data.buses || []);
        }
        if (stopsRes.ok) {
          setStops(await stopsRes.json());
        }
      } catch (err) {
        console.error('Failed to load radar data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Distance calculation using Haversine formula
  const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
  };

  // Nearby Buses sorted by distance
  const nearbyBuses = useMemo(() => {
    return fleet
      .filter(bus => bus.lat && bus.lng)
      .map(bus => {
        const dist = getDistanceKm(userLocation.lat, userLocation.lng, bus.lat, bus.lng);
        const etaMinutes = bus.speed && bus.speed > 5 ? Math.max(1, Math.round((dist / bus.speed) * 60)) : Math.round(dist * 4);
        return { ...bus, distance: dist, etaMinutes };
      })
      .filter(bus => bus.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }, [fleet, userLocation, radiusKm]);

  // Nearby Stops sorted by distance
  const nearbyStops = useMemo(() => {
    return stops
      .filter(s => s.coordinates && s.coordinates.length === 2)
      .map(s => {
        const dist = getDistanceKm(userLocation.lat, userLocation.lng, s.coordinates[0], s.coordinates[1]);
        return { ...s, distance: dist };
      })
      .filter(s => s.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [stops, userLocation, radiusKm]);

  const requestGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser');
      return;
    }
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: lang === 'hi' ? 'आपकी वर्तमान लोकेशन (GPS)' : 'Your Current Location (GPS)'
        });
        setGeoLocating(false);
      },
      () => {
        alert(lang === 'hi' ? 'GPS लोकेशन नहीं मिली। चेटक सर्कल का उपयोग हो रहा है।' : 'Could not fetch GPS location. Using Chetak Circle.');
        setGeoLocating(false);
      }
    );
  };

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Top Banner */}
      <section className="px-4 pt-3 pb-2 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="font-extrabold text-[18px] text-on-surface">
              {t('nearbyBuses')}
            </h1>
            <span className="text-xs text-on-surface-variant font-medium">
              {radiusKm} {t('km')} {lang === 'hi' ? 'राडार दायरा • वास्तविक समय GPS' : 'Radar Range • Realtime GPS'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container/40">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-[11px] font-extrabold text-on-secondary-fixed-variant uppercase tracking-wider">
              LIVE RADAR
            </span>
          </div>
        </div>

        {/* User Location Chip */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                my_location
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                {t('currentLocation')}
              </span>
              <span className="font-extrabold text-[14px] text-on-surface truncate">
                {userLocation.name}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={requestGps}
            disabled={geoLocating}
            className="px-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-primary font-bold text-xs active:scale-95 transition-all flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">
              {geoLocating ? 'autorenew' : 'gps_fixed'}
            </span>
            <span>{geoLocating ? (lang === 'hi' ? 'खोज रहे...' : 'Locating...') : t('change')}</span>
          </button>
        </div>

        {/* Distance Radii Selector Chips */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {[
            { label: '500m', value: 0.5 },
            { label: '1 km', value: 1 },
            { label: '2 km', value: 2 },
            { label: '5 km', value: 5 },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setRadiusKm(chip.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 shadow-xs transition-all ${
                radiusKm === chip.value
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      {/* Buses in Range */}
      <section className="px-4 py-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {lang === 'hi' ? `राडार में बसें (${nearbyBuses.length})` : `Buses in Radar (${nearbyBuses.length})`}
          </span>
          <span className="text-xs text-secondary font-bold">
            {lang === 'hi' ? 'निकटतम पहले' : 'Closest first'}
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-on-surface-variant gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">autorenew</span>
            <span className="text-sm font-semibold">{lang === 'hi' ? 'आस-पास की बसें खोजी जा रही हैं...' : 'Scanning nearby buses...'}</span>
          </div>
        ) : nearbyBuses.length === 0 ? (
          <div className="p-8 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-on-surface-variant flex flex-col items-center">
            <span className="material-symbols-outlined text-4xl mb-2 text-outline">radar</span>
            <p className="font-bold text-sm">
              {lang === 'hi' ? `इस दायरे (${radiusKm} km) में कोई बस नहीं मिली` : `No bus found within ${radiusKm} km`}
            </p>
            <p className="text-xs mt-1">
              {lang === 'hi' ? 'दायरा बढ़ाकर 5 km करें या लोकेशन अपडेट करें' : 'Increase radius to 5 km or change your location'}
            </p>
            <button
              type="button"
              onClick={() => setRadiusKm(5)}
              className="mt-3 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 shadow-sm"
            >
              {lang === 'hi' ? '5 KM दायरा सेट करें' : 'Set 5 KM Radius'}
            </button>
          </div>
        ) : (
          nearbyBuses.map((bus) => {
            const isMoving = bus.speed && bus.speed >= 2;
            const distMeters = Math.round(bus.distance * 1000);
            const distStr = distMeters < 1000
              ? `${distMeters} ${lang === 'hi' ? 'मीटर दूर' : 'meters away'}`
              : `${bus.distance.toFixed(1)} ${lang === 'hi' ? 'किमी दूर' : 'km away'}`;

            const busPlate = bus.plateFormatted || formatBusPlate(bus.id);
            const routeTitle = lang === 'en' ? (bus.routeTitleEn || bus.routeTitle) : (bus.routeTitle || bus.routeTitleEn);

            return (
              <div
                key={bus.id}
                className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 hover:border-secondary transition-all flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-extrabold text-[15px] shadow-xs shrink-0">
                      <span className="material-symbols-outlined text-[24px]">directions_bus</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-on-surface">
                          {busPlate}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary text-[10px] font-extrabold uppercase">
                          {bus.routeCode || bus.agency}
                        </span>
                      </div>
                      <span className="text-xs text-on-surface-variant font-medium truncate mt-0.5">
                        {routeTitle || 'PM e-Bus Udaipur'}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/track?route=${bus.routeId || '4'}&bus=${bus.id}`}
                    className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">radar</span>
                    <span>Live</span>
                  </Link>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-surface-container text-xs">
                  <div className="flex items-center gap-1.5 text-secondary font-bold">
                    <span className="material-symbols-outlined text-[16px]">near_me</span>
                    <span>{distStr}</span>
                    <span className="text-on-surface-variant font-normal">• ~{bus.etaMinutes} {t('minutes')}</span>
                  </div>

                  <div className="flex items-center gap-1 font-semibold text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">speed</span>
                    <span>{isMoving ? `${Math.round(bus.speed)} km/h` : (lang === 'hi' ? 'खड़ी है (Halt)' : 'At Halt')}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Nearby Bus Stops */}
      {nearbyStops.length > 0 && (
        <section className="px-4 pt-3 flex flex-col gap-2.5">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('nearbyStops')} ({nearbyStops.length})
          </span>

          <div className="flex flex-col gap-2">
            {nearbyStops.map(s => {
              const stopDistMeters = Math.round(s.distance * 1000);
              const stopDistStr = stopDistMeters < 1000 ? `${stopDistMeters}m` : `${s.distance.toFixed(1)} km`;

              return (
                <div
                  key={s.id}
                  className="bg-surface-container-lowest rounded-xl p-3 shadow-xs border border-outline-variant/30 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-surface-container-high text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">signpost</span>
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs text-on-surface truncate">
                        {getStopDisplayName(s)}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        {lang === 'hi' ? s.english : s.name}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-md bg-secondary-fixed/50 text-on-secondary-fixed font-bold text-xs">
                    {stopDistStr}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
