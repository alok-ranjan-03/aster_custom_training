looker.plugins.visualizations.add({
  options: {
    main_color: {
      section: "Style",
      order: 1,
      type: "string",
      label: "Row Text Color",
      display: "color",
      default: "#1a73e8"
    },
    background_color: {
      section: "Style",
      order: 2,
      type: "string",
      label: "Background Color",
      display: "color",
      default: "#ffffff"
    },
    font_family: {
      section: "Style",
      order: 3,
      type: "string",
      label: "Font Family",
      default: "Roboto, sans-serif"
    },
    show_title: {
      section: "Title",
      order: 1,
      type: "boolean",
      label: "Show Title",
      default: true
    },
    title_override: {
      section: "Title",
      order: 2,
      type: "string",
      label: "Custom Title Text",
      placeholder: "Enter custom title",
      display: "text"
    }
  },

  create: function(element, config) {
    element.innerHTML = `
      <style>
        .drill-table-container {
          font-family: ${config.font_family || "Roboto, sans-serif"};
          width: 100%;
          height: 100%;
          background-color: ${config.background_color};
          border-radius: 10px;
          padding: 10px;
          box-sizing: border-box;
          overflow-y: auto;
        }
        .drill-table-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 10px;
          color: #333;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background-color: #f2f2f2;
          text-align: left;
          padding: 8px;
          font-weight: 600;
          border-bottom: 1px solid #ddd;
        }
        td {
          padding: 6px 8px;
          border-bottom: 1px solid #eee;
          color: ${config.main_color || "#1a73e8"};
          cursor: pointer;
        }
        .collapsed::before {
          content: "▶";
          margin-right: 6px;
          color: #666;
        }
        .expanded::before {
          content: "▼";
          margin-right: 6px;
          color: #666;
        }
        .hidden-row {
          display: none;
        }
        .indent-1 { padding-left: 20px; }
        .indent-2 { padding-left: 40px; }
        .indent-3 { padding-left: 60px; }
      </style>
      <div class="drill-table-container">
        <div class="drill-table-title"></div>
        <table class="drill-table"><thead></thead><tbody></tbody></table>
      </div>
    `;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    this.clearErrors();
    const container = element.querySelector(".drill-table-container");
    const titleEl = element.querySelector(".drill-table-title");
    const tableHead = element.querySelector("thead");
    const tableBody = element.querySelector("tbody");

    // ---- Title ----
    if (config.show_title) {
      titleEl.style.display = "block";
      titleEl.innerText =
        config.title_override ||
        "Drilldown Table Visualization";
    } else {
      titleEl.style.display = "none";
    }

    // ---- Validation ----
    const dims = queryResponse.fields.dimension_like;
    const measures = queryResponse.fields.measure_like;
    if (dims.length < 2) {
      this.addError({
        title: "Need at least 2 dimensions",
        message: "Please select at least two dimensions (e.g., Region, Country, Customer)."
      });
      return;
    }

    // ---- Prepare Table Headers ----
    tableHead.innerHTML = `
      <tr>
        ${dims.map(d => `<th>${d.label_short}</th>`).join("")}
        ${measures.map(m => `<th>${m.label_short}</th>`).join("")}
      </tr>
    `;

    // ---- Build Hierarchical Data ----
    const levelFields = dims.map(d => d.name);
    const measureField = measures[0].name;

    // recursively group data by dimension levels
    function buildHierarchy(rows, level = 0) {
      if (level >= levelFields.length) return [];
      const field = levelFields[level];
      const groups = {};

      rows.forEach(r => {
        const key = r[field].value || "N/A";
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });

      return Object.entries(groups).map(([key, group]) => {
        const node = {
          name: key,
          level: level,
          value: group.reduce((sum, row) => sum + (parseFloat(row[measureField].value) || 0), 0),
          children: buildHierarchy(group, level + 1)
        };
        return node;
      });
    }

    const hierarchy = buildHierarchy(data);

    // ---- Render Rows ----
    tableBody.innerHTML = "";

    function renderRows(nodes, parentId = "", level = 0) {
      nodes.forEach((node, idx) => {
        const rowId = parentId ? `${parentId}-${idx}` : `${idx}`;
        const hasChildren = node.children && node.children.length > 0;

        const row = document.createElement("tr");
        row.className = `level-${level}`;
        row.dataset.id = rowId;
        row.dataset.parent = parentId;
        row.innerHTML = `
          ${levelFields.map((_, i) => {
            if (i === level) {
              return `<td class="indent-${level} ${hasChildren ? "collapsed" : ""}">
                        ${node.name}
                      </td>`;
            } else {
              return `<td></td>`;
            }
          }).join("")}
          <td>${node.value.toFixed(2)}</td>
        `;

        tableBody.appendChild(row);

        if (hasChildren) {
          const childRows = renderRows(node.children, rowId, level + 1);
          childRows.forEach(child => child.classList.add("hidden-row"));
        }

        row.addEventListener("click", e => {
          e.stopPropagation();
          if (!hasChildren) return;
          const isExpanded = row.classList.toggle("expanded");
          row.classList.toggle("collapsed", !isExpanded);
          toggleChildren(rowId, isExpanded);
        });
      });

      return Array.from(tableBody.querySelectorAll(`tr[data-parent="${parentId}"]`));
    }

    function toggleChildren(parentId, show) {
      const children = Array.from(tableBody.querySelectorAll(`tr[data-parent^="${parentId}"]`));
      children.forEach(child => {
        const directChild = child.dataset.parent === parentId;
        if (directChild) {
          if (show) child.classList.remove("hidden-row");
          else child.classList.add("hidden-row");

          // collapse deeper levels if hiding
          if (!show) toggleChildren(child.dataset.id, false);
        }
      });
    }

    renderRows(hierarchy);

    done();
  }
});
