// Udaipur static schedule, published by Reclaim Chennai from Chalo's scheduler.
function gtfsDistance(lat,lng,otherLat,otherLng){
  return 111320*Math.hypot(lat-otherLat,(lng-otherLng)*Math.cos(lat*Math.PI/180));
}
const gtfsStopKey=name=>name.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,'');
const gtfsExisting=[...new Set(passengerRoutes.flatMap(r=>r.stops.map(canonicalStop)))];
const gtfsStops=[];
const gtfsLocalIds=udaipurGTFS.stops.map(([name,lat,lng],i)=>{
  const key=gtfsStopKey(name);
  const choices=gtfsExisting.filter(id=>stopLocations[id] && gtfsStopKey(stopEnglish[id]||stopNames[id])===key)
    .map(id=>({id,d:gtfsDistance(lat,lng,...stopLocations[id])})).sort((a,b)=>a.d-b.d);
  if(choices[0]?.d<=180)return choices[0].id;
  // The same physical platform can have an English GTFS name and a Hindi legacy name.
  const samePlatform=gtfsExisting.filter(id=>stopLocations[id] && gtfsDistance(lat,lng,...stopLocations[id])<=18);
  if(samePlatform.length===1){
    const id=samePlatform[0];
    if(!stopEnglish[id])stopEnglish[id]=name;
    return id;
  }
  const other=gtfsStops.find(s=>s.key===key && gtfsDistance(lat,lng,s.lat,s.lng)<=180);
  if(other)return other.id;
  const id=10000+i;
  gtfsStops.push({key,id,lat,lng});
  stopEnglish[id]=name;stopNames[id]=name;stopLocations[id]=[lat,lng];
  return id;
});
const gtfsPatterns=udaipurGTFS.patterns.map(p=>({...p,local:p.stops.map(i=>gtfsLocalIds[i])}));
const gtfsWeek=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function gtfsDepartures(from,to,now=Date.now(),lookback=0){
  const india=new Date(now+19800000);
  const departures=[];
  // A service day can include GTFS times past midnight.
  for(const shift of [-1,0,1]){
    const day=new Date(Date.UTC(india.getUTCFullYear(),india.getUTCMonth(),india.getUTCDate()+shift));
    const date=day.toISOString().slice(0,10).replaceAll('-','');
    const services=new Set(udaipurGTFS.calendar.filter(c=>c.start_date<=date && c.end_date>=date && c[gtfsWeek[day.getUTCDay()]]==='1').map(c=>c.service_id));
    for(const e of udaipurGTFS.exceptions.filter(e=>e.date===date)){
      if(e.exception_type==='1')services.add(e.service_id);else services.delete(e.service_id);
    }
    for(const pattern of gtfsPatterns){
      pattern.local.forEach((stop,i)=>{
        if(stop!==from)return;
        const j=pattern.local.indexOf(to,i+1);
        if(j<0)return;
        for(const [service,dep,arr,tripId] of pattern.trips){
          if(!services.has(service))continue;
          const start=day.getTime()-19800000+dep[i]*1000;
          if(start>=now-lookback && start<now+86400000)departures.push({code:pattern.code,title:pattern.title,tripId,pattern,i,j,start,end:day.getTime()-19800000+arr[j]*1000});
        }
      });
    }
  }
  return departures.sort((a,b)=>a.start-b.start || a.end-b.end);
}
function gtfsNearbyStop(bus,matches){
  const codes=new Set(matches.filter(m=>m.basis!=='shared_corridor').map(m=>routeById.get(m.routeId)).filter(r=>r?.agency==='UCTSL').map(r=>r.code));
  if(codes.size!==1)return null;
  const stops=new Set(gtfsPatterns.filter(p=>codes.has(p.code)).flatMap(p=>p.stops));
  let nearest=null,limit=90;
  for(const i of stops){
    const [name,lat,lng]=udaipurGTFS.stops[i];
    const distance=gtfsDistance(bus.lat,bus.lng,lat,lng);
    if(distance<limit){nearest=name;limit=distance;}
  }
  return nearest;
}

// Reject a live route leg when the feed covers both stops but only supports the opposite order.
function gtfsServesLeg(leg){
  if(leg.route.agency!=='UCTSL')return true;
  const patterns=gtfsPatterns.filter(p=>p.code===leg.route.code);
  const covering=patterns.filter(p=>p.local.includes(leg.from) && p.local.includes(leg.to));
  return !covering.length || covering.some(p=>p.local.indexOf(leg.from)<p.local.lastIndexOf(leg.to));
}

