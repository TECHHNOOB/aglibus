import { passengerRoutes, canonicalStop, stopNames, stopEnglish, stopLocations, routePoints } from './network.mjs';
import { udaipurGTFS } from './udaipur-gtfs.mjs';

const UDAIPUR_BOUNDS = {
  minLat: 24.44,
  maxLat: 24.82,
  minLng: 73.52,
  maxLng: 73.95,
};

export const UDAIPUR_CENTER = [24.5854, 73.7125];

export const UDAIPUR_LANDMARKS = [
  { key: 'city-palace', english: 'City Palace Udaipur', name: 'सिटी पैलेस उदयपुर', lat: 24.5761, lng: 73.6836, aliases: ['city palace', 'palace', 'सिटी पैलेस'] },
  { key: 'lake-pichola', english: 'Lake Pichola / Gangaur Ghat', name: 'पिछोला झील / गणगौर घाट', lat: 24.5784, lng: 73.6808, aliases: ['pichola', 'lake pichola', 'gangaur ghat', 'पिछोला'] },
  { key: 'jagdish-temple', english: 'Jagdish Temple', name: 'जगदीश मंदिर', lat: 24.5795, lng: 73.6838, aliases: ['jagdish temple', 'jagdish chowk', 'जगदीश मंदिर'] },
  { key: 'ambrai-ghat', english: 'Ambrai Ghat', name: 'अमराई घाट', lat: 24.5797, lng: 73.6788, aliases: ['ambrai ghat', 'hanuman ghat', 'अमराई घाट'] },
  { key: 'dudh-talai', english: 'Dudh Talai / Karni Mata Ropeway', name: 'दूध तलाई / करणी माता रोपवे', lat: 24.5681, lng: 73.6873, aliases: ['dudh talai', 'karni mata', 'दूध तलाई'] },
  { key: 'gulab-bagh', english: 'Gulab Bagh & Zoo', name: 'गुलाब बाग', lat: 24.5731, lng: 73.6914, aliases: ['gulab bagh', 'zoo', 'गुलाब बाग'] },
  { key: 'fateh-sagar', english: 'Fateh Sagar Lake', name: 'फतहसागर झील', lat: 24.5977, lng: 73.6752, aliases: ['fateh sagar', 'fatehsagar', 'फतहसागर'] },
  { key: 'saheliyon-ki-bari', english: 'Saheliyon Ki Bari', name: 'सहेलियों की बाड़ी', lat: 24.6025, lng: 73.6844, aliases: ['saheliyon ki bari', 'saheliyon', 'सहेलियों की बाड़ी'] },
  { key: 'bapu-bazar', english: 'Bapu Bazar', name: 'बापू बाजार', lat: 24.5818, lng: 73.6948, aliases: ['bapu bazar', 'bapu bazaar', 'बापू बाजार'] },
  { key: 'hathi-pol', english: 'Hathi Pol Bazar', name: 'हाथीपोल बाजार', lat: 24.5858, lng: 73.6870, aliases: ['hathi pol', 'hathipole', 'हाथीपोल'] },
  { key: 'ashwini-bazar', english: 'Ashwini Bazar', name: 'अश्विनी बाजार', lat: 24.5835, lng: 73.6912, aliases: ['ashwini bazar', 'अश्विनी बाजार'] },
  { key: 'shilpgram', english: 'Shilpgram Udaipur', name: 'शिल्पग्राम उदयपुर', lat: 24.6078, lng: 73.6512, aliases: ['shilpgram', 'शिल्पग्राम'] },
  { key: 'sajjangarh', english: 'Sajjangarh Biological Park / Gate', name: 'सज्जनगढ़ / मानसून पैलेस', lat: 24.5917, lng: 73.6435, aliases: ['sajjangarh', 'monsoon palace', 'सज्जनगढ़'] },
  { key: 'hiran-magri-4', english: 'Hiran Magri Sector 4', name: 'हिरण मगरी सेक्टर 4', lat: 24.5651, lng: 73.7253, aliases: ['sector 4', 'hiran magri sector 4', 'sec 4', 'सेक्टर 4'] },
  { key: 'hiran-magri-11', english: 'Hiran Magri Sector 11', name: 'हिरण मगरी सेक्टर 11', lat: 24.5588, lng: 73.6980, aliases: ['sector 11', 'hiran magri sector 11', 'sec 11', 'सेक्टर 11'] },
  { key: 'celebration-mall', english: 'Celebration Mall Bhuwana', name: 'सेलिब्रेशन मॉल भुवाणा', lat: 24.6128, lng: 73.7016, aliases: ['celebration mall', 'forum celebration', 'सेलिब्रेशन मॉल'] },
  { key: 'urban-square', english: 'Urban Square Mall Sukher', name: 'अर्बन स्क्वायर मॉल सुखेर', lat: 24.6215, lng: 73.7072, aliases: ['urban square', 'अर्बन स्क्वायर'] },
  { key: 'lake-city-mall', english: 'Lake City Mall Ayad', name: 'लेक सिटी मॉल आयड़', lat: 24.5869, lng: 73.7109, aliases: ['lake city mall', 'inox lake city', 'लेक सिटी मॉल'] },
];

