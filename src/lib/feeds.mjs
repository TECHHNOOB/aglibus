const origin = "https://bharatchopal.com";
const feeds = {
  live: { path: "/bus/api/live", interval: 15000 },
  instant: { path: "/bus/api/db-instant", interval: 30000 },
  last: { path: "/bus/api/last-signals", interval: 60000 },
  locks: { path: "/bus/api/route-locks", interval: 60000 }
};
const vehiclePlates = {
  "d1fe479be7cb4948": "RJ27PB5202",
  "d68afba8b7caa973": "RJ27PB3626",
  "e00e3ff1821549c7": "RJ27PB3106",
  "b8ea6046bd39fbe9": "RJ27PB3100",
  "90a30464c3842b42": "RJ27PB3102",
  "d9a56ef0f6521341": "RJ27PB3099",
  "c321671393815bc0": "RJ27PB3098",
  "41ebf7c8736855cc": "RJ27PB3103",
  "e1642489b1bf563e": "RJ27PB3104",
  "88814739976272a5": "RJ27PB3101",
  "e7ce40736279a39a": "RJ27PB3624",
  "b09e7935abb5e0d0": "RJ27PB3166",
  "7a947976112683f6": "RJ27PB3163",
  "a7317d12fbdd168b": "RJ27PB3169",
  "25e76895c9a3306b": "RJ27PB3071",
  "a341dcf54d43e0b1": "RJ27PB3171",
  "9cbdf185e8f54dc5": "RJ27PB3097",
  "d6f56d67c01c07f0": "RJ27PB3105",
  "41b9d994f4c857a3": "RJ27PB3625",
  "1bba3bea89cf151c": "RJ27PB3167",
  "028e6c6f73dfcba4": "RJ27PB3165",
  "9a3db8eba4b6f0f8": "RJ27PB3627",
  "625d346ed05137b4": "RJ27PB3164",
  "067831fb73427d94": "RJ27PB3168",
  "9e694dcdf4a458cf": "RJ27PB3170"
};
const cache = new Map();

function records(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return null;
  let empty = null;
  for (const key of ["buses", "data", "vehicles", "result", "results", "items", "fleet", "list", "records"]) {
    const found = records(value[key], depth + 1);
    if (found?.length) return found;
    if (found) empty = found;
  }
  return empty;
}

function first(row, keys) {
  return keys.map(key => row[key]).find(value => value != null && value !== "");
}

function gpsTime(row, fetchedAt) {
  if (row.ageSec === null) return null;
  if (row.ageSec != null && row.ageSec !== "" && Number.isFinite(+row.ageSec) && +row.ageSec >= 0) {
    const timestamp = fetchedAt - +row.ageSec * 1000;
    return timestamp > 0 ? timestamp : null;
  }
  const raw = first(row, ["timestamp", "tsReal", "time", "ts", "gpsTime", "lastUpdate"]);
  if (raw == null) return null;
  const numeric = /^\d+(?:\.\d+)?$/.test(String(raw));
  const local = String(raw).replace(" ", "T");
  const timestamp = numeric
    ? Number(raw) * (Number(raw) < 1e12 ? 1000 : 1)
    : Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(local)
      ? local + "+05:30" : local);
  return timestamp > 0 && timestamp <= fetchedAt + 120000 ? timestamp : null;
}

async function normalize(rows, fetchedAt, locks) {
  const buses = await Promise.all(rows.filter(row => row && typeof row === "object").map(async row => {
    const values = ["vrn", "vehicleNo", "vehicle_no", "vehicleNumber", "vehicle_number", "regNo", "reg_no",
      "registration", "busNo", "bus_no", "imei", "deviceId", "device_id", "name", "id"].map(k => String(row[k] ?? "").trim())
      .filter(value => value && !/^(?:bus|unknown|n\/a|null|undefined|-)$/i.test(value));
    const keys = values.map(value => value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const plate = keys.find(key => /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(key));
    const sourceId = plate || values.find(value => /^\d{14,16}$/.test(value)) || values[0];
    const lat = Number(first(row, ["latitude", "lattutide", "lat", "Latitude"]));
    const lng = Number(first(row, ["longitude", "lon", "lng", "long", "Longitude"]));
    if (sourceId == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 ||
        Math.abs(lng) > 180 || !lat || !lng) return null;
    const rawId = String(sourceId).trim();
    if (!rawId || /^(BUS|UNKNOWN)$/i.test(rawId)) return null;
    const fingerprint = plate ? null : await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawId));
    const hex = fingerprint && Array.from(new Uint8Array(fingerprint).slice(0, 8),
      byte => byte.toString(16).padStart(2, "0")).join("");
    const id = plate ?? vehiclePlates[hex] ?? "Bus " + hex.slice(0, 8).toUpperCase();
    const speed = Number(first(row, ["speed", "currentSpeed"]));
    return {
      id, lat, lng,
      assignment: locks.get(id) ?? keys.map(key => locks.get(key)).find(Boolean) ?? "",
      speed: Number.isFinite(speed) && speed >= 0 ? speed : null,
      gpsAt: gpsTime(row, fetchedAt),
      tripId: String(first(row, ["gtfs_trip_id", "trip_id", "tripId"]) || "").slice(0, 100),
      agency: /uctsl/i.test(String(row.agency || row.source || "")) ? "UCTSL" :
        /pm|e.?bus|cesl/i.test(String(row.agency || row.source || "")) ? "PM e-Bus" : "Unknown",
      route: String(first(row, ["route", "routeName", "route_name"]) || "").slice(0, 80)
    };
  }));
  const unique = new Map();
  for (const bus of buses) {
    if (bus && (!unique.has(bus.id) || (bus.gpsAt || 0) >= (unique.get(bus.id).gpsAt || 0))) {
      unique.set(bus.id, bus);
    }
  }
  return [...unique.values()];
}

