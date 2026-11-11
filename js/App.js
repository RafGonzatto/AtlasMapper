import { ProjectState } from "./core/ProjectState.js";
import { CanvasView } from "./ui/CanvasView.js";
import { SpriteList } from "./ui/SpriteList.js";
import { Toolbar } from "./ui/Toolbar.js";
import { Inspector } from "./ui/Inspector.js";
import { SettingsPanel } from "./ui/SettingsPanel.js";
import { ImportWizard } from "./ui/ImportWizard.js";
import { IO } from "./utils/IO.js";
import { generateMask } from "./core/MaskGenerator.js";
import { findFrameOverlap, findFreePosition } from "./core/FrameOverlap.js";
import { createZip } from "./utils/Zip.js";
import { Exporters } from "./core/Exporter.js";

const PERSISTENCE_ENABLED = false;

class App {
  constructor() {
    this.storageKey = "atlas-maper:workspaces:v1";
    this.workspaces = [];
    this.activeWorkspaceId = null;

    // Active workspace-bound objects
    this.state = null;
    this.view = null;
    this.spriteList = null;
    this.inspector = null;
    this.settingsPanel = null;
    this.toolbar = null;
    this.unsubEmptyState = null;
    this.unsubAutosave = null;
    this.autosaveTimer = null;

    this.initShellUI();

    // Persistence disabled: always start with a fresh workspace.
    this.createWorkspace({ makeActive: true });
  }

