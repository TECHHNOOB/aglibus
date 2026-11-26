"""Convert the Reclaim Chennai Udaipur (UCTSL) static feed to a bundled timetable."""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

def seconds(value):
    h, m, s = map(int, value.split(":"))
    return 3600 * h + 60 * m + s

with zipfile.ZipFile(sys.argv[1]) as feed:
    def table(name):
        with feed.open(name + ".txt") as stream:
            return list(csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig")))

    stops = table("stops")
    indexes = {row["stop_id"]: i for i, row in enumerate(stops)}
    times = defaultdict(list)
    for row in table("stop_times"):
        times[row["trip_id"]].append((int(row["stop_sequence"]), indexes[row["stop_id"]],
                                     seconds(row["departure_time"]), seconds(row["arrival_time"])))
    routes = {r["route_id"]: r for r in table("routes") if r["agency_id"] == "UCTSL"}
    patterns = {}
    for trip in table("trips"):
        route = routes.get(trip["route_id"])
        if not route:
            continue
        rows = sorted(times[trip["trip_id"]])
        path = tuple(r[1] for r in rows)
        key = (trip["route_id"], path)
        entry = patterns.setdefault(key, dict(code=route["route_short_name"].split()[0],
                                    title=route["route_long_name"], stops=path, trips=[]))
        entry["trips"].append([trip["service_id"], [r[2] for r in rows], [r[3] for r in rows], trip["trip_id"]])
    data = dict(version=table("feed_info")[0]["feed_version"], calendar=table("calendar"),
                exceptions=table("calendar_dates") if "calendar_dates.txt" in feed.namelist() else [],
                stops=[[s["stop_name"], float(s["stop_lat"]), float(s["stop_lon"])] for s in stops],
                patterns=list(patterns.values()))
target = Path(__file__).resolve().parents[1] / "web" / "udaipur-gtfs.js"
target.write_text("const udaipurGTFS=" + json.dumps(data, separators=(",", ":")) + ";\n")