async function requestFeed(key, spec) {
  const cached = cache.get(key);
  const startedAt = Date.now();
  if (cached && startedAt - cached.checkedAt < spec.interval) return cached;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  let result;
  try {
    const response = await fetch(origin + spec.path, {
      headers: { Accept: "application/json" }, redirect: "follow", signal: controller.signal
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const body = await response.json();
    const value = key === "locks" ? body?.locks : records(body);
    if (!value || (key === "locks" && (typeof value !== "object" || Array.isArray(value)))) {
      throw new Error("Unexpected data format");
    }
    result = { value, updatedAt: Date.now(), error: null };
  } catch (error) {
    result = { ...cache.get(key), error: error.name === "AbortError" ? "Timed out" :
      /^HTTP \d{3}$/.test(error.message) ? error.message : "Feed unavailable" };
  } finally {
    clearTimeout(timeout);
  }
  const current = cache.get(key);
  if (current && current !== cached && (!current.error && (result.error || current.startedAt >= startedAt))) return current;
  const entry = { ...result, startedAt, checkedAt: Date.now() };
  cache.set(key, entry);
  return entry;
}

async function fleet() {
  const entries = await Promise.all(Object.entries(feeds).map(async ([key, spec]) => [key, await requestFeed(key, spec)]));
  const data = Object.fromEntries(entries);
  const locks = new Map(Object.entries(data.locks.value ?? {}).flatMap(([id, value]) => {
    const assignment = typeof value === "object" && value ? first(value, ["routeId", "route_id", "id", "route"]) : value;
    return ["number", "string"].includes(typeof assignment)
      ? [[id.toUpperCase().replace(/[^A-Z0-9]/g, ""), String(assignment).slice(0, 70)]] : [];
  }));
  const positions = await Promise.all(["live", "instant", "last"].map(key =>
    normalize(data[key].value ?? [], data[key].updatedAt ?? Date.now(), locks)));
  const merged = new Map();
  for (const [index, rows] of positions.entries()) {
    const source = ["live", "instant", "last"][index];
    for (const row of rows) {
      const previous = merged.get(row.id);
      const prefer = !previous || (
        (row.gpsAt || 0) > (previous.gpsAt || 0) + 5000 &&
        (source !== "last" || !previous.gpsAt || Date.now() - previous.gpsAt > 180000)
      );
      const current = prefer ? {...row, source} : previous;
      if (previous) {
        const alternate = prefer ? previous : row;
        if (!current.route) current.route = alternate.route;
        if (!current.assignment) current.assignment = alternate.assignment;
        if (current.agency === "Unknown") current.agency = alternate.agency;
      }
      merged.set(row.id, current);
    }
  }
  const statuses = Object.fromEntries(entries.map(([key, entry]) => [key, {
    checkedAt: entry.checkedAt, updatedAt: entry.updatedAt ?? null,
    error: entry.error, count: Array.isArray(entry.value) ? entry.value.length : Object.keys(entry.value ?? {}).length
  }]));
  const result = { checkedAt: Date.now(), buses: [...merged.values()], feeds: statuses };
  console.info("City bus feeds checked", {
    live: statuses.live.error ?? statuses.live.count,
    instant: statuses.instant.error ?? statuses.instant.count,
    last: statuses.last.error ?? statuses.last.count,
    locks: statuses.locks.error ?? statuses.locks.count,
    mapped: result.buses.length
  });
  return result;
}

export { fleet };
