import { routePoints, dutyRouteHints } from './network.mjs';
const clean = value => String(value).normalize("NFKC").trim().toLowerCase();
const plain = value => clean(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
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
  const local = points.map(p => p && [(p[1]-bus.lng)*east, (p[0]-bus.lat)*111320]);
  const candidates = [];
  local.forEach((p,i)=>{
    if (!p) return;
    const meters = Math.hypot(...p);
    if (meters <= 120) candidates.push({index:i,meters,between:false});
  });
  if (!candidates.length) local.forEach((p,i)=>{
    const q = local[i+1];
    if (!p || !q) return;
    const x=q[0]-p[0], y=q[1]-p[1], length=Math.hypot(x,y);
    if (length < 100 || length > 1500) return;
    const fraction = -(p[0]*x+p[1]*y)/(length*length);
    if (fraction <= 0 || fraction >= 1) return;
    const meters = Math.hypot(p[0]+fraction*x,p[1]+fraction*y);
    if (meters <= 75) candidates.push({index:i,meters,between:true});
  });
  candidates.sort((a,b)=>a.meters-b.meters);
  const [best,alternate] = candidates;
  return best && (!alternate || alternate.meters-best.meters > 25) ? best : null;
}
function inferredDuty(bus,route) {
  return !bus.assignment && bus.agency === "PM e-Bus" && dutyRouteHints[bus.id] === route.id &&
    /^(?:pm route|pm e-bus|unknown|city bus|)$/i.test(bus.route.trim()) && routePosition(bus,route);
}
export { sourceMatch, routePosition, inferredDuty };
