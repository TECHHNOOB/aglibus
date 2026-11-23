"use strict";
const byId = id => document.getElementById(id);
const clock = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit"
});
const sourceInfo = {
  live: ["Live positions", "/bus/api/live"],
  instant: ["Instant snapshot", "/bus/api/db-instant"],
  last: ["Last signals", "/bus/api/last-signals"],
  locks: ["Route assignments", "/bus/api/route-locks"]
};
const stateNames = { moving:"Moving", stopped:"Stopped", last:"Last known", unknown:"Speed unknown" };
const stateFilter = byId("state"), search = byId("search"), operator = byId("operator"), routeFilter = byId("route");
const list = byId("list"), status = byId("notice"), refreshButton = byId("refresh");
let fleet = [], activeFeed, selected, catalogFilter, busy = false, initializedMap = false;
let map, layer, passengerLocation, locationMarker;
const markers = new Map();

function el(tag, content, className) {
  const item = document.createElement(tag);
  item.textContent = content;
  if (className) item.className = className;
  return item;
}
function busState(bus) {
  if (!bus.gpsAt || Date.now() - bus.gpsAt > 180000 || bus.source === "last") return "last";
  if (bus.speed === null) return "unknown";
  return bus.speed >= 2 ? "moving" : "stopped";
}
function gpsAge(value) {
  if (!value) return "Time unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return seconds + " sec ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " hr ago";
  return Math.floor(seconds / 86400) + " days ago";
}
function routeOf(bus) {
  const name = bus.route.trim();
  return name && !/^(unknown|bus|city service|city bus|n\/a|[-–—])$/i.test(name)
    ? name : bus.assignment ? "Route " + bus.assignment : "";
}
function distanceTo(bus) {
  if (!passengerLocation) return Infinity;
  const rad = Math.PI / 180;
  const [lat,lng] = passengerLocation;
  const a = Math.sin((bus.lat-lat)*rad/2)**2 +
    Math.cos(lat*rad)*Math.cos(bus.lat*rad)*Math.sin((bus.lng-lng)*rad/2)**2;
  return 12742*Math.asin(Math.sqrt(Math.min(1,a)));
}
function visibleBuses() {
  const q = search.value.trim().toLowerCase();
  return fleet.filter(bus =>
    (!passengerLocation || distanceTo(bus) <= 3) &&
    (!catalogFilter || window.matchCatalogRoute?.(bus, catalogFilter)) &&
    (!operator.value || operator.value === bus.agency) &&
    (!stateFilter.value || stateFilter.value === busState(bus)) &&
    (!routeFilter.value || routeFilter.value === routeOf(bus)) &&
    (!q || [bus.id, routeOf(bus), bus.agency, bus.assignment].join(" ").toLowerCase().includes(q))
  ).sort((a, b) => (passengerLocation ? distanceTo(a) - distanceTo(b) : 0) ||
    (b.gpsAt || 0) - (a.gpsAt || 0) || a.id.localeCompare(b.id));
}
function showTab(tab) {
  document.querySelectorAll("[data-tab]").forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach(panel => { panel.hidden = panel.id !== tab; });
  if (tab === "track" && map) requestAnimationFrame(() => {
    map.invalidateSize();
    if (!initializedMap && visibleBuses().length) {
      fit();
      initializedMap = true;
    }
  });
}