const gtfsKey = (str) => String(str || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

function buildResolvedStopCoords() {
  const map = new Map();

  for (const [idStr, coords] of Object.entries(stopLocations)) {
    const id = Number(idStr);
    if (Array.isArray(coords) && coords.length === 2) {
      map.set(id, coords);
      const can = canonicalStop(id);
      if (!map.has(can)) map.set(can, coords);
    }
  }

  // Match GTFS stops by normalized name for any remaining canonical stops
  const gtfsByKey = new Map();
  for (const [name, lat, lng] of udaipurGTFS.stops || []) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      gtfsByKey.set(gtfsKey(name), [lat, lng]);
    }
  }

  const allCanIds = [...new Set(passengerRoutes.flatMap(r => r.stops.map(canonicalStop)))];
  for (const canId of allCanIds) {
    if (map.has(canId)) continue;
    const keys = [stopEnglish[canId], stopNames[canId]].filter(Boolean).map(gtfsKey);
    for (const k of keys) {
      if (gtfsByKey.has(k)) {
        map.set(canId, gtfsByKey.get(k));
        break;
      }
    }
  }

  // Fallback: raw stop index matching routePoints
  for (const route of passengerRoutes) {
    const pts = routePoints[route.id] || [];
    route.stops.forEach((rawId, idx) => {
      const canId = canonicalStop(rawId);
      const pt = pts[idx];
      if (!map.has(canId) && Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        map.set(canId, pt);
      }
    });
  }

  return map;
}

const resolvedStopCoordsMap = buildResolvedStopCoords();

export function resolveStopLocation(stopId) {
  if (stopId == null) return null;
  const num = Number(stopId);
  return resolvedStopCoordsMap.get(num) || resolvedStopCoordsMap.get(canonicalStop(num)) || null;
}

export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return Infinity;
  }
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function compassDirection(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lng2 - lng1) * Math.PI / 180);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = [
    { en: 'North', hi: 'उत्तर' },
    { en: 'North-East', hi: 'उत्तर-पूर्व' },
    { en: 'East', hi: 'पूर्व' },
    { en: 'South-East', hi: 'दक्षिण-पूर्व' },
    { en: 'South', hi: 'दक्षिण' },
    { en: 'South-West', hi: 'दक्षिण-पश्चिम' },
    { en: 'West', hi: 'पश्चिम' },
    { en: 'North-West', hi: 'उत्तर-पश्चिम' },
  ];
  return dirs[Math.round(deg / 45) % 8];
}

