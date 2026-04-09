/**
 * timeline.js
 * Stacked area chart of monthly crime counts with D3 brush for time-range selection.
 * Brush selection dims areas outside the range and dispatches filter events.
 */

const Timeline = (() => {
  // State
  let temporalData = [];
  let currentCategory = "All";
  let brushExtent = null;
  let svg, xScale, yScale, chartG, overlayLeft, overlayRight;
  let brushRef = null;  // D3 brush reference for programmatic control
  let brushGRef = null; // brush group element

  const CATEGORIES = ["Assault", "Auto Theft", "Break and Enter", "Robbery", "Theft Over"];
  const CATEGORY_COLORS = {
    "Assault":         "#e05252",
    "Auto Theft":      "#e8a838",
    "Break and Enter": "#5ba3e6",
    "Robbery":         "#8b5cf6",
    "Theft Over":      "#34d399",
  };

  const margin = { top: 8, right: 20, bottom: 30, left: 50 };

  function init(data) {
    temporalData = data;

    // Build the legend
    buildLegend();

    // Set up SVG
    const container = document.getElementById("timeline-container");
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg = d3.select("#timeline-svg")
      .attr("width", width)
      .attr("height", height);

    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    chartG = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Parse temporal data into time-series format
    // Filter to years >= 2014 for the main visualization
    const filtered = temporalData.filter(d => d.year >= 2014);

    // Create date from year + monthNum
    filtered.forEach(d => {
      d.date = new Date(d.year, d.monthNum - 1, 1);
    });

    // Pivot by category for stacked area
    const allDates = [...new Set(filtered.filter(d => d.category !== "All").map(d => d.date.getTime()))].sort();
    const dateObjs = allDates.map(t => new Date(t));

    // Build stacked data
    const stackData = dateObjs.map(date => {
      const row = { date };
      CATEGORIES.forEach(cat => {
        const match = filtered.find(d => d.date.getTime() === date.getTime() && d.category === cat);
        row[cat] = match ? match.count : 0;
      });
      return row;
    });

    // Scales
    xScale = d3.scaleTime()
      .domain(d3.extent(dateObjs))
      .range([0, w]);

    const stack = d3.stack()
      .keys(CATEGORIES)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const series = stack(stackData);

    yScale = d3.scaleLinear()
      .domain([0, d3.max(series, s => d3.max(s, d => d[1]))])
      .nice()
      .range([h, 0]);

    // Read theme-aware grid color from CSS variable
    const gridColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--border-color').trim();

    // Axes
    chartG.append("g")
      .attr("class", "timeline-axis")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"))
        .tickSize(-h))
      .call(g => g.selectAll(".tick line")
        .attr("stroke", gridColor)
        .attr("stroke-dasharray", "2,3"))
      .call(g => g.select(".domain").remove());

    chartG.append("g")
      .attr("class", "timeline-axis")
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d3.format("~s"))
        .tickSize(-w))
      .call(g => g.selectAll(".tick line")
        .attr("stroke", gridColor)
        .attr("stroke-dasharray", "2,3"))
      .call(g => g.select(".domain").remove());

    // Area generator
    const area = d3.area()
      .x(d => xScale(d.data.date))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // Draw areas
    chartG.selectAll(".timeline-area")
      .data(series)
      .join("path")
      .attr("class", "timeline-area")
      .attr("d", area)
      .attr("fill", d => CATEGORY_COLORS[d.key])
      .attr("data-category", d => d.key);

    // Draw lines on top of areas
    const line = d3.line()
      .x(d => xScale(d.data.date))
      .y(d => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    chartG.selectAll(".timeline-line")
      .data(series)
      .join("path")
      .attr("class", "timeline-line")
      .attr("d", line)
      .attr("stroke", d => CATEGORY_COLORS[d.key])
      .attr("data-category", d => d.key);

    // COVID annotation
    const covidStart = new Date(2020, 2, 1);
    const covidEnd = new Date(2021, 5, 1);

    if (xScale(covidStart) >= 0 && xScale(covidEnd) <= w) {
      chartG.append("rect")
        .attr("x", xScale(covidStart))
        .attr("y", 0)
        .attr("width", xScale(covidEnd) - xScale(covidStart))
        .attr("height", h)
        .attr("fill", "rgba(232, 168, 56, 0.06)")
        .attr("stroke", "rgba(232, 168, 56, 0.2)")
        .attr("stroke-dasharray", "4,3");

      chartG.append("text")
        .attr("x", (xScale(covidStart) + xScale(covidEnd)) / 2)
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .attr("fill", "rgba(232, 168, 56, 0.6)")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .text("Peak COVID-19 Period");
    }

    // Brush dim overlay fill - reads current theme's background
    const dimColor = document.documentElement.getAttribute('data-theme') === 'light'
      ? 'rgba(244, 245, 247, 0.7)'
      : 'rgba(15, 17, 23, 0.65)';

    // -- Brush dimming overlays ----------------------------------
    // Semi-transparent rectangles that cover the area outside the brush selection
    overlayLeft = chartG.append("rect")
      .attr("class", "brush-dim-overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 0)
      .attr("height", h)
      .attr("fill", dimColor)
      .attr("pointer-events", "none")
      .style("display", "none");

    overlayRight = chartG.append("rect")
      .attr("class", "brush-dim-overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 0)
      .attr("height", h)
      .attr("fill", dimColor)
      .attr("pointer-events", "none")
      .style("display", "none");

    // -- Brush --------------------------------------------------
    const brush = d3.brushX()
      .extent([[0, 0], [w, h]])
      .on("brush", brushing)
      .on("end", brushEnded);

    brushRef = brush; // store reference for programmatic control

    const brushG = chartG.append("g")
      .attr("class", "timeline-brush")
      .call(brush);

    brushGRef = brushG; // store reference

    // Style brush overlay and selection
    brushG.select(".overlay")
      .attr("fill", "transparent")
      .attr("cursor", "crosshair");

    function brushing(event) {
      if (!event.selection) return;

      const [x0, x1] = event.selection;
      const d0 = xScale.invert(x0);
      const d1 = xScale.invert(x1);

      // Update dimming overlays
      overlayLeft.style("display", null)
        .attr("x", 0)
        .attr("width", x0);

      overlayRight.style("display", null)
        .attr("x", x1)
        .attr("width", w - x1);

      // Update info badge
      const info = document.getElementById("brush-info");
      info.textContent = `${d3.timeFormat("%b %Y")(d0)} - ${d3.timeFormat("%b %Y")(d1)}`;
      info.classList.add("visible");
    }

    function brushEnded(event) {
      if (!event.selection) {
        // Brush cleared
        brushExtent = null;
        overlayLeft.style("display", "none");
        overlayRight.style("display", "none");

        document.getElementById("brush-info").classList.remove("visible");
        document.dispatchEvent(new CustomEvent("timeline-brush", {
          detail: { yearRange: null }
        }));
        return;
      }

      const [x0, x1] = event.selection;
      const d0 = xScale.invert(x0);
      const d1 = xScale.invert(x1);
      brushExtent = [d0, d1];

      const y0 = d0.getFullYear();
      const y1 = d1.getFullYear();

      document.dispatchEvent(new CustomEvent("timeline-brush", {
        detail: { yearRange: [y0, y1], dateRange: [d0, d1] }
      }));
    }
  }

  function buildLegend() {
    const container = document.getElementById("timeline-legend");
    container.innerHTML = "";
    CATEGORIES.forEach(cat => {
      const item = document.createElement("div");
      item.className = "legend__item";
      item.innerHTML = `<div class="legend__dot" style="background:${CATEGORY_COLORS[cat]}"></div>${cat}`;
      container.appendChild(item);
    });
  }

  function setCategory(category) {
    currentCategory = category;
    // Highlight the selected category area, dim others
    svg.selectAll(".timeline-area")
      .transition().duration(300)
      .attr("opacity", function() {
        if (category === "All") return 0.6;
        const cat = d3.select(this).attr("data-category");
        return cat === category ? 0.85 : 0.1;
      });

    svg.selectAll(".timeline-line")
      .transition().duration(300)
      .attr("opacity", function() {
        if (category === "All") return 1;
        const cat = d3.select(this).attr("data-category");
        return cat === category ? 1 : 0.1;
      })
      .attr("stroke-width", function() {
        if (category === "All") return 1.5;
        const cat = d3.select(this).attr("data-category");
        return cat === category ? 2.5 : 1;
      });
  }

  function getBrushExtent() {
    return brushExtent;
  }

  // Programmatic brush control from date inputs
  function setBrushRange(startDate, endDate) {
    if (!xScale || !brushRef || !brushGRef) return;
    if (!startDate || !endDate) {
      // Clear brush
      brushGRef.call(brushRef.move, null);
      return;
    }
    const x0 = xScale(startDate);
    const x1 = xScale(endDate);
    if (x0 >= 0 && x1 > x0) {
      brushGRef.call(brushRef.move, [x0, x1]);
    }
  }

  function getXDomain() {
    return xScale ? xScale.domain() : null;
  }

  return { init, setCategory, getBrushExtent, setBrushRange, getXDomain };
})();
