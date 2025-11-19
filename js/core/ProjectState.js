export class ProjectState {
  constructor() {
    this.atlasImage = null;
    this.maskImage = null;
    this.rects = []; // Array of {x, y, w, h, name, group}
    this.selectedIndices = new Set();
    this.scale = 1;
    this.listeners = [];

    // Settings
    this.settings = {
      exportFormat: "generic",
      pivot: { x: 0.5, y: 0.5 },
      showGrid: false,
      globalPrefix: "",
    };

    // Groups (name -> color)
    this.groups = new Map();
    this.groups.set("default", "#00ff7f");

    // Undo/Redo History
    this.history = [];
    this.future = [];
    this.maxHistory = 50;
  }

  snapshot() {
    const state = {
      rects: JSON.parse(JSON.stringify(this.rects)),
      groups: new Map(this.groups),
      // We don't snapshot images as they are too heavy, just the data
    };

    this.history.push(state);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.future = []; // Clear redo stack on new action
  }

  undo() {
    if (this.history.length === 0) return;

    // Save current state to future
    const current = {
      rects: JSON.parse(JSON.stringify(this.rects)),
      groups: new Map(this.groups),
    };
    this.future.push(current);

    // Restore from history
    const previous = this.history.pop();
    this.restoreState(previous);
  }

  redo() {
    if (this.future.length === 0) return;

    // Save current to history
    const current = {
      rects: JSON.parse(JSON.stringify(this.rects)),
      groups: new Map(this.groups),
    };
    this.history.push(current);

    // Restore from future
    const next = this.future.pop();
    this.restoreState(next);
  }

  restoreState(state) {
    this.rects = state.rects;
    this.groups = state.groups;
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
    this.notify("selectionChanged", this.selectedIndices);
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify(event, data) {
    this.listeners.forEach((cb) => cb(event, data));
  }

  setAtlas(image) {
    this.atlasImage = image;
    this.notify("atlasChanged", image);
  }

  setMask(image, rects) {
    this.snapshot();
    this.maskImage = image;
    this.rects = rects;
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
  }

  setRects(rects) {
    this.snapshot();
    this.rects = rects;
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
  }

  // Mode: 'replace', 'add', 'toggle'
  select(index, mode = "replace") {
    if (index < 0 || index >= this.rects.length) {
      if (mode === "replace") {
        this.selectedIndices.clear();
        this.notify("selectionChanged", this.selectedIndices);
      }
      return;
    }

    if (mode === "replace") {
      this.selectedIndices.clear();
      this.selectedIndices.add(index);
    } else if (mode === "add") {
      this.selectedIndices.add(index);
    } else if (mode === "toggle") {
      if (this.selectedIndices.has(index)) {
        this.selectedIndices.delete(index);
      } else {
        this.selectedIndices.add(index);
      }
    }
    this.notify("selectionChanged", this.selectedIndices);
  }

  selectRange(indices, mode = "replace") {
    if (mode === "replace") {
      this.selectedIndices.clear();
    }
    indices.forEach((i) => {
      if (i >= 0 && i < this.rects.length) this.selectedIndices.add(i);
    });
    this.notify("selectionChanged", this.selectedIndices);
  }

  updateRectName(index, name) {
    if (this.rects[index]) {
      this.rects[index].name = name;
      this.notify("rectUpdated", { index, rect: this.rects[index] });
    }
  }

  deleteSelected() {
    if (this.selectedIndices.size === 0) return;

    this.snapshot();

    // Sort indices descending to remove safely
    const indices = Array.from(this.selectedIndices).sort((a, b) => b - a);
    indices.forEach((idx) => {
      this.rects.splice(idx, 1);
    });

    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
    this.notify("selectionChanged", this.selectedIndices);
  }

  setScale(scale) {
    this.scale = scale;
    this.notify("scaleChanged", this.scale);
  }

  get selectedIndex() {
    // Backward compatibility / Single selection helper
    if (this.selectedIndices.size === 1) {
      return this.selectedIndices.values().next().value;
    }
    return -1;
  }

  get currentRect() {
    const idx = this.selectedIndex;
    return idx > -1 ? this.rects[idx] : null;
  }

  updateRect(index, data) {
    if (this.rects[index]) {
      // We should snapshot before modifying, but since this might be called frequently
      // (e.g. typing), we might want to handle it carefully.
      // For now, let's snapshot. Ideally, the UI should only call this on 'change' (blur/enter), which it does.
      this.snapshot();

      Object.assign(this.rects[index], data);

      // If group changed, ensure it exists in groups map
      if (data.group && !this.groups.has(data.group)) {
        this.groups.set(data.group, this.generateColor(data.group));
      }

      this.notify("rectUpdated", { index, rect: this.rects[index] });
      this.notify("dataChanged", this.rects); // To refresh views that depend on full list
    }
  }

  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    this.notify("settingsChanged", this.settings);
  }

  generateColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  }

  getGroupColor(groupName) {
    return this.groups.get(groupName) || this.groups.get("default");
  }

  addGroup(name) {
    if (!name || this.groups.has(name)) return;
    this.groups.set(name, this.generateColor(name));
    this.notify("dataChanged", this.rects); // Notify to refresh UI
  }
}
