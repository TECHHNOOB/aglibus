import { NextResponse } from 'next/server';
import { fleet } from '@/lib/feeds.mjs';
import { sourceMatch, routePosition, inferredDuty } from '@/lib/matching.mjs';
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
      const matches = [];
      const hasRecentGps = bus.source !== 'last' && bus.gpsAt && (data.checkedAt - bus.gpsAt <= 300000);

      if (hasRecentGps) {
        for (const route of passengerRoutes) {
          const reported = sourceMatch(bus, route);
          if (!reported && !inferredDuty(bus, route)) continue;
          const pos = routePosition(bus, route);
          const position = !pos ? null : {
            kind: pos.between ? 'between_stops_estimate' : 'near_stop',
            stopIds: route.stops.slice(pos.index, pos.index + (pos.between ? 2 : 1)).map(canonicalStop)
          };
          matches.push({ routeId: route.id, basis: reported ? 'feed' : 'duty_hint_and_gps', position });
        }
      }

      // Route determination: from hints, assignment, or best match
      const assignedRouteId = matches[0]?.routeId || dutyRouteHints[bus.id] || (bus.assignment ? bus.assignment.replace(/^ud/i, '') : null);
      const matchedRoute = passengerRoutes.find(r => r.id === assignedRouteId) || (bus.agency === 'UCTSL' ? passengerRoutes.find(r => r.agency === 'UCTSL') : passengerRoutes[3]); // default to PM4

      // Nearest stop along route or overall
      const nearestStop = findNearestStop(bus.lat, bus.lng, matchedRoute?.stops) || findNearestStop(bus.lat, bus.lng);

      // If matches was empty but we know the bus's duty route, add the fallback match
      if (matches.length === 0 && matchedRoute) {
        matches.push({
          routeId: matchedRoute.id,
          basis: 'duty_hint',
          position: nearestStop ? { kind: 'near_stop', stopIds: [nearestStop.id] } : null
        });
      }

      return {
        ...bus,
        plateFormatted: formatPlate(bus.id),
        routeId: matchedRoute?.id || '4',
        routeCode: matchedRoute?.code || 'PM4',
        routeTitle: matchedRoute?.title || 'बड़गांव → बलिचा',
        routeTitleEn: matchedRoute?.titleEn || routeTitlesEn[matchedRoute?.id] || 'Badgaon ➔ Balicha',
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
