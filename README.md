# TUSE: Toronto Urban Safety Explorer

An interactive multi-view dashboard for exploring Toronto's Major Crime Indicators dataset (2014–2024). Built with **D3.js** and **Leaflet**, the dashboard provides linked spatial, temporal, and neighbourhood-level visualizations to help users discover crime patterns across the city.

![Dashboard Preview](docs/dashboard_preview.png)

---

## Features

### 🗺️ Clustered Spatial Map
- Leaflet dark-themed base map with D3 SVG overlay
- **158 neighbourhood-level clusters** with proportional circle sizing
- Hover reveals neighbourhood name, crime count, full category breakdown, and Day/Night split
- Clusters update dynamically when filters are applied

### 📊 Enriched Horizontal Bar Chart
- Ranks the top 25 neighbourhoods by total crime volume
- Each bar is split into **Day** (gold) and **Night** (blue) segments
- Hover highlights the corresponding cluster on the map (and vice versa)

### 📈 Interactive Timeline
- Stacked area chart showing monthly trends for all 5 crime categories
- **Linked brushing** — drag to select a time range and all other views filter accordingly
- Dimming overlays highlight the selected period
- COVID-19 annotation marks the pandemic peak

### 🔗 Cross-View Linking
All three views are fully linked:

| Interaction | Effect |
|---|---|
| **Category dropdown** | Updates map colors/sizes, bar chart rankings, timeline highlighting |
| **Day / Night toggle** | Filters map clusters and bar chart segments |
| **Timeline brush** | Filters map and bar chart to the selected year range |
| **Map hover** | Shows tooltip + highlights corresponding bar chart row |
| **Bar chart hover** | Highlights corresponding map cluster |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Visualization | [D3.js v7](https://d3js.org/) |
| Map | [Leaflet v1.9.4](https://leafletjs.com/) with [CARTO](https://carto.com/) dark tiles |
| Data Pipeline | Python 3 + Pandas + NumPy |
| Styling | Vanilla CSS (dark theme, glassmorphism tooltips) |
| Typography | [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts |

---

## Getting Started

### Prerequisites

- **Python 3.8+** (for the data pipeline)
- A modern web browser (Chrome, Firefox, Safari, Edge)

### 1. Clone the Repository

```bash
git clone https://github.com/JayNguyen14/TUSE.git
cd TUSE
```

### 2. Download the Dataset

Download the **Major Crime Indicators** dataset from the [Toronto Open Data Portal](https://open.toronto.ca/dataset/major-crime-indicators/) and place the CSV file at:

```
data/major-crime-indicators.csv
```

### 3. Run the Data Pipeline

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
pip install pandas numpy
```

Run the pipeline to generate the processed JSON files:

```bash
python3 pipeline.py
```

You should see output like:

```
Loading data/major-crime-indicators.csv …
  Raw rows: 420,200
  ...
✅ Pipeline complete.
```

### 4. Start the Dashboard

Serve the project with any static file server:

```bash
python3 -m http.server 8000
```

Then open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## Usage

1. **Filter by crime category** — Use the dropdown in the header to select a specific crime type (Assault, Auto Theft, etc.) or view all categories.
2. **Toggle Day / Night** — Click the Day or Night buttons to filter by time of day.
3. **Brush the timeline** — Click and drag on the timeline to select a year range. The map and bar chart will update to show only crimes within that period. Click outside the brush to clear it.
4. **Hover on the map** — Mouse over any cluster circle to see a detailed tooltip with category and Day/Night breakdowns. Smaller circles without permanent labels also show their name and count on hover.
5. **Hover on the bar chart** — Mouse over a neighbourhood row to highlight the corresponding cluster on the map.

---

## Data Source

**Major Crime Indicators** — City of Toronto Open Data  
[https://open.toronto.ca/dataset/major-crime-indicators/](https://open.toronto.ca/dataset/major-crime-indicators/)

The dataset contains approximately 420,000 reported crime incidents from 2014 to 2024, categorized into five Major Crime Indicator (MCI) types:
- Assault
- Auto Theft
- Break and Enter
- Robbery
- Theft Over

---

## License

This project is for academic use as part of COMP 7920 at the University of Manitoba.
