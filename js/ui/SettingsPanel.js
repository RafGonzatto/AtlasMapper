import { Exporters } from "../core/Exporter.js";
import { IO } from "../utils/IO.js";

export class SettingsPanel {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.els = null;
    this.unsub = null;
    this.boundUpdate = null;
    this.render();
    this.bindEvents();

    this.unsub = this.state.subscribe((event) => {
      if (event === "settingsChanged") {
        this.syncFromState();
      }
    });
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

        <label class="checkbox">
          <input type="checkbox" id="set-sprite-numbers"> Show Sprite Numbers
        </label>
        <label>Sprite Number Size (px)</label>
        <input type="number" id="set-sprite-number-size" min="6" max="72" value="14" style="width:100%;">

        <label>Background</label>
        <select id="set-bg-mode">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="checkerboard">Checkerboard</option>
          <option value="custom">Custom Color</option>
        </select>
        <input type="color" id="set-bg-color" value="#ff00ff" style="width:100%; height:30px; margin-top:5px;">
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
      spriteNumbers: this.container.querySelector("#set-sprite-numbers"),
      spriteNumberSize: this.container.querySelector("#set-sprite-number-size"),
      bgMode: this.container.querySelector("#set-bg-mode"),
      bgColor: this.container.querySelector("#set-bg-color"),
    };

    this.els = els;

    const updateColorVisibility = () => {
      els.bgColor.style.display =
        els.bgMode.value === "custom" ? "block" : "none";
    };

    this.boundUpdate = () => {
      updateColorVisibility();
      this.state.updateSettings({
        exportFormat: els.format.value,
        globalPrefix: els.prefix.value,
        pivot: { x: parseFloat(els.pivX.value), y: parseFloat(els.pivY.value) },
        showGrid: els.grid.checked,
        showSpriteNumbers: els.spriteNumbers.checked,
        spriteNumberSize: parseInt(els.spriteNumberSize.value, 10) || 14,
        backgroundMode: els.bgMode.value,
        backgroundColor: els.bgColor.value,
      });
    };

    // Load initial values (and apply visibility)
    this.syncFromState();
    updateColorVisibility();

    els.format.addEventListener("change", this.boundUpdate);
    els.prefix.addEventListener("change", this.boundUpdate);
    els.pivX.addEventListener("change", this.boundUpdate);
    els.pivY.addEventListener("change", this.boundUpdate);
    els.grid.addEventListener("change", this.boundUpdate);
    els.spriteNumbers.addEventListener("change", this.boundUpdate);
    els.spriteNumberSize.addEventListener("change", this.boundUpdate);
    els.spriteNumberSize.addEventListener("input", this.boundUpdate);
    els.bgMode.addEventListener("change", this.boundUpdate);
    els.bgColor.addEventListener("change", this.boundUpdate);
    els.bgColor.addEventListener("input", this.boundUpdate); // Real-time update

    // Export is available from the main Export Project dialog.
  }

  dispose() {
    if (this.unsub) this.unsub();

    const els = this.els;
    if (!els) return;
    if (this.boundUpdate) {
      els.format?.removeEventListener("change", this.boundUpdate);
      els.prefix?.removeEventListener("change", this.boundUpdate);
      els.pivX?.removeEventListener("change", this.boundUpdate);
      els.pivY?.removeEventListener("change", this.boundUpdate);
      els.grid?.removeEventListener("change", this.boundUpdate);
      els.spriteNumbers?.removeEventListener("change", this.boundUpdate);
      els.spriteNumberSize?.removeEventListener("change", this.boundUpdate);
      els.spriteNumberSize?.removeEventListener("input", this.boundUpdate);
      els.bgMode?.removeEventListener("change", this.boundUpdate);
      els.bgColor?.removeEventListener("change", this.boundUpdate);
      els.bgColor?.removeEventListener("input", this.boundUpdate);
    }
  }

  syncFromState() {
    const els = this.els;
    if (!els) return;

    const s = this.state.settings;
    if (els.format) els.format.value = s.exportFormat;
    if (els.prefix) els.prefix.value = s.globalPrefix;
    if (els.pivX) els.pivX.value = s.pivot.x;
    if (els.pivY) els.pivY.value = s.pivot.y;
    if (els.grid) els.grid.checked = s.showGrid;
    if (els.spriteNumbers) els.spriteNumbers.checked = s.showSpriteNumbers;
    if (els.spriteNumberSize)
      els.spriteNumberSize.value = s.spriteNumberSize || 14;
    if (els.bgMode) els.bgMode.value = s.backgroundMode || "dark";
    if (els.bgColor) els.bgColor.value = s.backgroundColor || "#ff00ff";

    if (els.bgColor) {
      els.bgColor.style.display =
        (els.bgMode?.value || "dark") === "custom" ? "block" : "none";
    }
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