// Estimate a pickup from the last observed route progress and the route's typical duration.
function pickupBoard(from,to,trips,buses,now=Date.now()){
  const timetable=gtfsDepartures(from,to,now,3600000);
  const liveRows=[], used=new Set();
  for(const bus of buses){
    const options=[];
    for(const trip of trips){
      const leg=trip.legs[0], route=leg.route;
      const match=boardingMatch(bus,route.id,leg.fromIndex,leg.toIndex,now);
      if(!match || !Number.isFinite(route.minutes) || route.minutes<=0)continue;
      const stops=route.stops, position=match.progress;
      const atPickup=position===leg.fromIndex;
      const travel=Math.abs(leg.fromIndex-position)*route.minutes/(stops.length-1);
      const start=Math.max(now,bus.gpsAt+travel*60000);
      const row={bus,route,leg,trip,atPickup,start,end:trip.legs.length===1?start+leg.minutes*60000:null};
      const near=Math.round(position);
      row.place=bus.nearbyGtfsStop || (position===near?(stopEnglish[stops[near]]||stopNames[stops[near]]):null);
      if(!row.place){
        const pair=[Math.floor(position),Math.ceil(position)];
        if(match.direction<0)pair.reverse();
        row.segment=pair.map(i=>stopEnglish[stops[i]]||stopNames[stops[i]]).join(' → ');
      }
      options.push(row);
    }
    options.sort((a,b)=>a.trip.legs.length-b.trip.legs.length || a.trip.minutes-b.trip.minutes);
    if(options.length)liveRows.push(options[0]);
  }
  for(const row of liveRows){
    if(row.trip.legs.length!==1 || !row.bus.tripId)continue;
    const matches=timetable.filter(s=>s.tripId===row.bus.tripId && s.code===row.route.code && Math.abs(s.start-row.start)<3600000);
    if(matches.length!==1 || liveRows.filter(r=>r.bus.tripId===row.bus.tripId).length!==1)continue;
    row.schedule=matches[0];used.add(matches[0]);
    row.delay=Math.round((row.start-row.schedule.start)/60000);
  }
  const scheduled=timetable.filter(s=>s.start>=now && !used.has(s));
  return [...liveRows,...scheduled].sort((a,b)=>a.start-b.start || Number(!!b.bus)-Number(!!a.bus));
}

function pickupTrips(from,to){
  const trips=planTrips(from,to).filter(t=>t.legs.every(gtfsServesLeg));
  for(const pattern of gtfsPatterns){
    const i=pattern.local.indexOf(from), j=pattern.local.indexOf(to,i+1);
    if(i<0 || j<=i)continue;
    for(const route of passengerRoutes.filter(r=>r.agency==='UCTSL' && r.code===pattern.code)){
      if(trips.some(t=>t.legs.length===1 && t.legs[0].route.id===route.id))continue;
      const path=route.stops.map(canonicalStop);
      function platform(index){
        const exact=path.indexOf(pattern.local[index]);
        if(exact>=0)return exact;
        const [,lat,lng]=udaipurGTFS.stops[pattern.stops[index]];
        const nearby=(routePoints[route.id]||[]).map((point,k)=>point?{k,d:gtfsDistance(lat,lng,...point)}:null)
          .filter(p=>p && p.d<=90).sort((a,b)=>a.d-b.d);
        return nearby.length && (!nearby[1] || nearby[1].d-nearby[0].d>25)?nearby[0].k:-1;
      }
      const a=platform(i),b=platform(j);
      if(a<0 || b<0 || a===b)continue;
      const ordered=path.slice(Math.min(a,b),Math.max(a,b)+1);
      if(a>b)ordered.reverse();
      const shared=pattern.local.slice(i+1,j).filter(id=>ordered.includes(id));
      if(shared.length<2 || shared.some((id,k)=>k && ordered.indexOf(id)<ordered.indexOf(shared[k-1])))continue;
      const minutes=Math.max(1,Math.round(route.minutes*Math.abs(b-a)/(path.length-1)));
      trips.push({minutes,legs:[{route,from,to,fromIndex:a,toIndex:b,minutes,stops:pattern.local.slice(i,j+1)}]});
    }
  }
  return trips;
}
