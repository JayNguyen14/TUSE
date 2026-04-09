/**
 * main.js
 * Entry point - loads data, initializes all 3 views,
 * and wires up cross-view linking.
 */

(async function () {
  "use strict";

  // -- Theme: apply saved preference immediately ----------------
  const savedTheme = localStorage.getItem("tuse-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeUI(savedTheme);

  function updateThemeUI(theme) {
    const icon = document.getElementById("theme-icon");
    const label = document.getElementById("theme-label");
    if (icon) icon.textContent = theme === "light" ? "☀️" : "🌙";
    if (label) label.textContent = theme === "light" ? "Light" : "Dark";
  }

  // -- Load data --------------------------------------------------
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

  // -- Initialize views ------------------------------------------
  SpatialMap.init(clusters, neighbourhood);
  Timeline.init(temporal);
  BarChart.init(neighbourhood);

  // -- Set date input min/max based on data ----------------------
  const domain = Timeline.getXDomain();
  if (domain) {
    const dateStart = document.getElementById("date-start");
    const dateEnd = document.getElementById("date-end");
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    dateStart.min = fmt(domain[0]);
    dateStart.max = fmt(domain[1]);
    dateEnd.min = fmt(domain[0]);
    dateEnd.max = fmt(domain[1]);
  }

  // -- Category selector ----------------------------------------
  const categorySelect = document.getElementById("category-select");
  categorySelect.addEventListener("change", () => {
    const category = categorySelect.value;
    SpatialMap.setCategory(category);
    Timeline.setCategory(category);
    BarChart.setCategory(category);
  });

  // -- Day/Night toggle ------------------------------------------
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

  // -- Theme toggle ----------------------------------------------
  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tuse-theme", next);
    updateThemeUI(next);
    SpatialMap.setTheme(next);
  });

  // -- Sort toggle ----------------------------------------------
  const sortToggle = document.getElementById("sort-toggle");
  const sortIcon = document.getElementById("sort-icon");
  sortToggle.addEventListener("click", () => {
    const newOrder = BarChart.toggleSort();
    sortIcon.textContent = newOrder === "desc" ? "↓" : "↑";
    sortToggle.childNodes[sortToggle.childNodes.length - 1].textContent =
      " " + (newOrder === "desc" ? "Desc" : "Asc");
  });

  // -- Date inputs -> Timeline brush ----------------------------
  const dateStart = document.getElementById("date-start");
  const dateEnd = document.getElementById("date-end");
  const dateClear = document.getElementById("date-clear");

  function applyDateInputs() {
    if (dateStart.value && dateEnd.value) {
      const [sy, sm] = dateStart.value.split("-").map(Number);
      const [ey, em] = dateEnd.value.split("-").map(Number);
      const start = new Date(sy, sm - 1, 1);
      const end = new Date(ey, em - 1, 28); // end of month approx
      if (start < end) {
        Timeline.setBrushRange(start, end);
      }
    }
  }

  dateStart.addEventListener("change", applyDateInputs);
  dateEnd.addEventListener("change", applyDateInputs);

  dateClear.addEventListener("click", () => {
    dateStart.value = "";
    dateEnd.value = "";
    Timeline.setBrushRange(null, null);
  });

  // -- Cross-view: Map hover -> Bar chart highlight (temporary) --
  document.addEventListener("map-hover", (e) => {
    BarChart.highlightNeighbourhood(e.detail.hood_id);
  });

  // -- Cross-view: Bar hover -> Map highlight (temporary) --------
  document.addEventListener("bar-hover", (e) => {
    SpatialMap.highlightNeighbourhood(e.detail.hood_id);
  });

  // -- Cross-view: Cluster click -> persistent selection --------
  document.addEventListener("cluster-select", (e) => {
    BarChart.selectNeighbourhood(e.detail.hood_id);
  });

  // -- Cross-view: Bar click -> select and center map on cluster --
  document.addEventListener("bar-select", (e) => {
    if (e.detail.hood_id) {
      SpatialMap.panToNeighbourhood(e.detail.hood_id);
    } else {
      SpatialMap.selectNeighbourhood(null);
    }
  });

  // -- Cross-view: Timeline brush -> Map + Bar filter ------------
  document.addEventListener("timeline-brush", (e) => {
    const { yearRange, dateRange } = e.detail;
    SpatialMap.setYearRange(yearRange);
    BarChart.setYearRange(yearRange);

    // Sync date inputs with brush selection
    if (dateRange) {
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      dateStart.value = fmt(dateRange[0]);
      dateEnd.value = fmt(dateRange[1]);
    } else {
      dateStart.value = "";
      dateEnd.value = "";
    }
  });

  // -- Handle window resize --------------------------------------
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      BarChart.render();
    }, 250);
  });

})();