export function estimateAccessTravel(distanceMeters, lat1, lng1, lat2, lng2) {
  const d = Math.round(distanceMeters);
  const walkMinutes = Math.max(1, Math.round(d / 75)); // ~4.5 km/h walk
  const autoMinutes = Math.max(1, Math.round(d / 320)); // ~19 km/h city auto/e-rickshaw
  const dir = compassDirection(lat1, lng1, lat2, lng2);
  const mode = d <= 600 ? 'walk' : d <= 1250 ? 'walk_or_auto' : 'auto';
  return { distanceMeters: d, walkMinutes, autoMinutes, mode, direction: dir };
}

function buildStopRoutesIndex() {
  const idx = new Map();
  for (const r of passengerRoutes) {
    const seenOnRoute = new Set();
    for (const rawId of r.stops) {
      const canId = canonicalStop(rawId);
      if (seenOnRoute.has(canId)) continue;
      seenOnRoute.add(canId);
      if (!idx.has(canId)) idx.set(canId, []);
      idx.get(canId).push({ id: r.id, code: r.code, title: r.title, titleEn: r.titleEn, agency: r.agency });
    }
  }
  return idx;
}

export const stopRoutesIndex = buildStopRoutesIndex();

export function findNearestStops(lat, lng, { limit = 6, maxDistanceMeters = 3500, excludeStopId = null } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const list = [];
  for (const [canId, routes] of stopRoutesIndex.entries()) {
    if (excludeStopId !== null && canId === canonicalStop(excludeStopId)) continue;
    const coords = resolveStopLocation(canId);
    if (!coords) continue;
    const dist = getDistanceMeters(lat, lng, coords[0], coords[1]);
    if (dist <= maxDistanceMeters) {
      const travel = estimateAccessTravel(dist, lat, lng, coords[0], coords[1]);
      list.push({
        id: canId,
        name: stopNames[canId] || `Stop #${canId}`,
        english: stopEnglish[canId] || stopNames[canId] || `Stop #${canId}`,
        coordinates: coords,
        routes,
        ...travel,
      });
    }
  }
  list.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return list.slice(0, limit);
}

export function getRouteSegmentCoords(routeId, fromIdx, toIdx) {
  const route = passengerRoutes.find(r => String(r.id) === String(routeId));
  if (!route) return [];
  const rawPts = routePoints[route.id] || [];
  const start = Math.max(0, fromIdx);
  const end = Math.max(0, toIdx);
  const step = start <= end ? 1 : -1;
  const coords = [];

  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    const rawPt = rawPts[i];
    const pt =
      Array.isArray(rawPt) && Number.isFinite(rawPt[0]) && Number.isFinite(rawPt[1])
        ? rawPt
        : resolveStopLocation(route.stops[i]);
    if (pt) {
      const prev = coords[coords.length - 1];
      if (!prev || Math.abs(prev[0] - pt[0]) > 1e-6 || Math.abs(prev[1] - pt[1]) > 1e-6) {
        coords.push(pt);
      }
    }
  }
  return coords;
}

export function isWithinUdaipur(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= UDAIPUR_BOUNDS.minLat &&
    lat <= UDAIPUR_BOUNDS.maxLat &&
    lng >= UDAIPUR_BOUNDS.minLng &&
    lng <= UDAIPUR_BOUNDS.maxLng
  );
}

export function parseCoordParam(input) {
  if (!input) return null;
  const str = String(input).trim();
  const m = str.match(/^(?:loc:|@)?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*\|\s*(.+))?$/i);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isWithinUdaipur(lat, lng)) return null;
  return {
    lat,
    lng,
    label: (m[3] || '').trim() || 'Selected Udaipur Location',
    name: (m[3] || '').trim() || 'Selected Udaipur Location',
    english: (m[3] || '').trim() || 'Selected Udaipur Location',
    isCustomPlace: true,
  };
}

