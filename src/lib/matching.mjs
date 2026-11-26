import { passengerRoutes, routePoints, dutyRouteHints } from './network.mjs';

const clean = value => String(value).normalize("NFKC").trim().toLowerCase();
const plain = value => clean(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
const routeById = new Map(passengerRoutes.map(r => [r.id, r]));

// Remember recent high-confidence route for a bus so brief shared-corridor sections preserve its identity
const recentRouteByBus = globalThis.__aglibusRecentRouteByBus || (globalThis.__aglibusRecentRouteByBus = new Map());
function rememberBusRoute(busId, routeId, time) {
  if (!busId || !routeId) return;
  recentRouteByBus.set(busId, { routeId, time });
}
function getRecentBusRoute(busId, now) {
  const rec = recentRouteByBus.get(busId);
  if (!rec) return null;
  if (now - rec.time > 30 * 60 * 1000) {
    recentRouteByBus.delete(busId);
    return null;
  }
  return rec.routeId;
}

function sourceMatch(bus, route) {
  if (bus.agency !== "Unknown" && route.agency !== bus.agency) return false;
  const assignment = plain(bus.assignment);
  const code = plain(route.code);
  if (assignment) {
    if (assignment === plain(route.id) || assignment === code) return true;
    if (route.agency === "UCTSL" && bus.agency === "UCTSL" && assignment === plain(route.id).replace(/^u/, "")) return true;
    return false;
  }
  const source = plain(bus.route);
  if (!source) return false;
  if (source === code || source === plain(route.title)) return true;
  const words = clean(bus.route).match(/[a-z]+-?[a-z]*-?\d+[a-z]?|\d+/g) || [];
  if (words.some(word => plain(word) === code)) return true;
  if (bus.agency !== route.agency) return false;
  const number = plain(route.id).replace(/^u/, "");
  return source === "route" + number || source === "ud" + number;
}

function routePosition(bus, route) {
  const points = routePoints[route.id] || [];
  const east = 111320 * Math.cos(bus.lat * Math.PI / 180);
  const local = points.map(p => p && [(p[1] - bus.lng) * east, (p[0] - bus.lat) * 111320]);
  const candidates = [];
  local.forEach((p, i) => {
    if (!p) return;
    const meters = Math.hypot(...p);
    if (meters <= 120) candidates.push({ index: i, meters, between: false, fraction: 0 });
  });
  if (!candidates.length) local.forEach((p, i) => {
    const q = local[i + 1];
    if (!p || !q) return;
    const x = q[0] - p[0], y = q[1] - p[1], length = Math.hypot(x, y);
    if (length < 100 || length > 1500) return;
    const fraction = -(p[0] * x + p[1] * y) / (length * length);
    if (fraction <= 0 || fraction >= 1) return;
    const meters = Math.hypot(p[0] + fraction * x, p[1] + fraction * y);
    if (meters <= 75) candidates.push({ index: i, meters, between: true, fraction });
  });
  candidates.sort((a, b) => a.meters - b.meters);
  const [best, alternate] = candidates;
  return best && (!alternate || alternate.meters - best.meters > 25) ? best : null;
}

function inferredDuty(bus, route) {
  return !bus.assignment && bus.agency === "PM e-Bus" && dutyRouteHints[bus.id] === route.id &&
    /^(?:pm route|pm e-bus|unknown|city bus|)$/i.test(bus.route.trim()) && routePosition(bus, route);
}

const gpsMatchCache = new WeakMap();
function corridorMatches(bus) {
  if (gpsMatchCache.has(bus)) return gpsMatchCache.get(bus);
  const results = [];
  const generic = /^(?:|uctsl|uctsl route|city bus|unknown|pm route|pm e-bus)$/i.test(bus.route.trim());
  if (!bus.assignment && generic && ["PM e-Bus", "UCTSL"].includes(bus.agency)) {
    const scale = 111320 * Math.cos(bus.lat * Math.PI / 180);
    for (const route of passengerRoutes.filter(r => r.agency === bus.agency)) {
      const points = routePoints[route.id] || [];
      let best;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (!a || !b) continue;
        const x = (a[1] - bus.lng) * scale, y = (a[0] - bus.lat) * 111320;
        const dx = (b[1] - a[1]) * scale, dy = (b[0] - a[0]) * 111320;
        const length = Math.hypot(dx, dy);
        if (length < 20 || length > 4500) continue;
        const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (length * length)));
        const meters = Math.hypot(x + t * dx, y + t * dy);
        if (meters <= 400 && (!best || meters < best.meters)) best = { routeId: route.id, meters, progress: i - 1 + t };
      }
      if (best) results.push(best);
    }
  }
  results.sort((a, b) => a.meters - b.meters);
  const candidates = results.length ? results.filter(r => r.meters <= results[0].meters + 60) : [];
  gpsMatchCache.set(bus, candidates);
  return candidates;
}

