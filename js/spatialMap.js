/**
 * spatialMap.js
 * Leaflet base map + D3 SVG overlay for neighbourhood-level crime clusters.
 */

const SpatialMap = (() => {
  // State
  let map, svgLayer, g;
  let clustersData = [];
  let currentCategory = "All";
  let currentTimeOfDay = "all";
  let highlightedHoodId = null;
  let currentYearRange = null; // [startYear, endYear] or null for all

  // Category colors matching CSS vars
  const CATEGORY_COLORS = {
    "Assault":         "#e05252",
    "Auto Theft":      "#e8a838",
    "Break and Enter": "#5ba3e6",
    "Robbery":         "#8b5cf6",
    "Theft Over":      "#34d399",
    "All":             "#e8a838",
  };

  function init(clusters) {
    clustersData = clusters;

    // Initialize Leaflet map centered on Toronto
    map = L.map("map-container", {
      center: [43.70, -79.40],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    // Add dark OpenStreetMap tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(map);

    // Create a standalone SVG overlay for D3 circles.
    // We do NOT use L.svg() because Leaflet's overlay pane sets
    // pointer-events:none on the SVG, which blocks hover events.
    // Instead, we manually create an SVG and position it over the map.
    const mapContainer = document.getElementById("map-container");
    const svgEl = d3.select(mapContainer)
      .append("svg")
      .attr("id", "map-svg-overlay")
      .style("position", "absolute")
      .style("top", "0")
      .style("left", "0")
      .style("width", "100%")
      .style("height", "100%")
      .style("z-index", "400") // above tiles, below controls
      .style("pointer-events", "none"); // SVG background passes through

    g = svgEl.append("g");

    // Render clusters whenever the map moves
    map.on("moveend", render);
    map.on("zoomend", render);

    // Initial render
    render();

    // Hide loading
    document.getElementById("map-loading").classList.add("hidden");
  }

  function getClusterCount(d) {
    // If a year range is set, sum only the years in range
    if (currentYearRange) {
      const [y0, y1] = currentYearRange;
      let rangeTotal = 0;
      for (const [yr, cnt] of Object.entries(d.yearly)) {
        if (+yr >= y0 && +yr <= y1) rangeTotal += cnt;
      }
      if (rangeTotal === 0) return 0;
      // Apply category and time-of-day ratios to the year-filtered total
      const yearRatio = rangeTotal / (d.total || 1);
      if (currentCategory === "All") {
        if (currentTimeOfDay === "all") return rangeTotal;
        if (currentTimeOfDay === "Day") return Math.round(d.day * yearRatio);
        return Math.round(d.night * yearRatio);
      }
      const catCount = Math.round((d.categories[currentCategory] || 0) * yearRatio);
      if (currentTimeOfDay === "all") return catCount;
      const todRatio = currentTimeOfDay === "Day"
        ? d.day / (d.total || 1)
        : d.night / (d.total || 1);
      return Math.round(catCount * todRatio);
    }

    // No year filter — original logic
    if (currentCategory === "All") {
      if (currentTimeOfDay === "all") return d.total;
      if (currentTimeOfDay === "Day") return d.day;
      return d.night;
    }
    const catCount = d.categories[currentCategory] || 0;
    if (currentTimeOfDay === "all") return catCount;
    const ratio = currentTimeOfDay === "Day"
      ? d.day / (d.total || 1)
      : d.night / (d.total || 1);
    return Math.round(catCount * ratio);
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

    // Merge enter + update: apply position, style, AND event handlers
    const merged = enter.merge(circles);

    // Re-bindmouse events on every render (handles data changes)
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
        document.dispatchEvent(new CustomEvent("cluster-click", {
          detail: { hood_id: d.hood_id, neighbourhood: d.neighbourhood }
        }));
      });

    merged
      .each(function(d) {
        const point = map.latLngToLayerPoint([d.lat, d.lon]);
        d3.select(this)
          .attr("cx", point.x)
          .attr("cy", point.y);
      })
      .transition().duration(400)
      .attr("r", d => radiusScale(d.count))
      .attr("fill", fillColor)
      .attr("stroke", d3.color(fillColor).brighter(0.5))
      .attr("class", d => {
        let cls = "cluster-circle";
        if (highlightedHoodId && d.hood_id !== highlightedHoodId) cls += " dimmed";
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
      .each(function(d) {
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

  // ── Hover label (for small circles without permanent labels) ───
  function showHoverLabel(d) {
    // Remove any existing hover label
    g.selectAll(".hover-label-group").remove();

    const point = map.latLngToLayerPoint([d.lat, d.lon]);
    const count = getClusterCount(d);
    const name = d.neighbourhood.replace(/\s*\(\d+\)/, "");
    const labelText = name.length > 18 ? name.substring(0, 16) + "…" : name;

    const group = g.append("g")
      .attr("class", "hover-label-group")
      .attr("transform", `translate(${point.x},${point.y})`);

    // Count badge above the circle
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

    // Neighbourhood name below the circle
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

    // Category breakdown
    const cats = ["Assault", "Auto Theft", "Break and Enter", "Robbery", "Theft Over"];
    cats.forEach(cat => {
      const val = d.categories[cat] || 0;
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

    html += `<div class="tooltip__divider"></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☀ Day</span><span class="tooltip__value">${d.day.toLocaleString()}</span></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☾ Night</span><span class="tooltip__value">${d.night.toLocaleString()}</span></div>`;

    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    moveTooltip(event);

    // Highlight in bar chart
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

  function setYearRange(range) {
    currentYearRange = range; // [startYear, endYear] or null
    render();
  }

  return { init, setCategory, setTimeOfDay, highlightNeighbourhood, setYearRange, render };
})();
