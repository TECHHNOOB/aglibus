# AgliBus (अगलीबस) • Udaipur City Bus Tracker

> Real-time city bus tracking, live GPS fleet visualization, route planner, and offline timetables for Udaipur City Transit (PM e-Bus & UCTSL).

![AgliBus Banner](https://lh3.googleusercontent.com/aida/ALJJyrB_Ox_xS8pPiTOffs5hc5E4imVemLFY3HKhcfCqae6qa5ObF8KFKm54FNYOxvNzsu747-5-Wdt_gL3n7ZE9mhqVkcy7uT60FSGKNdc6ud3gjF3MfeNAPy83DOV1sLLztBcvgdiF8PqmHqpm-CLMmKlogucT5ppueaMvnav_-OL3itDMqgsArIoc5hsUrcIKlThBnnivpwpCJzB9vTr7lXPIlEc3jdXH0rnVoPRDAx1R_A)

## 🌟 Key Features

- 🚌 **Live GPS Fleet Tracking**: Direct real-time tracking of active PM e-Bus and UCTSL buses in Udaipur with speed, vehicle plate registration (e.g. `RJ 27 PC 0734`), and nearest stop estimation.
- 🗺️ **Interactive Bus Map**: Powered by Leaflet with custom bus markers, live direction, and route polylines.
- 🕒 **Offline-First Timetable**: Full stop-by-stop schedule and quick departure timings grid with destination stop names (no confusing "सेवा #1" labels).
- 🧭 **Radar Mode**: Discover nearby buses and stops within 500m to 5km based on your live geolocation.
- 🌐 **100% Bilingual Support**: Instant seamless one-tap toggle between **Hindi (हिन्दी)** and **English (EN)** for all 319 bus stops and 24 passenger routes.
- 🔄 **Smart Transit Planner**: Boarding to destination routing with shortest travel times and interchange options.
- 📱 **Mobile Neo-Utility UI**: Designed following Material 3 and modern transit dashboard aesthetics.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **UI & Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: Google Material Symbols
- **Maps**: [Leaflet](https://leafletjs.com/) & OpenStreetMap
- **State & i18n**: React Context API with LocalStorage persistence
- **Backend APIs**: Next.js Serverless Route Handlers with real-time BharatChopal AVL feed aggregation

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18.17.0 or later)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/TECHHNOOB/aglibus.git

# Navigate into the project folder
cd aglibus

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Production Build

```bash
npm run build
npm start
```

---

## 📡 API Endpoints

- `GET /api/fleet`: Live bus locations, speeds, battery SoC, and route matching.
- `GET /api/routes`: Complete route catalog with stop sequences and GPS polyline points.
- `GET /api/stops`: 319+ bus stop master catalog with coordinates and bilingual names.
- `GET /api/timetable`: Departure schedules and public transit observations.
- `GET /api/plan?from=...&to=...`: Origin-to-destination transit pathfinder.

---

## 📄 License

MIT License. Designed & Developed for the citizens and commuters of Udaipur.
