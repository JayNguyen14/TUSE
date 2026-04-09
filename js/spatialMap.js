/**
 * spatialMap.js
 * Leaflet base map + D3 SVG overlay for neighbourhood-level crime clusters.
 */

const SpatialMap = (() => {
  // State
  let map, g;
  let clustersData = [];
  let neighbourhoodByHood = {};  // hood_id -> array of neighbourhood_data rows
  let currentCategory = "All";
  let currentTimeOfDay = "all";
  let highlightedHoodId = null;  // hover highlight (temporary)
  let selectedHoodId = null;     // click selection (persistent)
  let currentYearRange = null;   // [startYear, endYear] or null for all
  let tileLayer = null;

  const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

  // Category colors matching CSS vars
  const CATEGORY_COLORS = {
    "Assault": "#e05252",
    "Auto Theft": "#e8a838",
    "Break and Enter": "#5ba3e6",
    "Robbery": "#8b5cf6",
    "Theft Over": "#34d399",
    "All": "#9ca3af",
  };

  function init(clusters, neighbourhoodData) {
    clustersData = clusters;

    // Pre-index neighbourhood data by hood_id for fast lookups
    neighbourhoodByHood = {};
    neighbourhoodData.forEach(row => {
      if (!neighbourhoodByHood[row.hood_id]) {
        neighbourhoodByHood[row.hood_id] = [];
      }
      neighbourhoodByHood[row.hood_id].push(row);
    });

    // Initialize Leaflet map centered on Toronto
    map = L.map("map-container", {
      center: [43.70, -79.40],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    // Add map tiles (dark by default, swappable via setTheme)
    const initialTheme = document.documentElement.getAttribute("data-theme") || "dark";
    tileLayer = L.tileLayer(initialTheme === "light" ? LIGHT_TILES : DARK_TILES, {
      attribution: TILE_ATTR,
      maxZoom: 18,
    }).addTo(map);

    // Use Leaflet's L.svg() overlay - it handles zoom/pan transforms automatically.
    // We set pointer-events to "all" on each individual circle instead of on the SVG,
    // so the SVG background still passes events through to Leaflet for pan/zoom.
    L.svg({ interactive: true }).addTo(map);
    const svgEl = d3.select("#map-container").select(".leaflet-overlay-pane svg");
    g = svgEl.select("g");

    // Click on map background to clear selection
    map.on("click", () => {
      if (selectedHoodId) {
        selectedHoodId = null;
        render();
        document.dispatchEvent(new CustomEvent("cluster-select", {
          detail: { hood_id: null }
        }));
      }
    });

    // Render clusters whenever the map moves
    map.on("moveend", render);
    map.on("zoomend", render);

    // Initial render
    render();

    // Hide loading
    document.getElementById("map-loading").classList.add("hidden");
  }

  function getClusterCount(d) {
    const rows = neighbourhoodByHood[d.hood_id];
    if (!rows || rows.length === 0) return d.total;

    // Filter rows by current category
    let filtered;
    if (currentCategory === "All") {
      filtered = rows.filter(r => r.category === "All");
    } else {
      filtered = rows.filter(r => r.category === currentCategory);
    }

    // Filter by year range
    if (currentYearRange) {
      const [y0, y1] = currentYearRange;
      filtered = filtered.filter(r => r.year >= y0 && r.year <= y1);
    }

    // Sum by time of day
    if (currentTimeOfDay === "Day") {
      return d3.sum(filtered.filter(r => r.timeOfDay === "Day"), r => r.count);
    } else if (currentTimeOfDay === "Night") {
      return d3.sum(filtered.filter(r => r.timeOfDay === "Night"), r => r.count);
    } else {
      return d3.sum(filtered, r => r.count);
    }
  }

  function render() {
    const filtered = clustersData
      .map(d => ({ ...d, count: getClusterCount(d) }))
      .filter(d => d.count > 0);

    // Scale circle radius
    const maxCount = d3.max(filtered, d => d.count) || 1;
    const radiusScale = d3.scaleSqrt()
      .domain([0, maxCount])
      .range([4, 35]);

    const fillColor = CATEGORY_COLORS[currentCategory] || CATEGORY_COLORS["All"];

    // Determine which hood_id to highlight (selected takes priority over hovered)
    const activeHoodId = selectedHoodId || highlightedHoodId;

    // Data join
    const circles = g.selectAll(".cluster-circle")
      .data(filtered, d => d.hood_id);

    // Exit
    circles.exit()
      .transition().duration(300)
      .attr("r", 0)
      .remove();

    // Enter
    const enter = circles.enter()
      .append("circle")
      .attr("class", "cluster-circle")
      .attr("r", 0);

    // Merge enter + update
    const merged = enter.merge(circles);

    // Bind mouse/click events with pointer-events enabled per circle
    merged
      .style("pointer-events", "all")
      .on("mouseover", (event, d) => {
        showTooltip(event, d);
        showHoverLabel(d);
      })
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseout", () => {
        hideTooltip();
        hideHoverLabel();
      })
      .on("click", (event, d) => {
        event.stopPropagation(); // don't trigger map.on("click")
        // Toggle selection: click same = deselect, click different = select
        if (selectedHoodId === d.hood_id) {
          selectedHoodId = null;
        } else {
          selectedHoodId = d.hood_id;
        }
        render();
        document.dispatchEvent(new CustomEvent("cluster-select", {
          detail: { hood_id: selectedHoodId, neighbourhood: d.neighbourhood }
        }));
      });

    // Position using Leaflet's coordinate transform
    merged
      .each(function (d) {
        const point = map.latLngToLayerPoint([d.lat, d.lon]);
        d3.select(this)
          .attr("cx", point.x)
          .attr("cy", point.y);
      })
      .transition().duration(400)
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => {
        if (selectedHoodId === d.hood_id) return d3.color(fillColor).brighter(0.3);
        return fillColor;
      })
      .attr("stroke", d => {
        if (selectedHoodId === d.hood_id) return "#fff";
        return d3.color(fillColor).brighter(0.5);
      })
      .attr("stroke-width", d => selectedHoodId === d.hood_id ? 2.5 : 1.5)
      .attr("class", d => {
        let cls = "cluster-circle";
        if (activeHoodId && d.hood_id !== activeHoodId) cls += " dimmed";
        if (selectedHoodId === d.hood_id) cls += " selected";
        return cls;
      });

    // Permanent labels for larger clusters
    const labels = g.selectAll(".cluster-label")
      .data(filtered.filter(d => radiusScale(d.count) > 14), d => d.hood_id);

    labels.exit().remove();

    labels.enter()
      .append("text")
      .attr("class", "cluster-label")
      .merge(labels)
      .each(function (d) {
        const point = map.latLngToLayerPoint([d.lat, d.lon]);
        d3.select(this)
          .attr("x", point.x)
          .attr("y", point.y)
          .text(d.count >= 1000 ? (d.count / 1000).toFixed(1) + "k" : d.count);
      });

    // Update badge
    const totalShown = d3.sum(filtered, d => d.count);
    document.getElementById("map-badge").textContent =
      `${filtered.length} clusters · ${totalShown.toLocaleString()} incidents`;
  }

  // -- Hover label (for small circles without permanent labels) --
  function showHoverLabel(d) {
    g.selectAll(".hover-label-group").remove();

    const point = map.latLngToLayerPoint([d.lat, d.lon]);
    const count = getClusterCount(d);
    const name = d.neighbourhood.replace(/\s*\(\d+\)/, "");
    const labelText = name.length > 18 ? name.substring(0, 16) + "…" : name;

    const group = g.append("g")
      .attr("class", "hover-label-group")
      .attr("transform", `translate(${point.x},${point.y})`);

    group.append("text")
      .attr("class", "hover-count")
      .attr("y", -18)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--accent-gold)")
      .attr("font-size", "12px")
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .style("text-shadow", "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)")
      .text(count >= 1000 ? (count / 1000).toFixed(1) + "k" : count);

    group.append("text")
      .attr("class", "hover-name")
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--text-primary)")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .style("text-shadow", "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)")
      .text(labelText);
  }

  function hideHoverLabel() {
    g.selectAll(".hover-label-group").remove();
  }

  function showTooltip(event, d) {
    const tooltip = document.getElementById("tooltip");
    const count = getClusterCount(d);
    let html = `<div class="tooltip__title">${d.neighbourhood}</div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">Total Incidents</span><span class="tooltip__value">${count.toLocaleString()}</span></div>`;
    html += `<div class="tooltip__divider"></div>`;

    // Compute filtered category breakdown and day/night from neighbourhood data
    const rows = neighbourhoodByHood[d.hood_id] || [];
    let catRows = rows;
    if (currentYearRange) {
      const [y0, y1] = currentYearRange;
      catRows = catRows.filter(r => r.year >= y0 && r.year <= y1);
    }

    // Category breakdown (use individual category rows, not "All")
    const cats = ["Assault", "Auto Theft", "Break and Enter", "Robbery", "Theft Over"];
    cats.forEach(cat => {
      const catFiltered = catRows.filter(r => r.category === cat);
      const val = d3.sum(catFiltered, r => r.count);
      if (val > 0) {
        html += `<div class="tooltip__row">
          <span class="tooltip__label" style="display:flex;align-items:center;gap:5px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${CATEGORY_COLORS[cat]};display:inline-block;"></span>
            ${cat}
          </span>
          <span class="tooltip__value">${val.toLocaleString()}</span>
        </div>`;
      }
    });

    // Day/Night split (from "All" category rows to avoid double-counting)
    const allCatRows = catRows.filter(r => r.category === "All");
    const dayCount = d3.sum(allCatRows.filter(r => r.timeOfDay === "Day"), r => r.count);
    const nightCount = d3.sum(allCatRows.filter(r => r.timeOfDay === "Night"), r => r.count);

    html += `<div class="tooltip__divider"></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☀ Day</span><span class="tooltip__value">${dayCount.toLocaleString()}</span></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☾ Night</span><span class="tooltip__value">${nightCount.toLocaleString()}</span></div>`;

    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    moveTooltip(event);

    // Highlight in bar chart (hover, temporary)
    document.dispatchEvent(new CustomEvent("map-hover", {
      detail: { hood_id: d.hood_id }
    }));
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById("tooltip");
    const x = event.clientX + 16;
    const y = event.clientY - 10;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function hideTooltip() {
    document.getElementById("tooltip").classList.remove("visible");
    document.dispatchEvent(new CustomEvent("map-hover", {
      detail: { hood_id: null }
    }));
  }

  function setCategory(category) {
    currentCategory = category;
    render();
  }

  function setTimeOfDay(tod) {
    currentTimeOfDay = tod;
    render();
  }

  function highlightNeighbourhood(hoodId) {
    highlightedHoodId = hoodId;
    render();
  }

  function selectNeighbourhood(hoodId) {
    selectedHoodId = hoodId;
    render();
  }

  function panToNeighbourhood(hoodId) {
    if (!hoodId || !map) return;
    const cluster = clustersData.find(d => d.hood_id === hoodId);
    if (cluster) {
      selectedHoodId = hoodId;
      map.flyTo([cluster.lat, cluster.lon], 14, { duration: 0.8 });
      render();
    }
  }

  function setYearRange(range) {
    currentYearRange = range;
    render();
  }

  function setTheme(theme) {
    if (!map || !tileLayer) return;
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(theme === "light" ? LIGHT_TILES : DARK_TILES, {
      attribution: TILE_ATTR,
      maxZoom: 18,
    }).addTo(map);
    render();
  }

  return { init, setCategory, setTimeOfDay, highlightNeighbourhood, selectNeighbourhood, panToNeighbourhood, setYearRange, setTheme, render };
})();
