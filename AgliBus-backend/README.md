# AgliBus backend
Standalone API extracted from AgliBus GFTS, with a Node HTTP adapter and server-side pickup search. Node.js 22+ and npm required. Run npm start from this folder. Default port 3000, configurable with PORT. No package installation or API key required.
  
GET /api/stops lists pickup and destination IDs with names and coordinates.
GET /api/arrivals?from=13&to=1 returns upcoming pickup times for Rana Pratap Nagar Railway Station to Chetak Circle. Times are Unix milliseconds. source is gps or timetable. A null delay means the timetable comparison is unavailable.
GET /api/fleet lists vehicles and upstream feed status.
GET /api/buses?q=3165 filters by registration.
  
Live GPS requires network access to BharatChopal's public feeds. Inspect feeds for errors or stale data. Keep the process running across polls for movement-based direction estimates. The bundled UCTSL timetable works with no upstream GPS and is limited by its service calendar. This package uses the branch's existing route hints. Historical stand-times and additional hints discussed in the audit are not bundled.
  
Static schedule source: https://github.com/reclaimchennai/India_GTFS/tree/main/rajasthan/udaipur
To refresh it, run python3 scripts/import-udaipur.py /path/to/bus.zip and restart. More route and stop metadata is in web/network.js. The web directory contains shared backend data and calculation modules.