  initShellUI() {
    // Search (always targets the active SpriteList)
    const searchInput = document.getElementById("search-sprites");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.spriteList?.setFilter?.(e.target.value);
      });
    }

    // Sidebar tabs
    this.setupTabs();

    // Drag & Drop Support (always targets the active Toolbar)
    this.setupDragDrop();

    // Workspace tabs
    this.setupWorkspaceTabs();

    // Workspace persistence actions
    this.setupWorkspacePersistenceUI();
    this.setupProjectExportUI();

    // Import Wizard
    this.importWizard = new ImportWizard({
      getToolbar: () => this.toolbar,
      getState: () => this.state,
    });
  }

  setupWorkspacePersistenceUI() {
    const btnSave = document.getElementById("workspace-save");
    const btnLoad = document.getElementById("workspace-load");
    const fileInput = document.getElementById("workspace-load-file");
    const persistToggle = document.getElementById("workspace-persist");

    if (persistToggle) {
      // Hard-disable persistence UI (feature is disabled).
      persistToggle.checked = false;
      persistToggle.disabled = true;
      const label = persistToggle.closest("label");
      if (label) label.style.display = "none";
    }

    if (btnSave) {
      btnSave.addEventListener("click", () => this.exportCurrentWorkspace());
    }
    if (btnLoad && fileInput) {
      btnLoad.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          await this.importWorkspaceFile(file);
        } catch (err) {
          console.log(
            `[AtlasMaper] Workspace import failed (${file?.name || "(file)"}):`,
            err,
          );
          if (err?.message)
            console.log("[AtlasMaper] Error message:", err.message);
          if (err?.stack) console.log(err.stack);
          alert("Invalid JSON file.");
        } finally {
          // allow re-selecting same file
          fileInput.value = "";
        }
      });
    }
  }

  setupProjectExportUI() {
    const dialog = document.getElementById("modal-export");
    const source = document.getElementById("export-mask-source");
    const palette = document.getElementById("export-palette");
    const preview = document.getElementById("export-mask-preview");
    const message = document.getElementById("export-message");
    const overlapPanel = document.getElementById("export-overlap");
    const allowOverlap = document.getElementById("export-allow-overlap");
    const frameName = i => this.state.rects[i]?.name || `Frame ${i + 1}`;
    const currentPair = () => findFrameOverlap(this.state?.rects || []);
    const refreshOverlap = () => {
      const pair = currentPair();
      overlapPanel.hidden = !pair;
      if (!pair) { allowOverlap.checked = false; return; }
      const [first, second] = pair;
      const a = this.state.rects[first], b = this.state.rects[second];
      document.getElementById("export-overlap-details").textContent =
        `${frameName(first)} (#${first + 1}: ${a.x}, ${a.y}, ${a.w} × ${a.h}) overlaps ${frameName(second)} (#${second + 1}: ${b.x}, ${b.y}, ${b.w} × ${b.h}).`;
      document.getElementById("export-keep-first").textContent = `Keep ${frameName(first)}; remove ${frameName(second)}`;
      document.getElementById("export-keep-second").textContent = `Keep ${frameName(second)}; remove ${frameName(first)}`;
      for (const key of ["x", "y", "w", "h"])
        document.getElementById(`export-frame-${key}`).value = b[key];
    };
    const report = error => { message.textContent = error?.message || String(error); refreshOverlap(); };
    const renderMask = () => {
      const state = this.state;
      if (!state?.atlasImage) throw new Error("Load an Atlas PNG first.");
      const result = generateMask(state.atlasImage.width, state.atlasImage.height,
        state.rects, Number(palette.value), { allowOverlap: allowOverlap.checked });
      preview.width = result.width;
      preview.height = result.height;
      preview.getContext("2d").putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
      message.textContent = `Generated ${state.rects.length} internal outlines (${result.width} × ${result.height}).` +
        (currentPair() ? " Shared pixels use the later frame; the mask may lose frame boundaries." : "");
      return preview;
    };
    const imageBlob = async image => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return IO.canvasBlob(canvas);
    };
    document.getElementById("project-export").addEventListener("click", () => {
      source.querySelector('[value="original"]').disabled = !this.state?.maskImage;
      source.value = this.state?.maskImage ? "original" : "none";
      preview.width = preview.height = 0;
      message.textContent = "";
      allowOverlap.checked = false;
      refreshOverlap();
      dialog.showModal();
    });
    document.getElementById("export-close").addEventListener("click", () => dialog.close());
    source.addEventListener("change", () => { preview.width = preview.height = 0; message.textContent = ""; refreshOverlap(); });
    palette.addEventListener("change", () => { preview.width = preview.height = 0; message.textContent = ""; });
    allowOverlap.addEventListener("change", () => { preview.width = preview.height = 0; message.textContent = ""; });
    const afterResolution = () => {
      preview.width = preview.height = 0;
      message.textContent = "Frame conflict updated. Check the next overlap, if any.";
      refreshOverlap();
    };
    const removeFromPair = which => {
      const pair = currentPair();
      if (!pair) return;
      this.state.select(pair[which]);
      this.state.deleteSelected();
      afterResolution();
    };
    document.getElementById("export-keep-first").addEventListener("click", () => removeFromPair(1));
    document.getElementById("export-keep-second").addEventListener("click", () => removeFromPair(0));
    document.getElementById("export-move-second").addEventListener("click", () => {
      const pair = currentPair();
      if (!pair) return;
      const state = this.state;
      const position = findFreePosition(state.rects, pair[1], state.atlasImage.width, state.atlasImage.height);
      if (!position) { message.textContent = "No free space fits this frame. Edit its coordinates or choose another option."; return; }
      state.updateRect(pair[1], position);
      afterResolution();
    });
    document.getElementById("export-apply-frame").addEventListener("click", () => {
      const pair = currentPair();
      if (!pair) return;
      const values = Object.fromEntries(["x", "y", "w", "h"].map(key =>
        [key, Number(document.getElementById(`export-frame-${key}`).value)]));
      const atlas = this.state.atlasImage;
      if (Object.values(values).some(v => !Number.isInteger(v)) || values.x < 0 || values.y < 0 ||
          values.w < 1 || values.h < 1 || values.x + values.w > atlas.width || values.y + values.h > atlas.height) {
        message.textContent = "Enter whole-number coordinates within the atlas.";
        return;
      }
      this.state.updateRect(pair[1], values);
      afterResolution();
    });
    document.getElementById("export-preview-btn").addEventListener("click", () => {
      try { renderMask(); } catch (error) { report(error); }
    });
    document.getElementById("export-json-only").addEventListener("click", () => {
      this.settingsPanel?.exportData();
    });
    document.getElementById("export-mask-only").addEventListener("click", async () => {
      try {
        if (source.value === "none") throw new Error("Choose Original Mask PNG or Generate Mask PNG first.");
        const blob = source.value === "original"
          ? await imageBlob(this.state.maskImage)
          : await IO.canvasBlob(renderMask());
        IO.downloadBlob(blob, source.value === "original" ? "mask-original.png" : "mask-generated.png");
      } catch (error) { report(error); }
    });
    document.getElementById("export-all").addEventListener("click", async () => {
      try {
        const state = this.state;
        if (!state?.atlasImage) throw new Error("Load an Atlas PNG first.");
        if (!state.rects.length) throw new Error("Import a frames JSON before exporting the project.");
        message.textContent = "Preparing project ZIP…";
        const exporter = Exporters[state.settings.exportFormat] || Exporters.generic;
        const rects = state.rects.map(r => ({ ...r,
          name: (state.settings.globalPrefix || "") + (r.name || "") }));
        const json = exporter.export(rects, state.settings);
        const workspace = this.getActiveWorkspace();
        const files = [
          ["atlas.png", await imageBlob(state.atlasImage)],
          ["atlas.json", new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })],
          ["workspace.atlasmap.json", new Blob([JSON.stringify({
            kind: "atlas-maper-workspace", version: 1, name: workspace?.name || "Workspace",
            state: state.toSerializable(),
          }, null, 2)], { type: "application/json" })],
        ];
        if (source.value === "original") {
          if (!state.maskImage) throw new Error("No original mask is loaded.");
          files.push(["mask.png", await imageBlob(state.maskImage)]);
        } else if (source.value === "generated") {
          files.push(["mask.png", await IO.canvasBlob(renderMask())]);
        }
        IO.downloadBlob(await createZip(files), "atlas-project.zip");
        message.textContent = "Project ZIP ready.";
      } catch (error) { report(error); }
    });
  }

  mountWorkspace(state) {
    this.disposeWorkspaceUI();
    this.state = state;

    // Canvas
    const canvas = document.getElementById("atlas");
    this.view = new CanvasView(canvas, this.state);

    // Sidebar List
    const thumbsContainer = document.getElementById("thumbs");
    this.spriteList = new SpriteList(thumbsContainer, this.state);

    // Inspector
    const inspectorContainer = document.getElementById("inspector");
    this.inspector = new Inspector(inspectorContainer, this.state);

    // Settings
    const settingsContainer = document.getElementById("panel-settings");
    this.settingsPanel = new SettingsPanel(settingsContainer, this.state);

    // Toolbar
    const toolbarElements = {
      maskInput: document.getElementById("maskFile"),
      jsonInput: document.getElementById("jsonFile"),
      jsonFixInput: document.getElementById("jsonFixFile"),
      atlasInput: document.getElementById("atlasFile"),
      zoomInBtn: document.getElementById("zoomIn"),
      zoomOutBtn: document.getElementById("zoomOut"),
      bgToggleBtn: document.getElementById("toggle-bg"),
      numbersToggleBtn: document.getElementById("toggle-numbers"),
    };
    this.toolbar = new Toolbar(toolbarElements, this.state);

    // Empty State Toggle (workspace-scoped)
    this.unsubEmptyState = this.state.subscribe((event, data) => {
      if (event === "atlasChanged") {
        const msg = document.getElementById("empty-canvas-msg");
        if (msg) msg.style.display = data ? "none" : "flex";
      }
    });

    this.startAutosave();
  }

  disposeWorkspaceUI() {
    this.stopAutosave();

    if (this.unsubEmptyState) {
      this.unsubEmptyState();
      this.unsubEmptyState = null;
    }
    this.toolbar?.dispose?.();
    this.settingsPanel?.dispose?.();
    this.inspector?.dispose?.();
    this.spriteList?.dispose?.();
    this.view?.dispose?.();

    this.toolbar = null;
    this.settingsPanel = null;
    this.inspector = null;
    this.spriteList = null;
    this.view = null;
  }

  setupWorkspaceTabs() {
    const tabsEl = document.getElementById("workspace-tabs");
    const addBtn = document.getElementById("workspace-add");
    if (!tabsEl || !addBtn) return;

    addBtn.addEventListener("click", () =>
      this.createWorkspace({ makeActive: true }),
    );
    this.renderWorkspaceTabs();
  }

  renderWorkspaceTabs() {
    const tabsEl = document.getElementById("workspace-tabs");
    if (!tabsEl) return;
    tabsEl.innerHTML = "";

    this.workspaces.forEach((ws) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "ws-tab" + (ws.id === this.activeWorkspaceId ? " active" : "");
      btn.title = "Double click to rename";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = ws.name;

      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "×";
      close.title = "Close workspace";
      close.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeWorkspace(ws.id);
      };

      btn.append(name, close);
      btn.onclick = () => this.switchWorkspace(ws.id);
      btn.ondblclick = () => {
        const newName = prompt("Workspace name:", ws.name);
        if (!newName) return;
        ws.name = String(newName).trim() || ws.name;
        this.renderWorkspaceTabs();
        this.saveToStorage();
      };

      tabsEl.appendChild(btn);
    });
  }

  createWorkspace({ makeActive = false } = {}) {
    const id = `ws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const name = `Workspace ${this.workspaces.length + 1}`;
    const state = new ProjectState();
    this.workspaces.push({ id, name, state });
    if (makeActive || !this.activeWorkspaceId) {
      this.switchWorkspace(id);
    } else {
      this.renderWorkspaceTabs();
    }

    this.saveToStorage();
  }

  closeWorkspace(id) {
    if (this.workspaces.length <= 1) {
      // Keep at least one workspace alive
      this.workspaces = [];
      this.activeWorkspaceId = null;
      this.createWorkspace({ makeActive: true });
      return;
    }

    const idx = this.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) return;

    const wasActive = id === this.activeWorkspaceId;
    this.workspaces.splice(idx, 1);

    if (wasActive) {
      const next = this.workspaces[Math.max(0, idx - 1)] || this.workspaces[0];
      this.switchWorkspace(next.id);
    } else {
      this.renderWorkspaceTabs();
    }

    this.saveToStorage();
  }

  switchWorkspace(id) {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    this.activeWorkspaceId = ws.id;
    this.renderWorkspaceTabs();
    this.mountWorkspace(ws.state);

    this.saveToStorage();
  }

  isPersistenceEnabled() {
    return PERSISTENCE_ENABLED;
  }

  startAutosave() {
    if (!this.isPersistenceEnabled()) return;
    if (!this.state) return;

    // Rebind subscription
    if (this.unsubAutosave) this.unsubAutosave();
    const schedule = () => this.scheduleSaveToStorage();

    this.unsubAutosave = this.state.subscribe((event) => {
      if (
        [
          "dataChanged",
          "rectUpdated",
          "settingsChanged",
          "viewChanged",
          "atlasChanged",
          "namingChanged",
        ].includes(event)
      ) {
        schedule();
      }
    });
  }

  stopAutosave() {
    if (this.unsubAutosave) {
      this.unsubAutosave();
      this.unsubAutosave = null;
    }
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  scheduleSaveToStorage() {
    if (!this.isPersistenceEnabled()) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.saveToStorage();
    }, 250);
  }

  saveToStorage() {
    // no-op (persistence disabled)
  }

  restoreFromStorage() {
    return false;
  }

  getActiveWorkspace() {
    return this.workspaces.find((w) => w.id === this.activeWorkspaceId) || null;
  }

  exportCurrentWorkspace() {
    const ws = this.getActiveWorkspace();
    if (!ws) return;

    const state = ws.state?.toSerializable?.();
    if (!state) return;

    const safeName = String(ws.name || "workspace")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    IO.downloadJSON(
      {
        kind: "atlas-maper-workspace",
        version: 1,
        name: ws.name,
        exportedAt: new Date().toISOString(),
        state,
      },
      `${safeName || "workspace"}.atlasmap.json`,
    );
  }

  async importWorkspaceFile(file) {
    const text = await IO.readTextFile(file);
    const data = IO.parseJSON(text, file?.name || "(workspace file)");

    // Format A: single workspace export
    if (data?.kind === "atlas-maper-workspace" && data?.state) {
      const state = new ProjectState();
      state.loadFromSerializable(data.state);
      const id = `ws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const name = data.name || file.name.replace(/\.[^.]+$/, "");
      this.workspaces.push({ id, name, state });
      this.switchWorkspace(id);
      this.saveToStorage();
      return;
    }

    // Format B: full multi-workspace payload
    if (
      data?.version &&
      Array.isArray(data.workspaces) &&
      data.workspaces.length
    ) {
      const ok = confirm(
        "This file contains multiple workspaces. Replace current workspaces?\n\nOK = replace\nCancel = import as additional",
      );
      const incoming = data.workspaces.map((w, idx) => {
        const state = new ProjectState();
        if (w.state) state.loadFromSerializable(w.state);
        return {
          id: w.id || `ws_imp_${idx}_${Date.now()}`,
          name: w.name || `Imported ${idx + 1}`,
          state,
        };
      });

      if (ok) {
        this.workspaces = incoming;
      } else {
        this.workspaces.push(...incoming);
      }

      const targetId = incoming[0]?.id;
      this.renderWorkspaceTabs();
      if (targetId) this.switchWorkspace(targetId);
      this.saveToStorage();
      return;
    }

    // Format C: raw state object
    if (data?.rects || data?.groups || data?.settings) {
      const state = new ProjectState();
      state.loadFromSerializable(data);
      const id = `ws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const name = file.name.replace(/\.[^.]+$/, "");
      this.workspaces.push({ id, name, state });
      this.switchWorkspace(id);
      this.saveToStorage();
      return;
    }

    alert("Unsupported workspace file.");
  }

  setupTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Deactivate all
        tabs.forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));

        // Activate clicked
        tab.classList.add("active");
        const target = tab.dataset.tab;
        document.getElementById(`panel-${target}`).classList.add("active");
      });
    });
  }

  setupDragDrop() {
    const dropZone = document.body;

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "0.8";
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "1";
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "1";

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        // Simple heuristic: if it's an image, try to load as atlas if none exists, or mask if atlas exists
        // If it's json, load as mapping
        this.handleDroppedFiles(files);
      }
    });
  }

  handleDroppedFiles(files) {
    Array.from(files).forEach((file) => {
      if (file.type.includes("json")) {
        this.toolbar?.handleJsonLoad?.(file);
      } else if (file.type.includes("image")) {
        if (!this.state.atlasImage) {
          this.toolbar?.handleAtlasLoad?.(file);
        } else {
          // If atlas exists, assume it's a mask
          this.toolbar?.handleMaskLoad?.(file);
        }
      }
    });
  }
}

// Start the app
window.addEventListener("DOMContentLoaded", () => {
  new App();
});
