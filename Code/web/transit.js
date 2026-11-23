"use strict";
const allRoutes = [...passengerRoutes, ...variantRoutes];
const routeById = new Map(allRoutes.map(route=>[route.id,route]));
const routesByStop = new Map();
for (const route of passengerRoutes) {
  for (const stop of new Set(route.stops.map(canonicalStop))) {
    if (!routesByStop.has(stop)) routesByStop.set(stop,[]);
    routesByStop.get(stop).push(route);
  }
}
const displayStop = stop => {
  const id = canonicalStop(stop), english = stopEnglish[id], name = stopNames[id];
  return english && name !== english ? english + " · " + name : name;
};
const allStands = [...routesByStop.keys()].sort((a,b)=>displayStop(a).localeCompare(displayStop(b),"en"));
const clean = value => String(value).normalize("NFKC").trim().toLowerCase();
const plain = value => clean(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
function localGet(key,fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function localSet(key,value) {
  try { localStorage.setItem(key,JSON.stringify(value)); } catch {}
}
const saved = new Set(localGet("udaipur.saved-stops.v1",[]));
let selectedRoute = passengerRoutes[0].id, selectedStop;
const announce = (container, text) => container.replaceChildren(el("p",text,"empty"));
function action(text, callback) {
  const button = el("button",text,"ghost");
  button.type="button";
  button.addEventListener("click",callback);
  return button;
}
function link(text,url) {
  const anchor = el("a",text,"ghost");
  anchor.href=url;
  anchor.target="_blank";
  anchor.rel="noopener noreferrer";
  return anchor;
}
function scheduleNote(route) {
  return /^\d+$/.test(route.headway) ? "About every " + route.headway + " min"
    : route.headway || "Frequency unavailable";
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
window.matchCatalogRoute = sourceMatch;

function showRouteOnTracker(route) {
  clearFilters();
  catalogFilter=route;
  showTab("track");
  renderVehicles();
  requestAnimationFrame(fit);
}
function openRoute(id) {
  selectedRoute=id;
  if (variantRoutes.some(route=>route.id===id)) byId("variants").checked=true;
  byId("route-search").value="";
  showTab("routes");
  renderNetworkRoutes();
}
function openStand(id) {
  selectedStop=canonicalStop(id);
  byId("stand-search").value="";
  byId("saved-stops").checked=false;
  showTab("stands");
  renderStands();
}
function openTime(id) {
  byId("time-route").value=id;
  showTab("times");
  showTimetable();
}
function routeTimeline(stops) {
  const list=el("ol","","timeline");
  for (const stop of stops) {
    const item=el("li","");
    const button=el("button",displayStop(stop));
    button.type="button";
    button.addEventListener("click",()=>openStand(stop));
    item.append(button);
    list.append(item);
  }
  return list;
}
function routeItem(route, press) {
  const button=el("button","","transit-item"), body=el("span","");
  button.type="button";
  button.setAttribute("aria-pressed",String(selectedRoute===route.id));
  body.append(el("strong",route.title),el("small",route.agency+" · "+route.count+" stops · "+route.km+" km"));
  button.append(el("span",route.code,"badge"+(route.agency==="UCTSL"?" city":"")),body);
  button.addEventListener("click",press);
  return button;
}
function renderNetworkRoutes() {
  const q=clean(byId("route-search").value), full=byId("variants").checked?allRoutes:passengerRoutes;
  const network=full.filter(route=>!q || clean([route.code,route.title,route.agency,...route.stops.map(displayStop)].join(" ")).includes(q));
  if (!network.some(route=>route.id===selectedRoute)) selectedRoute=network[0]?.id;
  byId("network-count").textContent=network.length+" routes shown";
  const list=byId("network-routes"), detail=byId("route-detail");
  list.replaceChildren(...network.map(route=>routeItem(route,()=>{
    selectedRoute=route.id;
    renderNetworkRoutes();
  })));
  const route=routeById.get(selectedRoute);
  if (!route) return announce(detail,"No routes match your search.");
  const actions=el("div","","transit-actions");
  if (route.stops.length) actions.append(action("Timetable",()=>openTime(route.id)));
  actions.append(action("Track buses on this route",()=>showRouteOnTracker(route)));
  detail.replaceChildren(el("h3",route.code+" · "+route.title),
    el("p",route.agency+" · "+route.km+" km · "+route.count+" stops"),
    actions);
  if (!route.stops.length) {
    detail.append(el("p","The reference lists this variant. Its ordered stops are unavailable in the passenger timetable."));
    return;
  }
  detail.append(el("p","Stops in listed order"),routeTimeline(route.stops));
}
function standItem(id) {
  const button=el("button","","transit-item"), body=el("span","");
  button.type="button";
  button.setAttribute("aria-pressed",String(selectedStop===id));
  body.append(el("strong",displayStop(id)),el("small",routesByStop.get(id).map(route=>route.code).join(" · ")));
  button.append(el("span",saved.has(id)?"★":"•","badge"),body);
  button.addEventListener("click",()=>{selectedStop=id;renderStands();});
  return button;
}
function mapStop(id) {
  const coords=stopLocations[id];
  if (!map || !coords) return;
  showTab("track");
  requestAnimationFrame(()=>{
    map.setView(coords,16);
    L.popup().setLatLng(coords).setContent(el("strong",displayStop(id))).openOn(map);
  });
}
function renderStands() {
  const q=clean(byId("stand-search").value), onlySaved=byId("saved-stops").checked;
  const candidates=allStands.filter(id=>(!onlySaved||saved.has(id)) &&
    (!q||clean(displayStop(id)).includes(q) ||
      (equivalentStops.find(group=>group[0]===id)||[]).some(other=>clean(stopNames[other]).includes(q))));
  if (!candidates.includes(selectedStop)) selectedStop=candidates[0];
  byId("stop-count").textContent=candidates.length+" stands";
  byId("stand-list").replaceChildren(...candidates.map(standItem));
  const detail=byId("stand-detail"),id=selectedStop;
  if (id==null) return announce(detail,onlySaved?"No saved stands match.":"No stands match your search.");
  const actions=el("div","","transit-actions");
  actions.append(action(saved.has(id)?"Remove saved stand":"Save stand",()=>{
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    localSet("udaipur.saved-stops.v1",[...saved]);
    renderStands();
  }),action("Start a trip here",()=>{
    byId("trip-from").value=String(id);
    byId("trip-results").replaceChildren();
    showTab("plan");
    byId("trip-to").focus();
  }));
  if (stopLocations[id]) actions.append(action("Show stop on map",()=>mapStop(id)));
  const searchUrl="https://www.google.com/maps/search/?api=1&query="+
    encodeURIComponent((stopLocations[id]?.join(",") || (stopEnglish[id]||stopNames[id])+" bus stop Udaipur"));
  actions.append(link("Open in Maps",searchUrl));
  const actual=routesByStop.get(id);
  detail.replaceChildren(el("h3",displayStop(id)),el("p",actual.length+" listed routes serve this stand."),actions);
  for (const route of actual) detail.append(routeItem(route,()=>openRoute(route.id)));
}
function scheduleBox(label,value) {
  const panel=el("div","");
  panel.append(el("span",label),el("strong",value));
  return panel;
}
function showTimetable() {
  const route=routeById.get(byId("time-route").value) || passengerRoutes[0];
  const target=byId("time-detail"), summary=el("div","","schedule-cards");
  summary.append(scheduleBox("Published frequency estimate",scheduleNote(route)),
    scheduleBox("Approximate end-to-end travel",route.minutes+" min"),
    scheduleBox("Buses matched in current feed",String(fleet.filter(bus=>sourceMatch(bus,route)&&busState(bus)!=="last").length)));
  const actions=el("div","","transit-actions");
  actions.append(action("Route stops",()=>openRoute(route.id)),action("Track this route",()=>showRouteOnTracker(route)),
    link("Reference timetable", "https://bharatchopal.com/bus/"));
  target.replaceChildren(el("h3",route.code+" · "+route.title),summary,
    el("p","Reference intervals can vary. Confirm exact departures separately."),actions);
  const recorded=observedSchedule[route.id];
  if (!recorded) {
    target.append(el("p","No dated GPS timetable observations are saved for this route."));
    return;
  }
  target.append(el("h3","Recorded GPS observations · "+recorded.date),
    el("p","Sample observations from the reference app. These times do not repeat as scheduled departures."));
  for (const group of recorded.groups) {
    const wrap=el("div","","table-wrap"), table=el("table","","transit-table"), head=el("thead",""), tr=el("tr","");
    tr.append(el("th","Stop"),el("th","Observed time (IST)"),el("th","Bus"));
    head.append(tr);
    const body=el("tbody","");
    for (const [stop,time,bus] of group.rows) {
      const row=el("tr","");
      row.append(el("td",displayStop(stop)),el("td",time),el("td",bus));
      body.append(row);
    }
    table.append(head,body);
    wrap.append(table);
    target.append(el("p",group.label),wrap);
  }
}

function renderTrip(event) {
  event.preventDefault();
  const start=byId("trip-from").value,end=byId("trip-to").value;
  const results=byId("trip-results");
  if (start==="" || end==="") return announce(results,"Select a starting stand and a destination.");
  const from=Number(start),to=Number(end);
  if (from===to) return announce(results,"Select two different stands.");
  const trips=planTrips(from,to);
  if (!trips.length) return announce(results,"No direct or one-transfer trip found between those stands in the current route list.");
  const bestDirect=trips.filter(trip=>trip.legs.length===1).slice(0,3);
  const bestTransfers=trips.filter(trip=>trip.legs.length===2).slice(0,3);
  results.replaceChildren(el("h3",displayStop(from)+" to "+displayStop(to)),
    el("p","Estimated time on board. Confirm travel direction, departures and fares before boarding."));
  for (const trip of [...bestDirect,...bestTransfers]) {
    const details=el("details","","trip"), routeCodes=trip.legs.map(leg=>leg.route.code).join(" + ");
    details.open=trip===(bestDirect[0]||bestTransfers[0]);
    details.append(el("summary",routeCodes+" · "+(trip.legs.length===1?"Direct":"One change")+" · ~"+trip.minutes+" min aboard"));
    for (const leg of trip.legs) {
      details.append(el("p",leg.route.code+" · Board at "+displayStop(leg.from)+" · Get off at "+displayStop(leg.to)),
        routeTimeline(leg.stops),action("Track "+leg.route.code,()=>showRouteOnTracker(leg.route)));
    }
    results.append(details);
  }
}

byId("variants").addEventListener("change",renderNetworkRoutes);
byId("route-search").addEventListener("input",renderNetworkRoutes);
byId("stand-search").addEventListener("input",renderStands);
byId("saved-stops").addEventListener("change",renderStands);
byId("time-route").replaceChildren(...passengerRoutes.map(route=>new Option(route.code+" · "+route.title,route.id)));
byId("time-route").addEventListener("change",showTimetable);
byId("plan-form").addEventListener("submit",renderTrip);
for (const key of ["trip-from","trip-to"]) {
  byId(key).replaceChildren(new Option("Select a bus stand",""),...allStands.map(id=>new Option(displayStop(id),String(id))));
}
byId("trip-swap").addEventListener("click",()=>{
  const a=byId("trip-from"),b=byId("trip-to");
  [a.value,b.value]=[b.value,a.value];
  byId("trip-results").replaceChildren();
});
function updateTheme(theme) {
  document.documentElement.dataset.theme=theme;
  byId("theme").textContent=theme==="dark"?"Light mode":"Dark mode";
}
byId("theme").addEventListener("click",()=>{
  const theme=document.documentElement.dataset.theme==="dark"?"light":"dark";
  updateTheme(theme);
  localSet("udaipur.theme.v1",theme);
});
updateTheme(localGet("udaipur.theme.v1","light"));
window.refreshTransitDetails=()=>{if(!byId("times").hidden)showTimetable();};
document.querySelector('[data-tab="times"]').addEventListener("click",showTimetable);
renderNetworkRoutes();
renderStands();
showTimetable();
