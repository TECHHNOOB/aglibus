import { NextResponse } from 'next/server';
import { fleet } from '@/lib/feeds.mjs';
import { directedMatches } from '@/lib/matching.mjs';
import {
  passengerRoutes,
  canonicalStop,
  dutyRouteHints,
  stopLocations,
  stopNames,
  stopEnglish,
  routeTitlesEn
} from '@/lib/network.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatPlate(id) {
  if (!id) return 'City Bus';
  const m = id.match(/^([A-Z]{2})(\d{2})([A-Z]+)(\d{4})$/);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  if (id.startsWith('Bus ')) return `UCTSL Bus (${id.slice(4, 9)})`;
  return id;
}

function findNearestStop(lat, lng, candidateStops = null) {
  if (!lat || !lng) return null;
  let minD = Infinity;
  let bestId = null;
  const stopsToSearch = candidateStops && candidateStops.length > 0 ? candidateStops : Object.keys(stopLocations);
  for (const id of stopsToSearch) {
    const loc = stopLocations[id];
    if (!loc) continue;
    const dLat = (loc[0] - lat) * 111320;
    const dLng = (loc[1] - lng) * 111320 * Math.cos(lat * Math.PI / 180);
    const dist = Math.hypot(dLat, dLng);
    if (dist < minD) {
      minD = dist;
      bestId = id;
    }
  }
  if (!bestId) return null;
  const cId = canonicalStop(Number(bestId));
  return {
    id: cId,
    name: stopNames[cId] || `Stop #${cId}`,
    english: stopEnglish[cId] || `Stop #${cId}`,
    distanceMeters: Math.round(minD)
  };
}

export async function GET() {
  try {
    const data = await fleet();
    const buses = data.buses.map(bus => {
      const live = Boolean(bus.gpsAt && (data.checkedAt - bus.gpsAt <= 180000) && bus.source !== 'last');
      const rawMatches = live ? directedMatches(bus, data.checkedAt) : [];
      const matches = rawMatches.map(m => ({
        ...m,
        position: m.position ? {
          ...m.position,
          stopIds: (m.position.stopIds || []).map(canonicalStop)
        } : null
      }));

      // Route determination: from directed GPS/feed matches, duty hints, or assignment (never fake-default to PM4)
      const primaryMatch = matches.find(m => m.basis !== 'shared_corridor') || matches[0];
      const assignedRouteId = primaryMatch?.routeId || dutyRouteHints[bus.id] || (bus.assignment ? bus.assignment.replace(/^ud/i, '') : null);
      const matchedRoute = assignedRouteId ? passengerRoutes.find(r => r.id === assignedRouteId) : null;

      // Nearest stop along route or overall
      const nearestStop = findNearestStop(bus.lat, bus.lng, matchedRoute?.stops) || findNearestStop(bus.lat, bus.lng);

      // If matches was empty but we know the bus's duty route, add the fallback duty_hint match
      if (matches.length === 0 && matchedRoute) {
        matches.push({
          routeId: matchedRoute.id,
          basis: 'duty_hint',
          direction: 0,
          position: nearestStop ? { kind: 'near_stop', stopIds: [nearestStop.id] } : null
        });
      }

      return {
        ...bus,
        live,
        plateFormatted: formatPlate(bus.id),
        routeId: matchedRoute?.id || null,
        routeCode: matchedRoute?.code || null,
        routeTitle: matchedRoute?.title || bus.route || 'City Bus',
        routeTitleEn: matchedRoute?.titleEn || routeTitlesEn[matchedRoute?.id] || bus.route || 'City Bus',
        nearestStop,
        matches
      };
    });

    return NextResponse.json({ ...data, buses }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Fleet API error:', err);
    return NextResponse.json({ error: 'Fleet data could not be processed' }, { status: 502 });
  }
}