if (window.L) {
  byId("map").replaceChildren();
  map = L.map("map", {scrollWheelZoom:false}).setView([24.5854, 73.7125], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  layer = L.layerGroup().addTo(map);

} else {
  byId("map").firstElementChild.textContent = "Map library unavailable. Vehicle details remain available in the list.";
  byId("fit").disabled = true;
}

function fit() {
  const buses = visibleBuses();
  if (!map || !buses.length) return;
  if (buses.length === 1) map.setView([buses[0].lat, buses[0].lng], 15);
  else map.fitBounds(buses.map(bus => [bus.lat, bus.lng]), {padding:[25,25], maxZoom:15});
}
function renderDetails() {
  const target = byId("bus-detail"), bus = fleet.find(item => item.id === selected);
  if (!bus) {
    target.replaceChildren(el("p", "Select a bus on the map or in the list to see its details."));
    return;
  }
  const details = el("div", "", "detail-grid");
  for (const [label, value] of [
    ["Status", stateNames[busState(bus)]],
    ["Operator", bus.agency],
    ["Route", routeOf(bus) || "Not supplied"],
    ["GPS", bus.gpsAt ? clock.format(bus.gpsAt) + " IST · " + gpsAge(bus.gpsAt) : "Time unknown"],
    ["Speed", bus.speed === null ? "Unknown" : Math.round(bus.speed) + " km/h"],
    ["Position source", sourceInfo[bus.source][0]]
  ]) {
    const item = el("span", "");
    item.append(el("b", label + " "), document.createTextNode(value));
    details.append(item);
  }
  target.replaceChildren(el("h3", bus.id + (bus.assignment ? " · Assignment " + bus.assignment : "")), details);
}
function selectRowStyles() {
  list.querySelectorAll(".row").forEach(row => row.setAttribute("aria-pressed", String(row.dataset.id === selected)));
}
function choose(bus, pan) {
  if (pan && map) map.closePopup();
  selected = bus.id;
  if (pan && map) {
    map.setView([bus.lat, bus.lng], Math.max(14, map.getZoom()));
    markers.get(bus.id)?.openPopup();
  }
  renderDetails();
  selectRowStyles();
}
function markerIcon(bus) {
  const icon = el("span", "", "marker " + busState(bus));
  icon.append(el("i", ""));
  return L.divIcon({ html:icon, iconSize:[23,23] });
}
function renderMap(buses) {
  byId("map-caption").textContent = buses.length + (passengerLocation ? " positions within 3 km" : " positions shown · Udaipur");
  if (!layer) return;
  const visibleIds = new Set(buses.map(bus => bus.id));
  for (const [id, marker] of markers) {
    if (!visibleIds.has(id)) {
      layer.removeLayer(marker);
      markers.delete(id);
    }
  }
  for (const bus of buses) {
    const label = el("div", "");
    label.append(el("strong", bus.id), el("div", routeOf(bus) || bus.agency), el("div", "GPS · " + gpsAge(bus.gpsAt)));
    const marker = markers.get(bus.id);
    if (marker) {
      marker.setLatLng([bus.lat, bus.lng]).setPopupContent(label);
      if (marker.busState !== busState(bus)) marker.setIcon(markerIcon(bus));
      marker.busState = busState(bus);
      continue;
    }
    const item = L.marker([bus.lat, bus.lng], {icon:markerIcon(bus), title:bus.id, alt:bus.id});
    item.busState = busState(bus);
    item.bindPopup(label).on("click", () => choose(fleet.find(row => row.id === bus.id) ?? bus, false)).addTo(layer);
    markers.set(bus.id, item);
  }
}
function renderVehicles() {
  const buses = visibleBuses();
  byId("count").textContent = activeFeed ? buses.length + " of " + fleet.length + " buses" + (catalogFilter ? " · " + catalogFilter.code : "") : "Waiting for feed";
  if (selected && !buses.some(bus => bus.id === selected)) {
    selected = null;
    map?.closePopup();
  }
  const focusId = list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  const rows = buses.map(bus => {
    const row = el("button", "", "row"), main = el("span", "", "row-main"), right = el("span", "", "row-status");
    row.type = "button";
    row.dataset.id = bus.id;
    row.setAttribute("aria-pressed", String(selected === bus.id));
    main.append(el("strong", bus.id), el("small", [bus.agency, routeOf(bus),
      passengerLocation ? distanceTo(bus).toFixed(1) + " km away" : ""].filter(Boolean).join(" · ")));
    right.append(el("div", stateNames[busState(bus)], "state " + busState(bus)), el("small", gpsAge(bus.gpsAt)));
    row.append(main, right);
    row.addEventListener("click", () => choose(bus, true));
    return row;
  });
  list.replaceChildren(...(rows.length ? rows : [el("p", fleet.length ? "No vehicles match these filters." : "No bus positions available yet.", "empty")]));
  if (focusId) rows.find(row => row.dataset.id === focusId)?.focus({preventScroll:true});
  renderMap(buses);
  renderDetails();
}

function clearFilters() {
  catalogFilter = null;
  clearNearby();
  for (const filter of [search, operator, stateFilter, routeFilter]) filter.value = "";
}
function renderRoutes() {
  const savedRoute = routeFilter.value;
  const groups = new Map();
  for (const bus of fleet) {
    const route = routeOf(bus);
    if (route) groups.set(route, (groups.get(route) || 0) + 1);
  }
  if (savedRoute && !groups.has(savedRoute)) groups.set(savedRoute, 0);
  const sorted = [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, {numeric:true}));
  routeFilter.replaceChildren(new Option("All routes", ""), ...sorted.map(([route]) => new Option(route, route)));
  if (groups.has(savedRoute)) routeFilter.value = savedRoute;

}

