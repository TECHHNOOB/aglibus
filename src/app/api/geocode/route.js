import { NextResponse } from 'next/server';
import { passengerRoutes, canonicalStop, stopNames, stopEnglish } from '@/lib/network.mjs';
import {
  resolveStopLocation,
  searchLocalLandmarks,
  nominatimSearchUdaipur,
  nominatimReverseUdaipur,
  findNearestStops,
  isWithinUdaipur,
} from '@/lib/udaipur-geo.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  // Reverse mode: GPS or map tap -> place name + nearest Udaipur bus stops
  if (latStr && lngStr) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isWithinUdaipur(lat, lng)) {
      return NextResponse.json({ error: 'Selected coordinates are outside Udaipur service area' }, { status: 400 });
    }

    const [placeName, nearestStops] = await Promise.all([
      nominatimReverseUdaipur(lat, lng),
      Promise.resolve(findNearestStops(lat, lng, { limit: 5, maxDistanceMeters: 5000 })),
    ]);

    return NextResponse.json({
      lat,
      lng,
      label: placeName || `${nearestStops[0]?.english || 'Udaipur'} Area`,
      nearestStops,
    });
  }

  if (!q || q.length < 2) {
    return NextResponse.json({ stops: [], places: [] });
  }

  const clean = q.toLowerCase().replace(/partap/g, 'pratap').trim();
  const noSpaceQ = clean.replace(/\s+/g, '');

  // 1. Local bus stops
  const canonIds = [...new Set(passengerRoutes.flatMap(r => r.stops.map(canonicalStop)))];
  const matchedStops = [];
  for (const id of canonIds) {
    const hi = (stopNames[id] || '').toLowerCase();
    const en = (stopEnglish[id] || '').toLowerCase();
    const combined = `${hi} ${en}`.replace(/\s+/g, '');
    if (
      hi.includes(clean) ||
      en.includes(clean) ||
      combined.includes(noSpaceQ) ||
      (clean.includes('city') && (hi.includes('सिटी') || en.includes('udaipur railway')))
    ) {
      const coords = resolveStopLocation(id);
      matchedStops.push({
        id,
        name: stopNames[id] || `Stop #${id}`,
        english: stopEnglish[id] || stopNames[id] || `Stop #${id}`,
        coordinates: coords,
        kind: 'stop',
      });
    }
    if (matchedStops.length >= 6) break;
  }

  // 2. Local curated Udaipur landmarks
  const localPlaces = searchLocalLandmarks(q).map(lm => ({
    id: `loc:${lm.lat},${lm.lng}|${lm.english}`,
    name: lm.name,
    english: lm.english,
    sublabel: 'Udaipur Landmark',
    lat: lm.lat,
    lng: lm.lng,
    coordinates: [lm.lat, lm.lng],
    kind: 'place',
  }));

  // 3. Free OpenStreetMap Nominatim lookup when user searches a colony, gate, hotel, or locality in Udaipur
  let osmPlaces = [];
  if (matchedStops.length + localPlaces.length < 5 && q.length >= 3) {
    const rawOsm = await nominatimSearchUdaipur(q, 5);
    osmPlaces = rawOsm
      .filter(p => !localPlaces.some(lp => lp.english.toLowerCase() === p.english.toLowerCase()))
      .map(p => ({
        id: `loc:${p.lat},${p.lng}|${p.english}`,
        name: p.name,
        english: p.english,
        sublabel: p.sublabel || 'Udaipur Map Place',
        lat: p.lat,
        lng: p.lng,
        coordinates: [p.lat, p.lng],
        kind: 'place',
      }));
  }

  return NextResponse.json({
    stops: matchedStops.slice(0, 6),
    places: [...localPlaces, ...osmPlaces].slice(0, 6),
  });
}
