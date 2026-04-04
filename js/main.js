/**
 * main.js
 * Entry point — loads data, initializes all 3 views,
 * and wires up cross-view linking.
 */

(async function () {
  "use strict";

  // ── Load data ──────────────────────────────────────────────────
  const [clusters, temporal, neighbourhood] = await Promise.all([
    d3.json("data/processed/spatial_clusters.json"),
    d3.json("data/processed/temporal_data.json"),
    d3.json("data/processed/neighbourhood_data.json"),
  ]);

  console.log("Data loaded:", {
    clusters: clusters.length,
    temporal: temporal.length,
    neighbourhood: neighbourhood.length,
  });

  // ── Initialize views ──────────────────────────────────────────
  SpatialMap.init(clusters);
  Timeline.init(temporal);
  BarChart.init(neighbourhood);

  // ── Category selector ─────────────────────────────────────────
  const categorySelect = document.getElementById("category-select");
  categorySelect.addEventListener("change", () => {
    const category = categorySelect.value;
    SpatialMap.setCategory(category);
    Timeline.setCategory(category);
    BarChart.setCategory(category);
  });

  // ── Day/Night toggle ──────────────────────────────────────────
  const toggleBtns = document.querySelectorAll("#time-toggle .toggle-btn");
  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tod = btn.dataset.value;
      SpatialMap.setTimeOfDay(tod);
      BarChart.setTimeOfDay(tod);
    });
  });

  // ── Cross-view: Map hover → Bar chart highlight ─────────────
  document.addEventListener("map-hover", (e) => {
    BarChart.highlightNeighbourhood(e.detail.hood_id);
  });

  // ── Cross-view: Bar hover → Map highlight ───────────────────
  document.addEventListener("bar-hover", (e) => {
    SpatialMap.highlightNeighbourhood(e.detail.hood_id);
  });

  // ── Cross-view: Cluster click → Bar highlight ───────────────
  document.addEventListener("cluster-click", (e) => {
    BarChart.highlightNeighbourhood(e.detail.hood_id);
  });

  // ── Cross-view: Timeline brush → Map + Bar filter ───────────
  document.addEventListener("timeline-brush", (e) => {
    const { yearRange } = e.detail;
    SpatialMap.setYearRange(yearRange);
    BarChart.setYearRange(yearRange);
  });

  // ── Handle window resize ──────────────────────────────────────
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      BarChart.render();
      // Timeline would need full re-init for resize; skip for prototype
    }, 250);
  });

})();