function renderFleetCounts() {
  const counts = {moving:0, stopped:0, last:0, unknown:0};
  for (const bus of fleet) counts[busState(bus)]++;
  byId("fleet-all").textContent = fleet.length;
  for (const [key, value] of Object.entries(counts)) byId("fleet-" + key).textContent = value;
  return counts;
}

function renderSummary() {
  const counts = renderFleetCounts();
  const sources = activeFeed.feeds;
  const current = [sources.live,sources.instant].some(feed => !feed.error && feed.count > 0);
  const recent = counts.moving + counts.stopped + counts.unknown;
  const healthy = current && Object.values(sources).every(feed => !feed.error);
  const connected = healthy && recent > 0;
  byId("header-dot").className = connected ? "good" : "warn";
  byId("header-status").textContent = connected ? "Feeds connected" : current && recent ? "Partial feed"
    : current ? "No recent GPS" : "Live feed unavailable";
  status.className = connected ? "notice" : "notice warn";
  status.textContent = connected ? "GPS positions older than 3 minutes are shown as last known." : current && recent
    ? "Some feeds are unavailable. Open Data feeds to see which sources loaded." : current
    ? "The feeds responded, but no recent bus positions were found."
    : "Live position feeds returned no usable records or could not be reached.";
  byId("updated").textContent = "Last checked " + clock.format(activeFeed.checkedAt) + " IST";
  byId("feed-list").replaceChildren(...Object.entries(sourceInfo).map(([key, [title, path]]) => {
    const tile = el("article", "", "feed-tile"), feed = sources[key];
    const availability = feed.error ? (feed.updatedAt ? "Cached data · " : "") + feed.error : feed.count ? "Available" : "Connected · no records";
    tile.append(el("strong", title), el("code", path), el("span", availability, feed.error ? "problem" : "ok"));
    if (feed.updatedAt) tile.append(el("span", feed.count + " records · " + clock.format(feed.updatedAt) + " IST"));
    return tile;
  }));
}

async function refresh() {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/fleet", {cache:"no-store"});
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.buses) || !data.feeds) throw new Error("Could not refresh the fleet.");
    activeFeed = data;
    fleet = data.buses;
    renderSummary();
    renderRoutes();
    window.refreshTransitDetails?.();
    renderVehicles();
    if (!initializedMap && map && !byId("track").hidden && visibleBuses().length) {
      fit();
      initializedMap = true;
    }
  } catch (error) {
    byId("header-dot").className = "warn";
    byId("header-status").textContent = "Refresh failed";
    status.className = "notice warn";
    status.textContent = fleet.length ? "Couldn't refresh. Showing previously loaded positions." : "Couldn't load the fleet. Select Refresh to retry.";
    if (activeFeed) renderFleetCounts();
    renderVehicles();
  } finally {
    busy = false;
    refreshButton.disabled = false;
  }
}
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
refreshButton.addEventListener("click", refresh);
byId("fit").addEventListener("click", fit);
function clearNearby() {
  passengerLocation = null;
  locationMarker?.remove();
  locationMarker = null;
  byId("locate").textContent = "Near me";
  byId("locate").setAttribute("aria-pressed", "false");
}
byId("locate").addEventListener("click", () => {
  const locate = byId("locate");
  if (passengerLocation) {
    clearNearby();
    renderVehicles();
    fit();
    return;
  }
  if (!navigator.geolocation) {
    byId("map-caption").textContent = "Location is unavailable in this browser.";
    return;
  }
  locate.disabled = true;
  navigator.geolocation.getCurrentPosition(position => {
    passengerLocation = [position.coords.latitude,position.coords.longitude];
    locate.textContent = "All buses";
    locate.setAttribute("aria-pressed","true");
    locate.disabled = false;
    if (map) {
      initializedMap = true;
      locationMarker = L.circleMarker(passengerLocation,{radius:7,color:"#2057ac",fillOpacity:1}).addTo(map).bindTooltip("Your location");
      map.setView(passengerLocation,13);
    }
    renderVehicles();
  }, () => {
    locate.disabled = false;
    byId("map-caption").textContent = "Location could not be accessed.";
  }, {timeout:8000,maximumAge:120000});
});
byId("clear").addEventListener("click", () => { clearFilters(); renderVehicles(); });
for (const filter of [search, operator, stateFilter, routeFilter]) filter.addEventListener("input", () => {
  if (filter === routeFilter) catalogFilter = null;
  renderVehicles();
});
byId("auto").addEventListener("change", () => { if (byId("auto").checked) refresh(); });
setInterval(() => { if (!document.hidden && byId("auto").checked) refresh(); }, 20000);
refresh();
