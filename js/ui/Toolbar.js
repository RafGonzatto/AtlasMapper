import { IO } from "../utils/IO.js";
import { RectDetector } from "../core/RectDetector.js";

export class Toolbar {
  constructor(elements, state) {
    this.elements = elements;
    this.state = state;
    this.detector = new RectDetector();

    this.unsub = null;

    this.bound = {
      onKeyDown: null,
      onAtlasChange: null,
      onMaskChange: null,
      onJsonChange: null,
      onJsonFixChange: null,
      onZoomIn: null,
      onZoomOut: null,
      onBgToggle: null,
      onBatchRename: null,
    };

    this.bindEvents();
    this.updateStatus();
    this.updateBgToggle();
    this.updateNumbersToggle();

    this.unsub = this.state.subscribe((event) => {
      if (event === "selectionChanged" || event === "dataChanged") {
        this.updateStatus();
      }
      if (event === "settingsChanged") {
        this.updateBgToggle();
        this.updateNumbersToggle();
      }
    });
  }

  bindEvents() {
    const {
      maskInput,
      jsonInput,
      jsonFixInput,
      atlasInput,
      zoomInBtn,
      zoomOutBtn,
      bgToggleBtn,
    } = this.elements;

    this.bound.onMaskChange = (e) =>
      this.handleMaskLoad(e?.target?.files || []);
    this.bound.onJsonChange = (e) =>
      this.handleJsonLoad(e?.target?.files || []);
    this.bound.onJsonFixChange = (e) =>
      this.handleJsonFixLoad(e?.target?.files || []);
    this.bound.onAtlasChange = (e) =>
      this.handleAtlasLoad(e?.target?.files?.[0]);

    // File Inputs
    if (maskInput)
      maskInput.addEventListener("change", this.bound.onMaskChange);
    if (jsonInput)
      jsonInput.addEventListener("change", this.bound.onJsonChange);
    if (jsonFixInput)
      jsonFixInput.addEventListener("change", this.bound.onJsonFixChange);
    if (atlasInput)
      atlasInput.addEventListener("change", this.bound.onAtlasChange);

    // Buttons
    const getNextZoomScale = (direction) => {
      const levels = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 10];
      const current = this.state.scale || 1;

      if (direction > 0) {
        for (const z of levels) if (z > current + 1e-9) return z;
        return levels[levels.length - 1];
      }

      for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i] < current - 1e-9) return levels[i];
      }
      return levels[0];
    };

    this.bound.onZoomIn = () => this.state.setScale(getNextZoomScale(1));
    this.bound.onZoomOut = () => this.state.setScale(getNextZoomScale(-1));
    this.bound.onBgToggle = () => this.toggleBackgroundMode();
    this.bound.onNumbersToggle = () => this.toggleSpriteNumbers();

    if (zoomInBtn) zoomInBtn.addEventListener("click", this.bound.onZoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", this.bound.onZoomOut);
    if (bgToggleBtn)
      bgToggleBtn.addEventListener("click", this.bound.onBgToggle);

    const { numbersToggleBtn } = this.elements;
    if (numbersToggleBtn)
      numbersToggleBtn.addEventListener("click", this.bound.onNumbersToggle);

    // Batch Rename
    const btnRename = document.getElementById("btn-batch-rename");
    if (btnRename) {
      this.bound.onBatchRename = () => this.showRenameModal();
      btnRename.addEventListener("click", this.bound.onBatchRename);
    }

    // Keyboard shortcuts
    this.bound.onKeyDown = (e) => {
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          this.state.redo();
        } else {
          this.state.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.state.redo();
      }

      if (["Delete", "Backspace"].includes(e.key)) {
        // Only if not typing in an input
        if (document.activeElement.tagName !== "INPUT") {
          e.preventDefault();
          this.state.deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", this.bound.onKeyDown);
  }

  dispose() {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }

    const {
      maskInput,
      jsonInput,
      jsonFixInput,
      atlasInput,
      zoomInBtn,
      zoomOutBtn,
      bgToggleBtn,
    } = this.elements || {};

    if (maskInput && this.bound.onMaskChange)
      maskInput.removeEventListener("change", this.bound.onMaskChange);
    if (jsonInput && this.bound.onJsonChange)
      jsonInput.removeEventListener("change", this.bound.onJsonChange);
    if (jsonFixInput && this.bound.onJsonFixChange)
      jsonFixInput.removeEventListener("change", this.bound.onJsonFixChange);
    if (atlasInput && this.bound.onAtlasChange)
      atlasInput.removeEventListener("change", this.bound.onAtlasChange);

    if (zoomInBtn && this.bound.onZoomIn)
      zoomInBtn.removeEventListener("click", this.bound.onZoomIn);
    if (zoomOutBtn && this.bound.onZoomOut)
      zoomOutBtn.removeEventListener("click", this.bound.onZoomOut);
    if (bgToggleBtn && this.bound.onBgToggle)
      bgToggleBtn.removeEventListener("click", this.bound.onBgToggle);

    const { numbersToggleBtn } = this.elements || {};
    if (numbersToggleBtn && this.bound.onNumbersToggle)
      numbersToggleBtn.removeEventListener("click", this.bound.onNumbersToggle);

    const btnRename = document.getElementById("btn-batch-rename");
    if (btnRename && this.bound.onBatchRename)
      btnRename.removeEventListener("click", this.bound.onBatchRename);

    if (this.bound.onKeyDown)
      window.removeEventListener("keydown", this.bound.onKeyDown);
  }

  setLoading(isLoading, message) {
    const overlay = document.getElementById("loading-overlay");
    const txt = document.querySelector("#loading-overlay .loading-text");
    if (overlay) {
      if (isLoading) overlay.classList.remove("hidden");
      else overlay.classList.add("hidden");
    }
    if (txt && message !== undefined) {
      txt.textContent = String(message || "Processing...");
    }
  }

  async handleAtlasLoad(file) {
    if (!file) return;
    this.setLoading(true, `Loading atlas: ${file.name}`);
    try {
      const img = await IO.loadImage(file);
      if (this.state.setAtlasWithMeta) {
        this.state.setAtlasWithMeta(img, { name: file.name });
      } else {
        this.state.setAtlas(img);
      }
    } catch (err) {
      console.error(err);
      alert("Error loading atlas image.");
    } finally {
      this.setLoading(false);
    }
  }

  async handleMaskLoad(fileOrFiles, options = {}) {
    const files =
      fileOrFiles instanceof File
        ? [fileOrFiles]
        : Array.from(fileOrFiles || []).filter(Boolean);
    if (!files.length) return;
    if (!this.state.atlasImage) {
      alert("Please load the Atlas image first.");
      return;
    }

    this.setLoading(true, "Processing masks...");
    // Small delay to allow UI to render loading state
    await new Promise((r) => setTimeout(r, 50));

    let added = 0;
    let skipped = 0;
    let replaced = false;

    try {
      const includeBorder =
        options.includeBorder ??
        (document.getElementById("chk-include-border")?.checked || false);

      const append =
        options.append ??
        document.getElementById("chk-append-imports")?.checked ??
        true;

      const reconcile =
        options.reconcile ??
        document.getElementById("chk-reconcile-duplicates")?.checked ??
        true;

      const confirmOnMulti = options.confirmOnMulti ?? true;

      let effectiveAppend = append;
      if (!effectiveAppend && files.length > 1) {
        if (confirmOnMulti) {
          const ok = confirm(
            "Multiple masks selected but 'Append imports' is OFF.\n\nOK = import as append\nCancel = abort",
          );
          if (!ok)
            return {
              mode: "aborted",
              files: 0,
              replaced: false,
              added: 0,
              skipped: 0,
            };
          effectiveAppend = true;
        }
      }

      // Batch undo for multi-file append
      const doBatch = effectiveAppend && files.length > 1;
      if (doBatch) this.state.snapshot();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.setLoading(
          true,
          `Processing mask ${i + 1}/${files.length}: ${file.name}`,
        );
        const img = await IO.loadImage(file);
        if (
          img.width !== this.state.atlasImage.width ||
          img.height !== this.state.atlasImage.height
        ) {
          alert(`Mask '${file.name}' dimensions must match Atlas dimensions.`);
          continue;
        }

        const off = document.createElement("canvas");
        off.width = img.width;
        off.height = img.height;
        const ctx = off.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        const rects = this.detector.detect(imageData, { includeBorder });
        if (!effectiveAppend || (this.state.rects || []).length === 0) {
          // Replace-mode (or first import)
          this.state.setMask(img, rects);
          replaced = true;
        } else {
          const res = this.state.appendRects(rects, {
            autoName: true,
            sortForNaming: true,
            snapshot: !doBatch,
            reconcileOnDuplicate: !!reconcile,
          });
          added += res.added;
          skipped += res.skipped;
          this.state.maskImage = img;
        }

        // Let the UI breathe between large imports
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err) {
      console.error(err);
      alert("Error processing mask.");
    } finally {
      this.setLoading(false);
    }

    return { mode: "mask", files: files.length, replaced, added, skipped };
  }

  async handleJsonLoad(fileOrFiles, options = {}) {
    const files =
      fileOrFiles instanceof File
        ? [fileOrFiles]
        : Array.from(fileOrFiles || []).filter(Boolean);
    if (!files.length) return;
    this.setLoading(true, "Importing JSON...");

    let added = 0;
    let skipped = 0;
    let replaced = false;

    try {
      const append =
        options.append ??
        document.getElementById("chk-append-imports")?.checked ??
        true;

      const reconcile =
        options.reconcile ??
        document.getElementById("chk-reconcile-duplicates")?.checked ??
        true;

      const seedNaming = options.seedNaming ?? true;
      const confirmOnMulti = options.confirmOnMulti ?? true;

      let effectiveAppend = append;
      if (!effectiveAppend && files.length > 1) {
        if (confirmOnMulti) {
          const ok = confirm(
            "Multiple JSONs selected but 'Append imports' is OFF.\n\nOK = import as append\nCancel = abort",
          );
          if (!ok)
            return {
              mode: "aborted",
              files: 0,
              replaced: false,
              added: 0,
              skipped: 0,
            };
          effectiveAppend = true;
        }
      }

      // Batch undo for multi-file append
      const doBatch = effectiveAppend && files.length > 1;
      if (doBatch) this.state.snapshot();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.setLoading(
          true,
          `Importing JSON ${i + 1}/${files.length}: ${file.name}`,
        );
        const text = await IO.readTextFile(file);
        const data = IO.parseJSON(text, file?.name || "(json file)");

        // Auto-detect workspace export and extract frames from it
        let effectiveData = data;
        if (
          data?.kind === "atlas-maper-workspace" &&
          data?.state?.rects &&
          Array.isArray(data.state.rects)
        ) {
          const frames = {};
          data.state.rects.forEach((r, idx) => {
            const name = r.name || `sprite_${idx}`;
            frames[name] = {
              frame: { x: r.x, y: r.y, w: r.w, h: r.h },
              rotated: false,
              trimmed: false,
              spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
              sourceSize: { w: r.w, h: r.h },
              pivot: { x: 0.5, y: 0.5 },
            };
            if (r.group) frames[name].group = r.group;
          });
          effectiveData = {
            frames,
            meta: {
              app: "AtlasMapper",
              version: "5.0",
              convertedFrom: "workspace",
            },
          };
          console.log(
            `[AtlasMaper] Auto-converted workspace file "${file.name}" → ${data.state.rects.length} frames`,
          );
        }

        // Accept the formats produced by the Settings panel as imports too.
        if (Array.isArray(effectiveData)) {
          effectiveData = { frames: effectiveData.map((entry) => ({
            ...entry,
            frame: entry.frame || { x: entry.x, y: entry.y, w: entry.w, h: entry.h },
          })) };
        } else if (Array.isArray(effectiveData?.textures?.[0]?.frames)) {
          effectiveData = { frames: effectiveData.textures[0].frames };
        }

        if (
          !effectiveData?.frames ||
          typeof effectiveData.frames !== "object"
        ) {
          const e = new Error(
            "Invalid JSON format: expected an object with a 'frames' property",
          );
          const keys =
            data && typeof data === "object" && !Array.isArray(data)
              ? Object.keys(data)
              : null;
          e.details = {
            fileName: file?.name,
            dataType: Array.isArray(data) ? "array" : typeof data,
            topLevelKeys: keys,
            framesType: typeof data?.frames,
            hasKind: !!data?.kind,
            kind: data?.kind,
            hasWorkspacesArray: Array.isArray(data?.workspaces),
            hint:
              data?.kind === "atlas-maper-workspace"
                ? "This looks like a workspace export (.atlasmap.json). Use Workspace Load instead of JSON Import."
                : null,
            textPreviewStart:
              typeof text === "string" ? text.slice(0, 200) : null,
          };
          throw e;
        }

        const entries = Array.isArray(effectiveData.frames)
          ? effectiveData.frames.map((entry, index) => [entry.filename || entry.name || `sprite_${index}`, entry])
          : Object.entries(effectiveData.frames);
        if (entries.some(([, entry]) => !entry?.frame))
          throw new Error("Invalid JSON frame entry.");
        // Seed naming from json frame names (for subsequent mask auto-naming)
        if (seedNaming) {
          this.state.seedNamingFromFrameNames(entries.map(([name]) => name));
        }

        const rects = entries.map(([name, entry]) => ({
          x: entry.frame.x,
          y: entry.frame.y,
          w: entry.frame.w,
          h: entry.frame.h,
          name: name,
          group: entry.group || "default",
        }));

        if (!effectiveAppend || (this.state.rects || []).length === 0) {
          this.state.setRects(rects);
          replaced = true;
        } else {
          const res = this.state.appendRects(rects, {
            autoName: false,
            sortForNaming: false,
            snapshot: !doBatch,
            reconcileOnDuplicate: !!reconcile,
          });
          added += res.added;
          skipped += res.skipped;
        }
      }
    } catch (err) {
      console.log("[AtlasMaper] JSON import failed:", err);
      if (err?.message) console.log("[AtlasMaper] Error message:", err.message);
      if (err?.details) console.log("[AtlasMaper] Details:", err.details);
      if (err?.stack) console.log(err.stack);
      alert("Invalid JSON file.");
    } finally {
      this.setLoading(false);
    }

    return { mode: "json", files: files.length, replaced, added, skipped };
  }

  getAtlasDims() {
    const w =
      this.state?.atlasImage?.width || this.state?.atlasMeta?.width || 0;
    const h =
      this.state?.atlasImage?.height || this.state?.atlasMeta?.height || 0;
    return { w: Number(w) || 0, h: Number(h) || 0 };
  }

  fixFrame1px(frame, atlasDims, expand = 1) {
    const x = Math.round(Number(frame?.x));
    const y = Math.round(Number(frame?.y));
    const w = Math.round(Number(frame?.w));
    const h = Math.round(Number(frame?.h));
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return null;
    }

    const atlasW = Number(atlasDims?.w) || 0;
    const atlasH = Number(atlasDims?.h) || 0;
    const e = Math.max(0, expand | 0);

    const left = atlasW ? Math.min(e, Math.max(0, x)) : e;
    const top = atlasH ? Math.min(e, Math.max(0, y)) : e;
    const right = atlasW ? Math.min(e, Math.max(0, atlasW - (x + w))) : e;
    const bottom = atlasH ? Math.min(e, Math.max(0, atlasH - (y + h))) : e;

    const nx = x - left;
    const ny = y - top;
    const nw = w + left + right;
    const nh = h + top + bottom;

    // Safety clamp
    const out = {
      x: Math.max(0, nx),
      y: Math.max(0, ny),
      w: nw,
      h: nh,
    };

    if (atlasW) out.w = Math.max(1, Math.min(out.w, atlasW - out.x));
    if (atlasH) out.h = Math.max(1, Math.min(out.h, atlasH - out.y));
    return out;
  }

  async handleJsonFixLoad(fileOrFiles, options = {}) {
    const files =
      fileOrFiles instanceof File
        ? [fileOrFiles]
        : Array.from(fileOrFiles || []).filter(Boolean);
    if (!files.length) return;

    this.setLoading(true, "Fixing JSON...");

    let added = 0;
    let skipped = 0;
    let replaced = false;
    let fixedFrames = 0;
    let invalidFrames = 0;
    let filesFixed = 0;

    const atlasDims = this.getAtlasDims();
    const expand = Number.isFinite(options.expand) ? options.expand : 1;

    try {
      const append =
        options.append ??
        document.getElementById("chk-append-imports")?.checked ??
        true;

      const reconcile =
        options.reconcile ??
        document.getElementById("chk-reconcile-duplicates")?.checked ??
        true;

      let effectiveAppend = append;
      if (!effectiveAppend && files.length > 1) {
        const ok = confirm(
          "Multiple JSONs selected but 'Append imports' is OFF.\n\nOK = import as append\nCancel = abort",
        );
        if (!ok)
          return {
            mode: "aborted",
            files: 0,
            replaced: false,
            added: 0,
            skipped: 0,
            fixedFrames: 0,
            invalidFrames: 0,
          };
        effectiveAppend = true;
      }

      // Batch undo for multi-file append
      const doBatch = effectiveAppend && files.length > 1;
      if (doBatch) this.state.snapshot();

      const correctedForDownload = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.setLoading(
          true,
          `Fixing JSON ${i + 1}/${files.length}: ${file.name}`,
        );
        const text = await IO.readTextFile(file);
        const data = IO.parseJSON(text, file?.name || "(json file)");

        // Auto-detect workspace export and extract frames from it
        let effectiveFixData = data;
        if (
          data?.kind === "atlas-maper-workspace" &&
          data?.state?.rects &&
          Array.isArray(data.state.rects)
        ) {
          const frames = {};
          data.state.rects.forEach((r, idx) => {
            const name = r.name || `sprite_${idx}`;
            frames[name] = {
              frame: { x: r.x, y: r.y, w: r.w, h: r.h },
              rotated: false,
              trimmed: false,
              spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
              sourceSize: { w: r.w, h: r.h },
              pivot: { x: 0.5, y: 0.5 },
            };
            if (r.group) frames[name].group = r.group;
          });
          effectiveFixData = {
            frames,
            meta: {
              app: "AtlasMapper",
              version: "5.0",
              convertedFrom: "workspace",
            },
          };
          console.log(
            `[AtlasMaper] Auto-converted workspace file "${file.name}" → ${data.state.rects.length} frames (fix mode)`,
          );
        }

        if (
          !effectiveFixData?.frames ||
          typeof effectiveFixData.frames !== "object"
        ) {
          const e = new Error(
            "Invalid JSON format: expected an object with a 'frames' property",
          );
          const keys =
            data && typeof data === "object" && !Array.isArray(data)
              ? Object.keys(data)
              : null;
          e.details = {
            fileName: file?.name,
            dataType: Array.isArray(data) ? "array" : typeof data,
            topLevelKeys: keys,
            framesType: typeof data?.frames,
            hasKind: !!data?.kind,
            kind: data?.kind,
            hasWorkspacesArray: Array.isArray(data?.workspaces),
            hint:
              data?.kind === "atlas-maper-workspace"
                ? "This looks like a workspace export (.atlasmap.json). Use Workspace Load instead of JSON Fix."
                : null,
            textPreviewStart:
              typeof text === "string" ? text.slice(0, 200) : null,
          };
          throw e;
        }

        const entries = Object.entries(effectiveFixData.frames);

        // Keep naming in sync for subsequent mask auto-naming
        this.state.seedNamingFromFrameNames(entries.map(([name]) => name));

        const outData = {
          ...effectiveFixData,
          frames: { ...effectiveFixData.frames },
        };

        const rects = [];
        for (const [name, entry] of entries) {
          const fixed = this.fixFrame1px(entry?.frame, atlasDims, expand);
          if (!fixed) {
            invalidFrames++;
            continue;
          }
          fixedFrames++;
          rects.push({ x: fixed.x, y: fixed.y, w: fixed.w, h: fixed.h, name });

          // Update JSON frame for download
          outData.frames[name] = {
            ...entry,
            frame: { ...entry.frame, ...fixed },
          };
        }

        if (!effectiveAppend || (this.state.rects || []).length === 0) {
          this.state.setRects(rects);
          replaced = true;
        } else {
          const res = this.state.appendRects(rects, {
            autoName: false,
            sortForNaming: false,
            snapshot: !doBatch,
            reconcileOnDuplicate: !!reconcile,
          });
          added += res.added;
          skipped += res.skipped;
        }

        correctedForDownload.push({ name: file.name, data: outData });
        filesFixed++;
      }

      if (correctedForDownload.length) {
        const canClamp = atlasDims.w > 0 && atlasDims.h > 0;
        const msg =
          `Fixed ${filesFixed} file(s). Updated ${fixedFrames} frame(s).` +
          (invalidFrames ? ` Skipped ${invalidFrames} invalid frame(s).` : "") +
          (canClamp
            ? ""
            : "\n\nTip: Load the Atlas first to clamp frames to its bounds.");

        const shouldDownload = confirm(
          `${msg}\n\nDownload corrected JSON file(s) too?`,
        );
        if (shouldDownload) {
          for (const item of correctedForDownload) {
            const base = String(item.name || "atlas.json").replace(
              /\.json$/i,
              "",
            );
            IO.downloadJSON(item.data, `${base}.fixed.json`);
          }
        }
      }
    } catch (err) {
      console.log("[AtlasMaper] JSON fix/import failed:", err);
      if (err?.message) console.log("[AtlasMaper] Error message:", err.message);
      if (err?.details) console.log("[AtlasMaper] Details:", err.details);
      if (err?.stack) console.log(err.stack);
      alert("Invalid JSON file.");
    } finally {
      this.setLoading(false);

      // allow re-selecting same file
      const input = this.elements?.jsonFixInput;
      if (input) input.value = "";
    }

    return {
      mode: "json-fix",
      files: files.length,
      replaced,
      added,
      skipped,
      fixedFrames,
      invalidFrames,
    };
  }

  exportData() {
    const { rects } = this.state;
    if (!rects.length) {
      alert("Nothing to export.");
      return;
    }

    const out = { frames: {}, meta: { app: "AtlasMapper", version: "1.0" } };
    rects.forEach((b, i) => {
      const n = (b.name || String(i + 1).padStart(4, "0")).trim();
      out.frames[n] = {
        frame: { x: b.x, y: b.y, w: b.w, h: b.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: b.w, h: b.h },
        sourceSize: { w: b.w, h: b.h },
        pivot: { x: 0.5, y: 0.5 },
      };
    });

    IO.downloadJSON(out, "atlas.json");
  }

  updateStatus() {
    const rect = this.state.currentRect;
    const statusEl = document.getElementById("status-bar");
    if (statusEl) {
      statusEl.textContent = rect
        ? `${rect.name || "sprite"} — x:${rect.x}, y:${rect.y}, w:${
            rect.w
          }, h:${rect.h}`
        : "";
    }
  }

  toggleBackgroundMode() {
    const current = this.state.settings?.backgroundMode || "dark";
    const next = current === "light" ? "dark" : "light";
    this.state.updateSettings({ backgroundMode: next });
  }

  updateBgToggle() {
    const btn = this.elements?.bgToggleBtn;
    if (!btn) return;

    const mode = this.state.settings?.backgroundMode || "dark";
    const isLight = mode === "light";

    btn.classList.toggle("is-light", isLight);
    btn.title = isLight
      ? "Background: Light (click to switch to Dark)"
      : "Background: Dark (click to switch to Light)";
  }

  toggleSpriteNumbers() {
    const current = this.state.settings?.showSpriteNumbers || false;
    this.state.updateSettings({ showSpriteNumbers: !current });
    this.updateNumbersToggle();
  }

  updateNumbersToggle() {
    const btn = this.elements?.numbersToggleBtn;
    if (!btn) return;
    const on = this.state.settings?.showSpriteNumbers || false;
    btn.classList.toggle("active", on);
    btn.title = on ? "Hide sprite numbers" : "Show sprite numbers";
  }

  showRenameModal() {
    const modal = document.getElementById("modal-rename");
    const btnApply = document.getElementById("btn-ren-apply");
    const btnCancel = document.getElementById("btn-ren-cancel");
    const inputPattern = document.getElementById("ren-pattern");
    const inputFind = document.getElementById("ren-find");
    const inputReplace = document.getElementById("ren-replace");
    const selectPreset = document.getElementById("ren-preset");
    const selectGroup = document.getElementById("ren-target-group");
    const tokenButtons = document.querySelectorAll(".token-buttons button");

    if (!modal) return;

    // Populate Groups
    if (selectGroup) {
      const groups = new Set(
        this.state.rects.map((r) => r.group).filter((g) => g),
      );
      selectGroup.innerHTML = '<option value="">(Keep Current Group)</option>';
      groups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        selectGroup.appendChild(opt);
      });
    }

    const close = () => modal.close();

    // Preset Handler
    selectPreset.onchange = () => {
      if (selectPreset.value !== "custom") {
        inputPattern.value = selectPreset.value;
      }
    };

    // Token Buttons Handler
    tokenButtons.forEach((btn) => {
      btn.onclick = () => {
        const token = btn.dataset.token;
        // Insert at cursor position or append
        const start = inputPattern.selectionStart;
        const end = inputPattern.selectionEnd;
        const text = inputPattern.value;
        inputPattern.value =
          text.substring(0, start) + token + text.substring(end);
        inputPattern.focus();
        inputPattern.setSelectionRange(
          start + token.length,
          start + token.length,
        );

        // Reset preset to custom if we modify manually
        selectPreset.value = "custom";
      };
    });

    // Input manual change -> set preset to custom
    inputPattern.oninput = () => {
      selectPreset.value = "custom";
    };

    btnCancel.onclick = close;

    btnApply.onclick = () => {
      const pattern = inputPattern.value;
      const find = inputFind.value;
      const replace = inputReplace.value;
      const targetGroup = selectGroup ? selectGroup.value : null;

      this.applyBatchRename(pattern, find, replace, targetGroup);
      close();
    };

    modal.showModal();
  }

  applyBatchRename(pattern, find, replace, targetGroup) {
    // Determine targets: selected or all
    let targets = [];
    if (this.state.selectedIndices.size > 0) {
      targets = Array.from(this.state.selectedIndices);
    } else {
      targets = this.state.rects.map((_, i) => i);
    }

    // We need to update state. But we should do it in one go or iterate?
    // State update triggers notifications. Better to update all and notify once?
    // ProjectState doesn't have batch update yet, but we can just loop.
    // Or better, implement a batch update method in State to avoid spamming history.

    // Let's snapshot once
    this.state.snapshot();

    if (targetGroup) {
      this.state.ensureGroup(targetGroup);
    }

    targets.forEach((idx, i) => {
      const rect = this.state.rects[idx];

      // Update Group first if needed
      if (targetGroup) {
        rect.group = targetGroup;
      }

      let newName = rect.name;

      // 1. Pattern
      if (pattern) {
        newName = pattern
          .replace("{group}", rect.group || "default")
          .replace("{index}", i) // Index in selection/list
          .replace("{i}", i)
          .replace("{name}", rect.name)
          .replace("{x}", rect.x)
          .replace("{y}", rect.y);
      }

      // 2. Find/Replace
      if (find) {
        // Simple string replace or regex? Let's do global string replace
        newName = newName.split(find).join(replace || "");
      }

      rect.name = newName;
    });

    this.state.notify("dataChanged", this.state.rects);
    this.state.notify("rectUpdated", { index: -1 }); // Force refresh
  }
}
