# Udaipur Tracker backend

Run with Node.js 22 or 24 using `node server.mjs`. No package installation or API key is required by this code. PORT defaults to 3000. Host this service on your own HTTPS domain to connect a deployed web app or mobile device. In a phone browser, localhost refers to the phone. The API supports cross-origin public reads.

| GET path | Payload |
|---|---|
| /api/fleet | checkedAt, feeds, buses. Each bus includes id, lat, lng, speed (km/h or null), gpsAt (Unix milliseconds or null), source, agency, route, assignment and matches. |
| /api/routes | Route IDs, ordered canonical stop IDs and aligned coordinate pairs in [lat,lng] order where available. Variants may have no stop sequence. |
| /api/stops | Passenger stand IDs, names, English labels and available coordinates. |
| /api/timetable | Estimated intervals and journey durations, plus dated PM2 observations. |

The live source is BharatChopal. feeds.mjs is the fleet integration from the deployed tracker. It reads GET /bus/api/live, /bus/api/db-instant, /bus/api/last-signals and /bus/api/route-locks on bharatchopal.com. Cache intervals are 15, 30, 60 and 60 seconds respectively. Each upstream call times out after 6.5 seconds. The feed status and data timestamps tell your app when data is missing or stale. Static endpoints work without upstream access. Empty buses is a valid response. Poll /api/fleet about every 20 seconds while the tracker is visible.

## Use in your app

~~~js
const base = 'http://localhost:3000';
const response = await fetch(base + '/api/fleet');
if (!response.ok) throw new Error('Fleet HTTP ' + response.status);
const { buses, feeds } = await response.json();
for (const bus of buses) {
  console.log(bus.id, bus.lat, bus.lng, bus.matches);
}
~~~

Use matches[].routeId to join /api/routes. Join position.stopIds to /api/stops. A single ID means near a stop. Two IDs describe an estimated segment in catalog order. Direction and arrival time remain unknown. A null position means the route matched but position along it is uncertain. A duty_hint_and_gps match is tentative. Older GPS is retained for last-known map markers and excluded from current stop matches. Inspect feeds[key].error even when /api/fleet returns HTTP 200.

api.mjs also exports a Worker-compatible fetch handler. network.mjs contains the catalog and the trip planner function. This package exposes the existing feed integration and stand matching as reusable HTTP endpoints.
