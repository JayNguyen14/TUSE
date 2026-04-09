/**
 * barChart.js
 * Horizontal bar chart ranking neighbourhoods by crime count,
 * with Day/Night segment split and sort toggle.
 */

const BarChart = (() => {
  // State
  let neighbourhoodData = [];
  let currentCategory = "All";
  let currentTimeOfDay = "all";
  let highlightedHoodId = null;
  let selectedHoodId = null;     // persistent click selection
  let currentYearRange = null;   // [startYear, endYear] or null
  let sortOrder = "desc";        // "desc" (highest first) or "asc" (lowest first)
  let svg, container;

  const ROW_HEIGHT = 28;
  const BAR_HEIGHT = 14;
  const LABEL_WIDTH = 180;
  const COUNT_WIDTH = 50;

  const margin = { top: 0, right: 10, bottom: 0, left: 0 };

  function init(data) {
    neighbourhoodData = data;
    container = document.getElementById("bar-chart-container");
    svg = d3.select("#bar-chart-svg");
    render();
  }

  function getFilteredData() {
    // Filter by category
    let filtered;
    if (currentCategory === "All") {
      filtered = neighbourhoodData.filter(d => d.category === "All");
    } else {
      filtered = neighbourhoodData.filter(d => d.category === currentCategory);
    }

    // Filter by year range if brush is active
    if (currentYearRange) {
      const [y0, y1] = currentYearRange;
      filtered = filtered.filter(d => d.year >= y0 && d.year <= y1);
    }

    // Group by neighbourhood, sum day + night (across years)
    const grouped = d3.rollup(
      filtered,
      rows => ({
        neighbourhood: rows[0].neighbourhood,
        hood_id: rows[0].hood_id,
        day: d3.sum(rows.filter(r => r.timeOfDay === "Day"), r => r.count),
        night: d3.sum(rows.filter(r => r.timeOfDay === "Night"), r => r.count),
      }),
      d => d.hood_id
    );

    let result = Array.from(grouped.values());

    // Compute total & sort
    result.forEach(d => {
      if (currentTimeOfDay === "Day") {
        d.total = d.day;
      } else if (currentTimeOfDay === "Night") {
        d.total = d.night;
      } else {
        d.total = d.day + d.night;
      }
    });

    if (sortOrder === "desc") {
      result.sort((a, b) => b.total - a.total);
    } else {
      result.sort((a, b) => a.total - b.total);
    }
    return result;
  }

  function render() {
    const data = getFilteredData();
    const w = container.clientWidth - margin.left - margin.right;
    const h = data.length * ROW_HEIGHT;

    svg.attr("width", w + margin.left + margin.right)
      .attr("height", h + margin.top + margin.bottom);

    const g = svg.selectAll("g.bar-group").data([0]);
    const gEnter = g.enter().append("g").attr("class", "bar-group")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    const gMerge = gEnter.merge(g);

    const barWidth = w - LABEL_WIDTH - COUNT_WIDTH;
    const maxTotal = d3.max(data, d => d.day + d.night) || 1;

    const xScale = d3.scaleLinear()
      .domain([0, maxTotal])
      .range([0, barWidth]);

    // Data join for rows
    const rows = gMerge.selectAll(".bar-row")
      .data(data, d => d.hood_id);

    rows.exit().transition().duration(300).attr("opacity", 0).remove();

    const rowsEnter = rows.enter()
      .append("g")
      .attr("class", "bar-row")
      .attr("transform", (d, i) => `translate(0,${i * ROW_HEIGHT})`)
      .attr("opacity", 0);

    // Background rect for hover
    rowsEnter.append("rect")
      .attr("class", "bar-bg")
      .attr("width", w)
      .attr("height", ROW_HEIGHT)
      .attr("fill", "transparent")
      .attr("rx", 3);

    // Rank number
    rowsEnter.append("text")
      .attr("class", "bar-rank")
      .attr("x", 8)
      .attr("y", ROW_HEIGHT / 2)
      .attr("dominant-baseline", "central")
      .attr("fill", "var(--text-muted)")
      .attr("font-size", "10px");

    // Neighbourhood label
    rowsEnter.append("text")
      .attr("class", "bar-label")
      .attr("x", 28)
      .attr("y", ROW_HEIGHT / 2)
      .attr("dominant-baseline", "central");

    // Day bar
    rowsEnter.append("rect")
      .attr("class", "bar-day")
      .attr("y", (ROW_HEIGHT - BAR_HEIGHT) / 2)
      .attr("height", BAR_HEIGHT)
      .attr("rx", 2);

    // Night bar
    rowsEnter.append("rect")
      .attr("class", "bar-night")
      .attr("y", (ROW_HEIGHT - BAR_HEIGHT) / 2)
      .attr("height", BAR_HEIGHT)
      .attr("rx", 2);

    // Count label
    rowsEnter.append("text")
      .attr("class", "bar-count")
      .attr("y", ROW_HEIGHT / 2)
      .attr("dominant-baseline", "central");

    // Merge enter + update
    const allRows = rowsEnter.merge(rows);

    allRows
      .on("mouseover", function (event, d) {
        highlightedHoodId = d.hood_id;
        updateHighlight();
        document.dispatchEvent(new CustomEvent("bar-hover", {
          detail: { hood_id: d.hood_id }
        }));
        showTooltip(event, d);
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseout", function () {
        highlightedHoodId = null;
        updateHighlight();
        document.dispatchEvent(new CustomEvent("bar-hover", {
          detail: { hood_id: null }
        }));
        hideTooltip();
      })
      .on("click", function (event, d) {
        // Toggle persistent selection
        if (selectedHoodId === d.hood_id) {
          selectedHoodId = null;
        } else {
          selectedHoodId = d.hood_id;
        }
        updateHighlight();
        // Cross-link: select on map too
        document.dispatchEvent(new CustomEvent("bar-select", {
          detail: { hood_id: selectedHoodId }
        }));
      });

    allRows.transition().duration(400)
      .attr("transform", (d, i) => `translate(0,${i * ROW_HEIGHT})`)
      .attr("opacity", 1);

    // Update rank
    allRows.select(".bar-rank")
      .text((d, i) => i + 1);

    // Update labels - truncate long names
    allRows.select(".bar-label")
      .text(d => {
        const name = d.neighbourhood.replace(/\s*\(\d+\)/, "");
        return name.length > 22 ? name.substring(0, 20) + "…" : name;
      });

    // Update bars
    allRows.select(".bar-day")
      .transition().duration(400)
      .attr("x", LABEL_WIDTH)
      .attr("width", d => {
        if (currentTimeOfDay === "Night") return 0;
        return Math.max(0, xScale(d.day));
      })
      .attr("class", d => {
        let cls = "bar-day";
        if (currentTimeOfDay === "Night") cls += " dimmed";
        return cls;
      });

    allRows.select(".bar-night")
      .transition().duration(400)
      .attr("x", d => {
        if (currentTimeOfDay === "Night") return LABEL_WIDTH;
        return LABEL_WIDTH + xScale(d.day);
      })
      .attr("width", d => {
        if (currentTimeOfDay === "Day") return 0;
        return Math.max(0, xScale(d.night));
      })
      .attr("class", d => {
        let cls = "bar-night";
        if (currentTimeOfDay === "Day") cls += " dimmed";
        return cls;
      });

    allRows.select(".bar-count")
      .attr("x", w - margin.right)
      .attr("text-anchor", "end")
      .text(d => d.total.toLocaleString());
  }

  function updateHighlight() {
    // Selected takes priority over hovered
    const activeId = selectedHoodId || highlightedHoodId;

    svg.selectAll(".bar-row")
      .classed("highlighted", function (d) {
        return activeId && d.hood_id === activeId;
      })
      .classed("selected", function (d) {
        return selectedHoodId && d.hood_id === selectedHoodId;
      });

    svg.selectAll(".bar-label")
      .classed("highlighted", function (d) {
        return activeId && d.hood_id === activeId;
      });
  }

  function showTooltip(event, d) {
    const tooltip = document.getElementById("tooltip");
    let html = `<div class="tooltip__title">${d.neighbourhood}</div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☀ Day Incidents</span><span class="tooltip__value">${d.day.toLocaleString()}</span></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">☾ Night Incidents</span><span class="tooltip__value">${d.night.toLocaleString()}</span></div>`;
    html += `<div class="tooltip__divider"></div>`;
    html += `<div class="tooltip__row"><span class="tooltip__label">Total</span><span class="tooltip__value" style="color:var(--accent-gold)">${(d.day + d.night).toLocaleString()}</span></div>`;
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById("tooltip");
    let x = event.clientX + 16;
    let y = event.clientY - 10;
    // Keep tooltip on screen
    const rect = tooltip.getBoundingClientRect();
    if (x + 220 > window.innerWidth) x = event.clientX - 220;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function hideTooltip() {
    document.getElementById("tooltip").classList.remove("visible");
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
    updateHighlight();
    // Scroll to the highlighted row
    if (hoodId) {
      const rows = svg.selectAll(".bar-row").data();
      const idx = rows.findIndex(d => d.hood_id === hoodId);
      if (idx >= 0) {
        const scrollTarget = idx * ROW_HEIGHT - container.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
      }
    }
  }

  function selectNeighbourhood(hoodId) {
    selectedHoodId = hoodId;
    updateHighlight();
    // Scroll to the selected row
    if (hoodId) {
      const rows = svg.selectAll(".bar-row").data();
      const idx = rows.findIndex(d => d.hood_id === hoodId);
      if (idx >= 0) {
        const scrollTarget = idx * ROW_HEIGHT - container.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
      }
    }
  }

  function setYearRange(range) {
    currentYearRange = range; // [startYear, endYear] or null
    render();
  }

  function toggleSort() {
    sortOrder = sortOrder === "desc" ? "asc" : "desc";
    render();
    return sortOrder;
  }

  function getSortOrder() {
    return sortOrder;
  }

  return { init, setCategory, setTimeOfDay, highlightNeighbourhood, selectNeighbourhood, setYearRange, toggleSort, getSortOrder, render };
})();
