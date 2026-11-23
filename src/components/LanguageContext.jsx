'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext({
  lang: 'hi',
  setLang: () => {},
  t: (key, params) => key,
  toggleLang: () => {},
  getStopDisplayName: (stop) => '',
  getRouteTitle: (route) => '',
  formatBusPlate: (busId) => ''
});

const translations = {
  hi: {
    appTitle: 'AgliBus • अगलीबस',
    citySubtitle: 'उदयपुर सिटी बस सेवा',
    home: 'होम',
    liveTrack: 'लाइव ट्रैक',
    routes: 'रूट',
    radar: 'राडार',
    timetable: 'समय-सारणी',
    about: 'जानकारी',
    spotYourBus: 'बस खोजें • Spot Your Bus',
    from: 'कहाँ से (Boarding Stop)',
    to: 'कहाँ जाना है (Destination)',
    searchBuses: 'बस खोजें',
    searchingBuses: 'रूट खोज रहे हैं...',
    popularStops: 'उदयपुर के मुख्य स्टॉप्स:',
    recentSearches: 'हाल के रूट • Recent Searches',
    liveGPS: 'लाइव GPS',
    liveBus: 'लाइव बस',
    busNumber: 'बस नंबर',
    nearbyStops: 'पास के स्टॉप',
    onTime: 'समय पर • On Time',
    delayed: 'देरी से • Delayed',
    updatedJustNow: 'अपडेट: अभी-अभी',
    secondsAgo: 'सेकंड पहले',
    currentStatus: 'वर्तमान स्थिति',
    nextStop: 'अगला स्टॉप',
    allStops: 'सभी स्टॉप',
    departed: 'छूट चुकी है',
    hereNow: 'यहाँ खड़ी है',
    onTrack: 'चल रही है • On Track',
    atStop: 'स्टॉप पर खड़ी है • At Stop',
    distanceAway: 'दूर',
    alarm: 'अलार्म',
    alarmActive: 'अलार्म चालू है',
    alarmSetMsg: 'अलार्म सक्रिय! आपके गंतव्य स्टॉप से 500m पहले घंटी बजेगी।',
    shareStatus: 'शेयर करें',
    shareCopiedMsg: 'लाइव लोकेशन लिंक कॉपी हो गया! WhatsApp पर शेयर करें।',
    nearbyBuses: 'पास की बसें • Buses Near You',
    currentLocation: 'आपकी लोकेशन',
    change: 'बदलें',
    offlineReady: 'ऑफलाइन मोड तैयार',
    offlineSubtext: 'बिना इंटरनेट के भी समय-सारणी उपलब्ध है',
    activeTag: 'सक्रिय',
    freeTransit: '100% मुफ़्त एवं सुरक्षित',
    allRoutes: 'सभी रूट (All)',
    ebus: 'इलेक्ट्रिक बस (PM e-Bus)',
    cityBus: 'सिटी बस (UCTSL)',
    popular: 'मुख्य रूट (Popular)',
    routesAvailable: 'रूट उपलब्ध',
    searchRoutePlaceholder: 'रूट या बस नंबर खोजें (e.g. 10, PM4, Chetak)...',
    noRoutesFound: 'कोई रूट नहीं मिला',
    tryAnotherSearch: 'कृपया दूसरा कीवर्ड सर्च करें',
    frequency: 'फ्रीक्वेंसी',
    everyXMin: 'हर {X} मिनट में',
    totalDistance: 'कुल दूरी',
    tripTime: 'यात्रा समय',
    minutes: 'मिनट',
    km: 'किमी',
    stopSchedule: 'स्टॉप समय-सारणी',
    departureTime: 'प्रस्थान समय',
    arrivalTime: 'पहुंचने का समय',
    firstBus: 'पहली बस • FIRST BUS',
    lastBus: 'अंतिम बस • LAST BUS',
    selectDay: 'दिन चुनें (Select Service Day)',
    monSat: 'सोम - शनि (Mon - Sat)',
    sunday: 'रविवार (Sunday)',
    holiday: 'त्यौहार / अवकाश (Holiday)',
    allTrips: 'सभी ट्रिप (All)',
    morningShift: 'सुबह (06:00 - 11:00 AM)',
    afternoonShift: 'दोपहर (12:00 - 04:00 PM)',
    eveningShift: 'शाम (05:00 - 09:30 PM)',
    viewStopTimetable: 'स्टॉप्स का समय देखें',
    hideStopTimetable: 'समय छिपाएं',
    forwardDir: 'आरंभ ➔ गंतव्य (Up)',
    reverseDir: 'वापसी (Down / Return)',
    fareChart: 'किराया तालिका (Standard Bus Fares)',
    helplineTitle: 'हेल्पलाइन और सहायता (Helplines)',
    featuresTitle: 'मुख्य विशेषताएं',
    feature1Title: '100% Free / बिल्कुल मुफ़्त',
    feature1Desc: 'कोई अतिरिक्त शुल्क नहीं, सभी आम नागरिकों और विद्यार्थियों के लिए हमेशा नि:शुल्क सेवा।',
    feature2Title: 'Live Udaipur Buses / लाइव बस',
    feature2Desc: 'PM e-Bus और City Bus की सटीक लाइव लोकेशन, स्पीड और स्टॉप पर पहुंचने का समय।',
    feature3Title: 'Easy to Use / उपयोग में आसान',
    feature3Desc: 'सरल भाषा, बड़े अक्षर, ऑफलाइन समय-सारणी और साफ़-सुथरे स्टॉप मैप।',
    trackLive: 'लाइव ट्रैक',
    activeBusesTitle: 'सक्रिय बसें (Live Active Fleet)',
    dailyTrips: 'दैनिक प्रस्थान समय (Departure Timings)',
    tripStopTimings: 'इस ट्रिप के सभी स्टॉप्स का समय',
    currentPosition: 'वर्तमान में यहाँ • Current Position',
    approachingStop: 'अगले स्टॉप की ओर अग्रसर',
    haltAtStop: 'स्टॉप पर खड़ी है • 2 मिनट में रवाना',
    finalDestination: 'अंतिम स्टॉप • Destination',
    nextStopAway: 'अगला स्टॉप (~4 मिनट दूर)',
    liveFleetSubtitle: 'उदयपुर जीपीएस ट्रैकर से लाइव डेटा'
  },
  en: {
    appTitle: 'AgliBus',
    citySubtitle: 'Udaipur City Transit',
    home: 'Home',
    liveTrack: 'Live Track',
    routes: 'Routes',
    radar: 'Radar',
    timetable: 'Timetable',
    about: 'About',
    spotYourBus: 'Spot Your Bus',
    from: 'From (Boarding Stop)',
    to: 'To (Destination)',
    searchBuses: 'Find Buses',
    searchingBuses: 'Finding routes...',
    popularStops: 'POPULAR UDAIPUR STOPS:',
    recentSearches: 'Recent Routes',
    liveGPS: 'LIVE GPS',
    liveBus: 'Live Bus',
    busNumber: 'Bus Number',
    nearbyStops: 'Nearby Stops',
    onTime: 'On Time',
    delayed: 'Delayed',
    updatedJustNow: 'Updated Just Now',
    secondsAgo: 'sec ago',
    currentStatus: 'Current Status',
    nextStop: 'Next Stop',
    allStops: 'All Stops',
    departed: 'Departed',
    hereNow: 'At Stop',
    onTrack: 'On Track • Moving',
    atStop: 'At Stop • Halting',
    distanceAway: 'away',
    alarm: 'Alarm',
    alarmActive: 'Alarm Active',
    alarmSetMsg: 'Alarm Active! Will ring 500m before your destination stop.',
    shareStatus: 'Share Status',
    shareCopiedMsg: 'Live bus tracking link copied! Share on WhatsApp.',
    nearbyBuses: 'Buses Near You',
    currentLocation: 'Your Location',
    change: 'Change',
    offlineReady: 'Offline Ready',
    offlineSubtext: 'Timetable works 100% without internet',
    activeTag: 'Active',
    freeTransit: '100% Free & Reliable',
    allRoutes: 'All Routes',
    ebus: 'PM e-Bus (Electric)',
    cityBus: 'City Bus (UCTSL)',
    popular: 'Popular Routes',
    routesAvailable: 'Routes Available',
    searchRoutePlaceholder: 'Search route or bus number (e.g. 10, PM4, Chetak)...',
    noRoutesFound: 'No Routes Found',
    tryAnotherSearch: 'Please try another keyword',
    frequency: 'Frequency',
    everyXMin: 'Every {X} min',
    totalDistance: 'Total Distance',
    tripTime: 'Trip Time',
    minutes: 'mins',
    km: 'km',
    stopSchedule: 'Stop-by-Stop Timetable',
    departureTime: 'Departure Time',
    arrivalTime: 'Arrival Time',
    firstBus: 'FIRST BUS',
    lastBus: 'LAST BUS',
    selectDay: 'Select Service Day',
    monSat: 'Mon - Sat',
    sunday: 'Sunday',
    holiday: 'Holiday',
    allTrips: 'All Departures',
    morningShift: 'Morning (06:00 - 11:00 AM)',
    afternoonShift: 'Afternoon (12:00 - 04:00 PM)',
    eveningShift: 'Evening (05:00 - 09:30 PM)',
    viewStopTimetable: 'View Stop Timetable',
    hideStopTimetable: 'Hide Timetable',
    forwardDir: 'Forward (Up)',
    reverseDir: 'Return (Down)',
    fareChart: 'Standard Bus Fares',
    helplineTitle: 'Helplines & Support',
    featuresTitle: 'Key Features',
    feature1Title: '100% Free / No Charges',
    feature1Desc: 'Zero extra fee, always free real-time bus tracking for citizens and students.',
    feature2Title: 'Live Udaipur Buses',
    feature2Desc: 'Accurate live GPS location, speed and stop arrival times for PM e-Bus and City Bus.',
    feature3Title: 'Simple & Easy to Use',
    feature3Desc: 'Clean interface, large readable text, offline schedules, and clear route stops.',
    trackLive: 'Track Live',
    activeBusesTitle: 'Live Active Fleet',
    dailyTrips: 'Departure Timings & Destinations',
    tripStopTimings: 'Intermediate Stop Timings for this Trip',
    currentPosition: 'Current Position • Here Now',
    approachingStop: 'Approaching next stop',
    haltAtStop: 'At Stop • Departs in 2 mins',
    finalDestination: 'Final Destination Stop',
    nextStopAway: 'Next Stop (~4 mins away)',
    liveFleetSubtitle: 'Live GPS data directly from Udaipur transit network'
  }
};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('hi');
  const [stopsCatalog, setStopsCatalog] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aglibus_lang');
      if (saved === 'en' || saved === 'hi') {
        setLang(saved);
      }
    } catch (e) {}

    // Preload stops catalog for fast string translation
    fetch('/api/stops')
      .then(res => res.ok ? res.json() : [])
      .then(data => setStopsCatalog(data))
      .catch(() => {});
  }, []);

  const toggleLang = () => {
    const next = lang === 'hi' ? 'en' : 'hi';
    setLang(next);
    try {
      localStorage.setItem('aglibus_lang', next);
    } catch (e) {}
  };

  const t = (key, params = {}) => {
    let text = translations[lang]?.[key] || translations['en']?.[key] || key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
    return text;
  };

  const getStopDisplayName = (stop) => {
    if (!stop) return '';
    // If stop is an object
    if (typeof stop === 'object') {
      if (lang === 'en') {
        return stop.english || stop.name || `Stop #${stop.id}`;
      }
      return stop.name || stop.english || `Stop #${stop.id}`;
    }

    // If stop is a number or numeric string (ID)
    if (typeof stop === 'number' || /^\d+$/.test(String(stop).trim())) {
      const match = stopsCatalog.find(s => s.id === Number(stop));
      if (match) {
        return lang === 'en' ? (match.english || match.name) : (match.name || match.english);
      }
      return `Stop #${stop}`;
    }

    // If stop is a string name
    const str = String(stop).trim();
    if (stopsCatalog.length > 0) {
      const match = stopsCatalog.find(s =>
        (s.name && s.name.toLowerCase() === str.toLowerCase()) ||
        (s.english && s.english.toLowerCase() === str.toLowerCase())
      );
      if (match) {
        return lang === 'en' ? (match.english || match.name) : (match.name || match.english);
      }
    }
    return str;
  };

  const getRouteTitle = (route) => {
    if (!route) return '';
    if (lang === 'en') {
      return route.titleEn || route.title || '';
    }
    return route.title || route.titleEn || '';
  };

  const formatBusPlate = (busId) => {
    if (!busId) return 'City Bus';
    const m = String(busId).match(/^([A-Z]{2})(\d{2})([A-Z]+)(\d{4})$/);
    if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
    if (String(busId).startsWith('Bus ')) return `UCTSL Bus (${busId.slice(4, 9)})`;
    return busId;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggleLang, getStopDisplayName, getRouteTitle, formatBusPlate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