function matchBasis(bus, route, now = Date.now()) {
  if (sourceMatch(bus, route)) {
    rememberBusRoute(bus.id, route.id, now);
    return "feed";
  }
  if (inferredDuty(bus, route)) {
    rememberBusRoute(bus.id, route.id, now);
    return "duty_hint_and_gps";
  }
  const hint = routeById.get(dutyRouteHints[bus.id]);
  if (hint && hint.id !== route.id && inferredDuty(bus, hint)) return null;

  const matches = corridorMatches(bus);
  // If bus has a duty hint on one of the overlapping corridor segments, trust its duty hint
  if (hint && matches.some(m => m.routeId === hint.id)) {
    rememberBusRoute(bus.id, hint.id, now);
    return route.id === hint.id ? "duty_hint_and_gps" : null;
  }
  if (matches.length > 1) {
    const previous = getRecentBusRoute(bus.id, now);
    if (previous && matches.some(m => m.routeId === previous)) {
      return route.id === previous ? "recent_history_and_gps" : null;
    }
  }
  if (matches.some(m => m.routeId === route.id)) {
    if (matches.length === 1) {
      rememberBusRoute(bus.id, route.id, now);
      return "gps_estimate";
    }
    return "shared_corridor";
  }
  return null;
}

// Persistent motion tracker across polls to infer travel direction (+1 forward, -1 reverse, 0 unknown)
const motionByBus = globalThis.__aglibusMotionByBus || (globalThis.__aglibusMotionByBus = new Map());

function directedMatches(bus, checkedAt = Date.now()) {
  for (const [id, sample] of motionByBus) {
    if (checkedAt - sample.time > 360000) motionByBus.delete(id);
  }
  const matches = [];
  const previous = motionByBus.get(bus.id);
  const next = new Map();

  for (const route of passengerRoutes) {
    const basis = matchBasis(bus, route, checkedAt);
    if (!basis) continue;
    const match = { routeId: route.id, basis, direction: 0 };
    matches.push(match);
    if (basis === "shared_corridor") continue;

    const point = routePosition(bus, route);
    if (!point) continue;
    const progress = point.index + (point.fraction || 0);
    match.progress = progress;
    match.position = {
      kind: point.between ? "between_stops_estimate" : "near_stop",
      stopIds: route.stops.slice(point.index, point.index + (point.between ? 2 : 1))
    };

    const old = previous?.routes.get(route.id);
    let sample = { time: bus.gpsAt, progress, lat: bus.lat, lng: bus.lng, direction: 0 };
    if (old && bus.gpsAt >= old.time && bus.gpsAt - old.time < 300000) {
      const meters = 111320 * Math.hypot(bus.lat - old.lat, (bus.lng - old.lng) * Math.cos(bus.lat * Math.PI / 180));
      const delta = progress - old.progress;
      if (bus.gpsAt > old.time && meters >= 65 && Math.abs(delta) >= 0.04) {
        if (meters / ((bus.gpsAt - old.time) / 1000) <= 35) sample.direction = Math.sign(delta);
      } else {
        // Keep previous known travel direction while stopped at red lights/stops
        sample = { ...old, time: bus.gpsAt };
      }
    }
    if (progress === 0 || progress === route.stops.length - 1) sample = { ...sample, direction: 0 };
    match.direction = sample.direction;
    next.set(route.id, sample);
  }

  if (!previous || previous.time <= bus.gpsAt) {
    motionByBus.set(bus.id, { time: bus.gpsAt, routes: next });
  }
  return matches;
}

function boardingMatch(bus, routeId, fromIndex, toIndex, now = Date.now()) {
  if (!bus.gpsAt || now - bus.gpsAt > 180000 || bus.source === "last") return null;
  const direction = Math.sign(toIndex - fromIndex);
  return bus.matches?.find(m =>
    m.routeId === routeId &&
    m.basis !== "shared_corridor" &&
    (m.direction === direction || m.direction === 0) &&
    Number.isFinite(m.progress) &&
    (m.progress - fromIndex) * direction <= 0
  ) || null;
}

export { sourceMatch, routePosition, inferredDuty, corridorMatches, matchBasis, directedMatches, boardingMatch };
