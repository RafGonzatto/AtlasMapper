export class ProjectState {
  constructor() {
    this.atlasImage = null;
    this.atlasMeta = null; // { name?, width, height }
    this.maskImage = null;
    this.rects = []; // Array of {x, y, w, h, name, group}
    this.selectedIndices = new Set();
    this.scale = 1;
    this.viewOffset = { x: 0, y: 0 }; // Pan offset
    this.listeners = [];

    // Settings
    this.settings = {
      exportFormat: "generic",
      pivot: { x: 0.5, y: 0.5 },
      showGrid: false,
      globalPrefix: "",
      backgroundMode: "dark", // dark, light, checkerboard, custom
      backgroundColor: "#ff00ff",
      showSpriteNumbers: false,
      spriteNumberSize: 14,
    };

    // Groups (name -> color)
    this.groups = new Map();
    this.groups.set("default", "#00ff7f");

    // QoL: recently used groups (most-recent first)
    this.recentGroups = [];

    // Undo/Redo History
    this.history = [];
    this.future = [];
    this.maxHistory = 50;

    // Import / Naming helpers
    // nextIndex: next numeric id to use when auto-naming imported sprites
    // pad: numeric padding width
    // prefix: optional prefix applied by auto-naming (separate from export prefix)
    this.naming = {
      nextIndex: 1,
      pad: 4,
      prefix: "",
    };
  }

  normalizeRect(r) {
    if (!r) return null;
    const x = Math.round(Number(r.x));
    const y = Math.round(Number(r.y));
    const w = Math.round(Number(r.w));
    const h = Math.round(Number(r.h));
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h)
    ) {
      return null;
    }
    if (w <= 0 || h <= 0) return null;
    return { ...r, x, y, w, h };
  }

  rectKey(r) {
    return `${r.x},${r.y},${r.w},${r.h}`;
  }

  isNearDuplicate(a, b, tol = 1) {
    return (
      Math.abs(a.x - b.x) <= tol &&
      Math.abs(a.y - b.y) <= tol &&
      Math.abs(a.w - b.w) <= tol * 2 &&
      Math.abs(a.h - b.h) <= tol * 2
    );
  }

  dedupeRects(rects, { nearTol = 1 } = {}) {
    const out = [];
    const keys = new Set();

    for (const raw of rects || []) {
      const r = this.normalizeRect(raw);
      if (!r) continue;

      const key = this.rectKey(r);
      if (keys.has(key)) continue;

      // Near-duplicate guard (common when mask has anti-alias / multiple close colors)
      const isDup = out.some((e) => this.isNearDuplicate(e, r, nearTol));
      if (isDup) continue;

      keys.add(key);
      out.push(r);
    }

    return out;
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
    // Safety: ensure default group always exists
    if (!this.groups || !(this.groups instanceof Map)) {
      this.groups = new Map();
    }
    if (!this.groups.has("default")) {
      this.groups.set("default", "#00ff7f");
    }

    // Keep recent groups only if they still exist
    this.recentGroups = (this.recentGroups || []).filter((g) =>
      this.groups.has(g),
    );
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
    this.notify("selectionChanged", this.selectedIndices);
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = (this.listeners || []).filter((cb) => cb !== callback);
    };
  }

  notify(event, data) {
    this.listeners.forEach((cb) => cb(event, data));
  }

  setAtlas(image) {
    // Backward compatible signature:
    // setAtlas(image, meta?)
    this.atlasImage = image;
    if (image) {
      this.atlasMeta = {
        ...(this.atlasMeta || {}),
        width: image.width,
        height: image.height,
      };
    } else {
      this.atlasMeta = null;
    }
    this.notify("atlasChanged", image);
  }

  setAtlasWithMeta(image, meta = {}) {
    this.atlasImage = image;
    if (image) {
      this.atlasMeta = {
        name: meta?.name ? String(meta.name) : this.atlasMeta?.name,
        width: image.width,
        height: image.height,
      };
    } else {
      this.atlasMeta = null;
    }
    this.notify("atlasChanged", image);
  }

  toSerializable() {
    return {
      version: 1,
      atlasMeta: this.atlasMeta
        ? {
            name: this.atlasMeta.name || "",
            width: Number(this.atlasMeta.width) || 0,
            height: Number(this.atlasMeta.height) || 0,
          }
        : null,
      rects: JSON.parse(JSON.stringify(this.rects || [])),
      groups: Array.from((this.groups || new Map()).entries()).map(
        ([name, color]) => ({ name, color }),
      ),
      recentGroups: JSON.parse(JSON.stringify(this.recentGroups || [])),
      settings: JSON.parse(JSON.stringify(this.settings || {})),
      naming: JSON.parse(JSON.stringify(this.naming || {})),
      view: {
        scale: Number(this.scale) || 1,
        offset: {
          x: Number(this.viewOffset?.x) || 0,
          y: Number(this.viewOffset?.y) || 0,
        },
      },
    };
  }

  loadFromSerializable(payload) {
    const data =
      payload && payload.version ? payload : { version: 1, ...payload };

    // Reset heavy/runtime-only fields
    this.atlasImage = null;
    this.maskImage = null;
    this.selectedIndices?.clear?.();

    this.atlasMeta = data.atlasMeta || null;
    this.settings = { ...this.settings, ...(data.settings || {}) };
    this.naming = { ...this.naming, ...(data.naming || {}) };

    // Groups
    this.groups = new Map();
    (data.groups || []).forEach((g) => {
      const name = String(g?.name || "").trim();
      const color = String(g?.color || "").trim();
      if (!name) return;
      this.groups.set(name, color || this.generateColor(name));
    });
    if (!this.groups.has("default")) this.groups.set("default", "#00ff7f");

    // Rects
    this.rects = this.dedupeRects(data.rects || []);
    this.rects.forEach((r) => {
      if (r.group) {
        const g = this.ensureGroup(r.group);
        r.group = g || "default";
      }
    });

    // Recents
    this.recentGroups = (data.recentGroups || []).filter((g) =>
      this.groups.has(String(g)),
    );

    // View
    this.scale = Number(data.view?.scale) || 1;
    this.viewOffset = {
      x: Number(data.view?.offset?.x) || 0,
      y: Number(data.view?.offset?.y) || 0,
    };

    // Clear history for a fresh loaded state
    this.history = [];
    this.future = [];

    // Notify
    this.notify("atlasChanged", null);
    this.notify("settingsChanged", this.settings);
    this.notify("viewChanged", { scale: this.scale, offset: this.viewOffset });
    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
    this.notify("namingChanged", this.naming);
  }

  setNamingSeed({ nextIndex, pad, prefix } = {}) {
    const n = this.naming || { nextIndex: 1, pad: 4, prefix: "" };
    if (Number.isFinite(nextIndex) && nextIndex > 0) n.nextIndex = nextIndex;
    if (Number.isFinite(pad) && pad > 0) n.pad = Math.floor(pad);
    if (prefix !== undefined) n.prefix = String(prefix || "");
    this.naming = n;
    this.notify("namingChanged", this.naming);
  }

  seedNamingFromFrameNames(frameNames = []) {
    // Look for numeric tokens inside names and set nextIndex to max+1.
    // Example matches: 0007, sprite_12, idle_0042
    let maxValue = 0;
    let pad = this.naming?.pad || 4;

    for (const raw of frameNames || []) {
      const name = String(raw || "");
      const matches = name.match(/\d+/g);
      if (!matches) continue;
      for (const token of matches) {
        const value = parseInt(token, 10);
        if (!Number.isFinite(value)) continue;
        if (value > maxValue) {
          maxValue = value;
          pad = Math.max(pad, token.length);
        }
      }
    }

    const currentNext = Number(this.naming?.nextIndex) || 1;

    if (maxValue > 0) {
      // Monotonic: never decrease nextIndex across multiple JSON imports
      this.setNamingSeed({
        nextIndex: Math.max(currentNext, maxValue + 1),
        pad,
      });
      return;
    }

    // Fallback: continue after current rect count
    const next = Math.max(1, (this.rects?.length || 0) + 1);
    this.setNamingSeed({ nextIndex: Math.max(currentNext, next) });
  }

  getNameSet() {
    const set = new Set();
    (this.rects || []).forEach((r) => {
      if (r?.name) set.add(String(r.name));
    });
    return set;
  }

  allocateNextName(existingNames) {
    const names = existingNames || this.getNameSet();
    const naming = this.naming || { nextIndex: 1, pad: 4, prefix: "" };
    const pad = Math.max(1, Math.floor(Number(naming.pad) || 4));
    const prefix = String(naming.prefix || "");

    // Find a free slot (handles the case where a user already used a number)
    let guard = 0;
    while (guard++ < 100000) {
      const candidate = `${prefix}${String(naming.nextIndex).padStart(pad, "0")}`;
      naming.nextIndex++;
      if (!names.has(candidate)) {
        this.naming = naming;
        names.add(candidate);
        return candidate;
      }
    }

    // Extreme fallback
    const fallback = `${prefix}${Date.now()}`;
    names.add(fallback);
    return fallback;
  }

  setMask(image, rects) {
    this.snapshot();
    this.maskImage = image;
    this.rects = this.dedupeRects(rects);
    this.rects.forEach((r) => { r.group = this.ensureGroup(r.group || "default"); });
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
  }

  setRects(rects) {
    this.snapshot();
    this.rects = this.dedupeRects(rects);
    this.rects.forEach((r) => { r.group = this.ensureGroup(r.group || "default"); });
    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
  }

  appendRects(
    rects,
    {
      autoName = false,
      sortForNaming = true,
      snapshot = true,
      reconcileOnDuplicate = false,
      nearTol = 1,
    } = {},
  ) {
    const incoming = this.dedupeRects(rects, { nearTol });
    if (!incoming.length) return { added: 0, skipped: 0, reconciled: 0 };

    if (snapshot) this.snapshot();

    // Sort stable for predictable naming (top-to-bottom, left-to-right)
    const next = [...incoming];
    if (sortForNaming) {
      next.sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h);
    }

    const existingKeys = new Set(
      (this.rects || []).map((r) => this.rectKey(r)),
    );
    const existingIndexByKey = new Map();
    (this.rects || []).forEach((r, i) => {
      existingIndexByKey.set(this.rectKey(r), i);
    });
    const existingNames = this.getNameSet();

    let added = 0;
    let skipped = 0;
    let reconciled = 0;
    for (const r of next) {
      const key = this.rectKey(r);
      if (existingKeys.has(key)) {
        if (reconcileOnDuplicate) {
          const idx = existingIndexByKey.get(key);
          const target = Number.isInteger(idx) ? this.rects[idx] : null;
          if (target) {
            // Fill missing name/group only (non-destructive)
            if ((!target.name || !String(target.name).trim()) && r.name) {
              const name = String(r.name);
              if (!existingNames.has(name)) {
                target.name = name;
                existingNames.add(name);
                reconciled++;
              }
            }
            if ((!target.group || !String(target.group).trim()) && r.group) {
              target.group = this.ensureGroup(r.group) || "default";
              reconciled++;
            }
          }
        }
        skipped++;
        continue;
      }

      const out = { ...r };
      out.group = this.ensureGroup(out.group || "default");
      if (autoName && (!out.name || !String(out.name).trim())) {
        out.name = this.allocateNextName(existingNames);
      } else if (out.name) {
        // Ensure name uniqueness on append
        const base = String(out.name);
        if (existingNames.has(base)) {
          // Add suffix instead of overwriting
          let n = 2;
          let candidate = `${base}_${n}`;
          while (existingNames.has(candidate) && n < 10000) {
            n++;
            candidate = `${base}_${n}`;
          }
          out.name = candidate;
        }
        existingNames.add(out.name);
      }

      this.rects.push(out);
      existingKeys.add(key);
      existingIndexByKey.set(key, this.rects.length - 1);
      added++;
    }

    this.selectedIndices.clear();
    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
    return { added, skipped, reconciled };
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
    this.notify("viewChanged", { scale: this.scale, offset: this.viewOffset });
  }

  setPan(x, y) {
    this.viewOffset = { x, y };
    this.notify("viewChanged", { scale: this.scale, offset: this.viewOffset });
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

  normalizeGroupName(name) {
    if (name === null || name === undefined) return "";
    return String(name).trim();
  }

  ensureGroup(name) {
    const n = this.normalizeGroupName(name);
    if (!n) return "";
    if (!this.groups.has(n)) {
      this.groups.set(n, this.generateColor(n));
    }
    return n;
  }

  recordRecentGroup(name) {
    const n = this.normalizeGroupName(name);
    if (!n) return;
    // Don't record invalid / non-existent groups
    if (!this.groups.has(n)) return;

    const list = this.recentGroups || [];
    const without = list.filter((g) => g !== n);
    this.recentGroups = [n, ...without].slice(0, 20);
  }

  getRecentGroups(limit = 5) {
    const n = Math.max(0, Number(limit) || 0);
    const list = (this.recentGroups || []).filter((g) => this.groups.has(g));
    return list.slice(0, n);
  }

  addGroup(name) {
    const n = this.normalizeGroupName(name);
    if (!n || this.groups.has(n)) return;
    this.snapshot();
    this.groups.set(n, this.generateColor(n));
    this.notify("dataChanged", this.rects); // Notify to refresh UI
  }

  createGroupFromSelection(name) {
    const groupName = this.normalizeGroupName(name);
    if (!groupName) return "";

    this.snapshot();
    this.ensureGroup(groupName);

    if (this.selectedIndices.size > 0) {
      for (const idx of this.selectedIndices) {
        if (idx >= 0 && idx < this.rects.length) {
          this.rects[idx].group = groupName;
        }
      }
    }

    this.recordRecentGroup(groupName);

    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
    return groupName;
  }

  moveRectsToGroup(indices, groupName) {
    const n = this.normalizeGroupName(groupName) || "default";
    const actualGroup = n === "default" ? "default" : this.ensureGroup(n);

    const unique = Array.from(new Set(indices || []))
      .map((i) => Number(i))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < this.rects.length);

    if (unique.length === 0) return;

    this.snapshot();
    unique.forEach((i) => {
      this.rects[i].group = actualGroup;
    });

    this.recordRecentGroup(actualGroup);

    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
  }

  moveSelectedToGroup(groupName) {
    this.moveRectsToGroup(Array.from(this.selectedIndices), groupName);
  }

  renameGroup(oldName, newName) {
    const from = this.normalizeGroupName(oldName);
    const to = this.normalizeGroupName(newName);
    if (!from || !to || from === to) return false;
    if (from === "default") return false;
    if (!this.groups.has(from)) return false;
    if (this.groups.has(to)) return false;

    this.snapshot();
    const color = this.groups.get(from) || this.generateColor(to);
    this.groups.delete(from);
    this.groups.set(to, color);

    // Update recents
    this.recentGroups = (this.recentGroups || []).map((g) =>
      g === from ? to : g,
    );

    this.rects.forEach((r) => {
      if (r.group === from) r.group = to;
    });

    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
    return true;
  }

  deleteGroup(name, { moveTo = "default" } = {}) {
    const g = this.normalizeGroupName(name);
    if (!g || g === "default") return false;
    if (!this.groups.has(g)) return false;

    const target = this.normalizeGroupName(moveTo) || "default";
    const targetGroup =
      target === "default" ? "default" : this.ensureGroup(target);

    this.snapshot();
    this.groups.delete(g);
    this.recentGroups = (this.recentGroups || []).filter((x) => x !== g);
    this.rects.forEach((r) => {
      if (r.group === g) r.group = targetGroup;
    });

    this.recordRecentGroup(targetGroup);

    this.notify("dataChanged", this.rects);
    this.notify("rectUpdated", { index: -1 });
    return true;
  }
}
