import { fleet } from './feeds.mjs';
import { sourceMatch, routePosition, inferredDuty } from './matching.mjs';
import { passengerRoutes, variantRoutes, canonicalStop, stopNames, stopEnglish, stopLocations, routePoints, observedSchedule } from './network.mjs';

const routes = [...passengerRoutes, ...variantRoutes].map(route => ({
  ...route, stops: route.stops.map(canonicalStop), points: routePoints[route.id] ?? []
}));
const stops = [...new Set(passengerRoutes.flatMap(route => route.stops.map(canonicalStop)))].map(id => ({
  id, name: stopNames[id], english: stopEnglish[id] ?? null, coordinates: stopLocations[id] ?? null
}));

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = {'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store'};
    const json = (data, status = 200) => Response.json(data, {status, headers});
    if (request.method !== 'GET') return new Response(null, {status:405, headers:{...headers, Allow:'GET'}});
    if (path === '/api/routes') return json(routes);
    if (path === '/api/stops') return json(stops);
    if (path === '/api/timetable') return json({timezone:'Asia/Kolkata', observations:observedSchedule,
      estimates:passengerRoutes.map(({id, headway, minutes}) => ({routeId:id, headway, travelMinutes:minutes}))});
    if (path !== '/api/fleet') return json({error:'Unknown endpoint'},404);
    try {
      const data = await fleet();
      const buses = data.buses.map(bus => {
        const matches = [];
        if (bus.source !== 'last' && bus.gpsAt && data.checkedAt-bus.gpsAt <= 180000) {
          for (const route of passengerRoutes) {
            const reported = sourceMatch(bus, route);
            if (!reported && !inferredDuty(bus, route)) continue;
            const pos = routePosition(bus, route);
            const position = !pos ? null : {
              kind: pos.between ? 'between_stops_estimate' : 'near_stop',
              stopIds: route.stops.slice(pos.index, pos.index + (pos.between ? 2 : 1)).map(canonicalStop)
            };
            matches.push({routeId:route.id, basis:reported ? 'feed' : 'duty_hint_and_gps', position});
          }
        }
        return {...bus, matches};
      });
      return json({...data, buses});
    } catch {
      return json({error:'Fleet data could not be processed'},502);
    }
  }
};
