import { Exporters } from "../core/Exporter.js";
import { IO } from "../utils/IO.js";

export class SettingsPanel {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.render();
    this.bindEvents();
  }

  render() {
    const formats = Object.keys(Exporters)
      .map((k) => `<option value="${k}">${Exporters[k].name}</option>`)
      .join("");

    this.container.innerHTML = `
      <div class="settings-group">
        <h3>Export Settings</h3>
        <label>Format</label>
        <select id="set-format">${formats}</select>

        <label>Global Prefix</label>
        <input type="text" id="set-prefix" placeholder="e.g. enemy_">

        <label>Pivot (X, Y)</label>
        <div class="row">
          <input type="number" id="set-piv-x" step="0.1" value="0.5">
          <input type="number" id="set-piv-y" step="0.1" value="0.5">
        </div>
      </div>

      <div class="settings-group">
        <h3>View Settings</h3>
        <label class="checkbox">
          <input type="checkbox" id="set-grid"> Show Grid
        </label>
      </div>

      <div class="settings-actions">
        <button id="btn-export-json" class="primary">Export JSON</button>
      </div>
    `;
  }

  bindEvents() {
    const els = {
      format: this.container.querySelector("#set-format"),
      prefix: this.container.querySelector("#set-prefix"),
      pivX: this.container.querySelector("#set-piv-x"),
      pivY: this.container.querySelector("#set-piv-y"),
      grid: this.container.querySelector("#set-grid"),
      export: this.container.querySelector("#btn-export-json"),
    };

    // Load initial values
    const s = this.state.settings;
    els.format.value = s.exportFormat;
    els.prefix.value = s.globalPrefix;
    els.pivX.value = s.pivot.x;
    els.pivY.value = s.pivot.y;
    els.grid.checked = s.showGrid;

    const update = () => {
      this.state.updateSettings({
        exportFormat: els.format.value,
        globalPrefix: els.prefix.value,
        pivot: { x: parseFloat(els.pivX.value), y: parseFloat(els.pivY.value) },
        showGrid: els.grid.checked,
      });
    };

    els.format.addEventListener("change", update);
    els.prefix.addEventListener("change", update);
    els.pivX.addEventListener("change", update);
    els.pivY.addEventListener("change", update);
    els.grid.addEventListener("change", update);

    els.export.addEventListener("click", () => {
      this.exportData();
    });
  }

  exportData() {
    const { rects, settings } = this.state;
    if (!rects.length) {
      alert("Nothing to export.");
      return;
    }

    const exporter = Exporters[settings.exportFormat];
    if (!exporter) return;

    // Apply prefix if needed (temporarily or permanently? Let's do it on export time)
    const processedRects = rects.map((r) => ({
      ...r,
      name: (settings.globalPrefix || "") + (r.name || ""),
    }));

    const data = exporter.export(processedRects, settings);
    IO.downloadJSON(data, `atlas.${exporter.ext}`);
  }
}
