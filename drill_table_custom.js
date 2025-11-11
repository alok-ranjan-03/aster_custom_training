looker.plugins.visualizations.add({
  id: "drilldown_table_v1",
  label: "Drilldown Table",
  options: {},

  create: function (element) {
    element.innerHTML = `
      <div class="drill-table-container" style="
        font-family: Roboto, sans-serif;
        width: 100%;
        background: #fff;
        border-radius: 8px;
        padding: 8px 10px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      ">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <thead></thead>
          <tbody></tbody>
        </table>
        <div class="no-data" style="
          display:none;
          text-align:center;
          color:#777;
          padding:20px;
        ">No data found</div>
      </div>
    `;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    const thead = element.querySelector("thead");
    const tbody = element.querySelector("tbody");
    const noData = element.querySelector(".no-data");

    if (!data || data.length === 0) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      noData.style.display = "block";
      done();
      return;
    }
    noData.style.display = "none";

    // Extract Looker field names
    const dims = queryResponse.fields.dimension_like.map(d => d.name);
    const meas = queryResponse.fields.measure_like.map(m => m.name);

    if (dims.length === 0 || meas.length === 0) {
      thead.innerHTML = "";
      tbody.innerHTML = "";
      noData.style.display = "block";
      noData.innerText = "Add at least one dimension and one measure.";
      done();
      return;
    }

    // Build a clean hierarchy from data
    function extractValue(row, field) {
      return row[field]?.value ?? "(blank)";
    }

    function buildHierarchy(rows, level = 0) {
      if (level >= dims.length) return [];
      const field = dims[level];
      const groups = {};
      rows.forEach(r => {
        const key = extractValue(r, field);
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      return Object.entries(groups).map(([key, group]) => ({
        name: key,
        level,
        value: group.reduce((sum, rr) => sum + (Number(rr[meas[0]]?.value) || 0), 0),
        children: buildHierarchy(group, level + 1)
      }));
    }

    const hierarchy = buildHierarchy(data);
    const expanded = new Set();

    // Determine which columns to show (based on expanded level)
    function computeMaxVisibleLevel() {
      if (expanded.size === 0) return 0;
      let maxExpanded = -1;
      expanded.forEach(id => {
        const lvl = id.split("-").length - 1;
        if (lvl > maxExpanded) maxExpanded = lvl;
      });
      return Math.min(dims.length - 1, Math.max(0, maxExpanded + 1));
    }

    // Render header
    function renderHeader(visibleLevel) {
      let html = "<tr>";
      for (let i = 0; i <= visibleLevel; i++) {
        html += `<th>${dims[i].replace(".", " ")}</th>`;
      }
      html += `<th>${meas[0].replace(".", " ")}</th></tr>`;
      thead.innerHTML = html;
    }

    // Render body recursively
    function renderRows() {
      const visibleLevel = computeMaxVisibleLevel();
      renderHeader(visibleLevel);
      tbody.innerHTML = "";

      function walk(nodes, parentId = "") {
        nodes.forEach((node, idx) => {
          const id = parentId ? `${parentId}-${idx}` : `${idx}`;
          const tr = document.createElement("tr");
          const hasChildren = node.children && node.children.length;
          const isExpanded = expanded.has(id);

          // Build label cell
          const label = document.createElement("span");
          label.className = `node-label ${hasChildren ? (isExpanded ? "expanded" : "collapsed") : ""}`;
          label.style.cssText = `cursor:pointer; user-select:none; display:inline-flex; align-items:center; gap:6px;`;
          label.innerHTML = hasChildren ? `<span>${isExpanded ? "▼" : "▶"}</span> <span>${node.name}</span>` : `<span style="margin-left:14px;"></span> ${node.name}`;

          const cells = [];
          for (let i = 0; i <= visibleLevel; i++) {
            const td = document.createElement("td");
            if (i === node.level) td.appendChild(label);
            cells.push(td);
          }

          const tdSales = document.createElement("td");
          tdSales.textContent = node.value.toFixed(2);
          tdSales.style.textAlign = "right";
          cells.push(tdSales);

          cells.forEach(td => tr.appendChild(td));
          tbody.appendChild(tr);

          label.addEventListener("click", e => {
            e.stopPropagation();
            if (!hasChildren) return;
            if (expanded.has(id)) expanded.delete(id);
            else expanded.add(id);
            renderRows();
          });

          if (isExpanded && hasChildren) walk(node.children, id);
        });
      }

      walk(hierarchy);
    }

    renderRows();
    done();
  }
});