export function matchLandmark(input) {
  if (!input) return null;
  const q = String(input).toLowerCase().trim();
  for (const lm of UDAIPUR_LANDMARKS) {
    if (lm.english.toLowerCase() === q || lm.name.toLowerCase() === q || lm.aliases.some(a => q.includes(a) || a === q)) {
      return {
        lat: lm.lat,
        lng: lm.lng,
        label: lm.english,
        name: lm.name,
        english: lm.english,
        isCustomPlace: true,
      };
    }
  }
  return null;
}

export function searchLocalLandmarks(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return UDAIPUR_LANDMARKS.slice(0, 6);
  return UDAIPUR_LANDMARKS.filter(
    lm => lm.english.toLowerCase().includes(q) || lm.name.toLowerCase().includes(q) || lm.aliases.some(a => a.includes(q))
  ).slice(0, 5);
}

const geoCache = globalThis.__aglibusGeoCache || new Map();
if (!globalThis.__aglibusGeoCache) globalThis.__aglibusGeoCache = geoCache;

function cacheSet(key, val) {
  if (geoCache.size > 300) {
    const firstKey = geoCache.keys().next().value;
    if (firstKey) geoCache.delete(firstKey);
  }
  geoCache.set(key, { val, ts: Date.now() });
}

export async function nominatimSearchUdaipur(query, limit = 5) {
  const cleanQ = String(query || '').trim();
  if (cleanQ.length < 2) return [];
  const cacheKey = `nom:${cleanQ.toLowerCase()}:${limit}`;
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.val;

  try {
    const searchQuery = /udaipur/i.test(cleanQ) ? cleanQ : `${cleanQ}, Udaipur`;
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1` +
      `&viewbox=${UDAIPUR_BOUNDS.minLng},${UDAIPUR_BOUNDS.maxLat},${UDAIPUR_BOUNDS.maxLng},${UDAIPUR_BOUNDS.minLat}` +
      `&bounded=1&countrycodes=in&limit=${limit}&q=${encodeURIComponent(searchQuery)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'UdaipurCityBus/1.0 (https://github.com/TECHHNOOB/aglibus)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const mapped = (Array.isArray(rows) ? rows : [])
      .map(r => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        if (!isWithinUdaipur(lat, lng)) return null;
        const shortName =
          r.name ||
          r.display_name?.split(',').slice(0, 2).join(', ') ||
          cleanQ;
        const subName = r.display_name?.split(',').slice(1, 3).join(', ').trim() || 'Udaipur';
        return {
          key: `osm-${r.place_id}`,
          english: shortName,
          name: shortName,
          sublabel: subName,
          lat,
          lng,
          isCustomPlace: true,
        };
      })
      .filter(Boolean);
    cacheSet(cacheKey, mapped);
    return mapped;
  } catch {
    return [];
  }
}

export async function nominatimReverseUdaipur(lat, lng) {
  if (!isWithinUdaipur(lat, lng)) return null;
  const cacheKey = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.val;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'UdaipurCityBus/1.0 (https://github.com/TECHHNOOB/aglibus)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(1600),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const label =
      data.name ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.road ||
      addr.city_district ||
      data.display_name?.split(',').slice(0, 2).join(', ') ||
      'Udaipur Location';
    cacheSet(cacheKey, label);
    return label;
  } catch {
    return null;
  }
}

export async function fetchOsrmGeometry(points, profile = 'foot') {
  const valid = (points || []).filter(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (valid.length < 2) return null;

  // OSRM public endpoint supports max ~25 waypoints reliably
  const sampled = valid.length <= 22 ? valid : valid.filter((_, i) => i === 0 || i === valid.length - 1 || i % Math.ceil(valid.length / 20) === 0);
  const coordStr = sampled.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
  const cacheKey = `osrm:${profile}:${coordStr}`;
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) return cached.val;

  try {
    const osrmProfile = profile === 'driving' ? 'driving' : 'foot';
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const result = {
      coords,
      distanceMeters: Math.round(route.distance || 0),
      durationSeconds: Math.round(route.duration || 0),
    };
    cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
