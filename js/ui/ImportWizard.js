import { IO } from "../utils/IO.js";
import { RectDetector } from "../core/RectDetector.js";
import { inspectMask, fitMaskToAtlas } from "../core/MaskNormalizer.js";
import { ProjectState } from "../core/ProjectState.js";

export class ImportWizard {
  constructor({ getToolbar, getState } = {}) {
    this.getToolbar = getToolbar;
    this.getState = getState;

    this.modal = document.getElementById("modal-import");
    this.els = {
      atlas: document.getElementById("imp-atlas"),
      masks: document.getElementById("imp-masks"),
      jsons: document.getElementById("imp-jsons"),
      append: document.getElementById("imp-append"),
      includeBorder: document.getElementById("imp-include-border"),
      seedFromJson: document.getElementById("imp-seed-from-json"),
      reconcile: document.getElementById("imp-reconcile"),
      namePrefix: document.getElementById("imp-name-prefix"),
      pad: document.getElementById("imp-pad"),
      startIndex: document.getElementById("imp-start-index"),
      btnOpen: document.getElementById("btn-import-wizard"),
      btnCancel: document.getElementById("btn-imp-cancel"),
      btnPreview: document.getElementById("btn-imp-preview"),
      btnApply: document.getElementById("btn-imp-apply"),
      summary: document.getElementById("imp-summary"),
      reset: document.getElementById("btn-imp-reset"),
    };

    this.selected = {
      atlas: null,
      masks: [],
      jsons: [],
    };

    this.bind();
    this.syncFromMainToggles();
    this.renderSummary();
  }

  bind() {
    if (this.els.btnOpen) {
      this.els.btnOpen.addEventListener("click", () => this.open());
    }

    const onPick = () => {
      this.selected.atlas = this.els.atlas?.files?.[0] || null;
      this.selected.masks = Array.from(this.els.masks?.files || []);
      this.selected.jsons = Array.from(this.els.jsons?.files || []);
      this.renderSummary();
    };

    this.els.atlas?.addEventListener("change", onPick);
    this.els.masks?.addEventListener("change", onPick);
    this.els.jsons?.addEventListener("change", onPick);

    this.els.reset?.addEventListener("click", () => {
      if (this.els.atlas) this.els.atlas.value = "";
      if (this.els.masks) this.els.masks.value = "";
      if (this.els.jsons) this.els.jsons.value = "";
      this.selected = { atlas: null, masks: [], jsons: [] };
      this.renderSummary();
    });

    this.els.btnCancel?.addEventListener("click", () => this.close());

    this.els.btnPreview?.addEventListener("click", async () => {
      await this.previewImport();
    });

    this.els.btnApply?.addEventListener("click", async () => {
      await this.applyImport();
    });
  }

  syncFromMainToggles() {
    const mainAppend = document.getElementById("chk-append-imports");
    const mainBorder = document.getElementById("chk-include-border");
    const mainReconcile = document.getElementById("chk-reconcile-duplicates");
    if (this.els.append && mainAppend)
      this.els.append.checked = !!mainAppend.checked;
    if (this.els.includeBorder && mainBorder)
      this.els.includeBorder.checked = !!mainBorder.checked;
    if (this.els.reconcile && mainReconcile)
      this.els.reconcile.checked = !!mainReconcile.checked;
  }

  syncToMainToggles() {
    const mainAppend = document.getElementById("chk-append-imports");
    const mainBorder = document.getElementById("chk-include-border");
    const mainReconcile = document.getElementById("chk-reconcile-duplicates");
    if (mainAppend && this.els.append)
      mainAppend.checked = !!this.els.append.checked;
    if (mainBorder && this.els.includeBorder)
      mainBorder.checked = !!this.els.includeBorder.checked;
    if (mainReconcile && this.els.reconcile)
      mainReconcile.checked = !!this.els.reconcile.checked;
  }

  open() {
    if (!this.modal) return;
    this.syncFromMainToggles();
    this.renderSummary();
    this.modal.showModal();
  }

  close() {
    this.modal?.close();
  }

  renderSummary() {
    if (!this.els.summary) return;
    const state = this.getState?.();

    const atlasName = this.selected.atlas?.name || "(keep current)";
    const masks = this.selected.masks?.length || 0;
    const jsons = this.selected.jsons?.length || 0;

    const currentAtlas = state?.atlasMeta?.name
      ? `${state.atlasMeta.name} (${state.atlasMeta.width || "?"}x${state.atlasMeta.height || "?"})`
      : state?.atlasImage
        ? `Loaded (${state.atlasImage.width}x${state.atlasImage.height})`
        : "(none)";
    const currentRects = state?.rects?.length || 0;
    const nextIndex = state?.naming?.nextIndex || 1;
    const pad = state?.naming?.pad || 4;
    const prefix = state?.naming?.prefix || "";

    const list = (files) =>
      (files || [])
        .slice(0, 6)
        .map((f) => `<li>${this.escapeHtml(f.name)}</li>`)
        .join("");

    const more = (n) => (n > 6 ? `<li>… +${n - 6} more</li>` : "");

    this.els.summary.innerHTML = `
      <div class="imp-row"><b>Current:</b> Atlas ${this.escapeHtml(currentAtlas)} · ${currentRects} rects · next name: ${this.escapeHtml(prefix)}${String(nextIndex).padStart(pad, "0")}</div>
      <div class="imp-row"><b>Atlas:</b> ${this.escapeHtml(atlasName)}</div>
      <div class="imp-row"><b>JSONs:</b> ${jsons}</div>
      <ul class="imp-file-list">${list(this.selected.jsons)}${more(jsons)}</ul>
      <div class="imp-row"><b>Masks:</b> ${masks}</div>
      <ul class="imp-file-list">${list(this.selected.masks)}${more(masks)}</ul>
      <div class="imp-hint">Import order: Atlas → JSONs → Masks (for correct auto-numbering).</div>
    `;
  }

  makeSimStateFrom(state) {
    const sim = new ProjectState();
    sim.rects = JSON.parse(JSON.stringify(state?.rects || []));
    sim.naming = JSON.parse(JSON.stringify(state?.naming || sim.naming));
    sim.settings = JSON.parse(JSON.stringify(state?.settings || sim.settings));

    const g = state?.groups;
    if (g instanceof Map) {
      sim.groups = new Map(g);
    }
    if (!sim.groups || !(sim.groups instanceof Map)) sim.groups = new Map();
    if (!sim.groups.has("default")) sim.groups.set("default", "#00ff7f");

    return sim;
  }

  async previewImport() {
    const state = this.getState?.();
    if (!state || !this.els.summary) return;

    // Reset the summary to avoid stacking multiple preview blocks
    this.renderSummary();

    const options = {
      append: !!this.els.append?.checked,
      includeBorder: !!this.els.includeBorder?.checked,
      seedNaming: !!this.els.seedFromJson?.checked,
      reconcile: !!this.els.reconcile?.checked,
    };

    const sim = this.makeSimStateFrom(state);
    const detector = new RectDetector();

    // Apply naming overrides to the simulation
    const prefix = this.els.namePrefix?.value ?? "";
    const pad = parseInt(this.els.pad?.value, 10);
    const startIndex = parseInt(this.els.startIndex?.value, 10);
    if (prefix !== undefined) sim.setNamingSeed({ prefix });
    if (Number.isFinite(pad) && pad > 0) sim.setNamingSeed({ pad });
    if (Number.isFinite(startIndex) && startIndex > 0)
      sim.setNamingSeed({ nextIndex: startIndex });

    const warnings = [];
    if (!options.append) {
      if ((this.selected.jsons?.length || 0) > 1) {
        warnings.push(
          "Append is OFF and multiple JSONs are selected: last JSON wins (replaces previous).",
        );
      }
      if ((this.selected.masks?.length || 0) > 1) {
        warnings.push(
          "Append is OFF and multiple Masks are selected: last Mask wins (replaces previous).",
        );
      }
      if (
        (this.selected.jsons?.length || 0) &&
        (this.selected.masks?.length || 0)
      ) {
        warnings.push(
          "Append is OFF: Masks step will replace JSON step results.",
        );
      }
    }

    const startCount = sim.rects?.length || 0;
    const startNextIndex = sim.naming?.nextIndex || 1;

    let jsonAdded = 0;
    let jsonSkipped = 0;
    let jsonReplaced = false;
    let jsonReconciled = 0;

    let maskAdded = 0;
    let maskSkipped = 0;
    let maskReplaced = false;
    let maskReconciled = 0;
    let maskInvalidDim = 0;

    // Preview JSONs
    for (let i = 0; i < (this.selected.jsons || []).length; i++) {
      const file = this.selected.jsons[i];
      try {
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
            `[AtlasMaper] ImportWizard: auto-converted workspace file "${file.name}" → ${data.state.rects.length} frames`,
          );
        }

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
            hint:
              data?.kind === "atlas-maper-workspace"
                ? "This looks like a workspace export (.atlasmap.json), not a frames JSON."
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
        if (options.seedNaming) {
          sim.seedNamingFromFrameNames(entries.map(([name]) => name));
        }

        const rects = entries.map(([name, entry]) => ({
          x: entry.frame.x,
          y: entry.frame.y,
          w: entry.frame.w,
          h: entry.frame.h,
          name: name,
          group: entry.group || "default",
        }));

        if (!options.append || (sim.rects || []).length === 0) {
          sim.rects = sim.dedupeRects(rects);
          jsonReplaced = true;
        } else {
          const res = sim.appendRects(rects, {
            autoName: false,
            sortForNaming: false,
            snapshot: false,
            reconcileOnDuplicate: options.reconcile,
          });
          jsonAdded += res.added || 0;
          jsonSkipped += res.skipped || 0;
          jsonReconciled += res.reconciled || 0;
        }
      } catch (e) {
        console.log(
          `[AtlasMaper] ImportWizard JSON preview failed (${file?.name || "(file)"}):`,
          e,
        );
        if (e?.message) console.log("[AtlasMaper] Error message:", e.message);
        if (e?.details) console.log("[AtlasMaper] Details:", e.details);
        if (e?.stack) console.log(e.stack);
        warnings.push(`JSON preview failed: ${file?.name || "(file)"}`);
      }
    }

    // Preview Masks
    // Need atlas dimensions: prefer selected atlas (wizard), fallback to current workspace atlas.
    let atlasW = 0;
    let atlasH = 0;
    try {
      if (this.selected.atlas) {
        const a = await IO.loadImage(this.selected.atlas);
        atlasW = a?.width || 0;
        atlasH = a?.height || 0;
      } else {
        const atlasImg = state.atlasImage;
        atlasW = atlasImg?.width || 0;
        atlasH = atlasImg?.height || 0;
      }
    } catch {
      // ignore
    }
    if ((this.selected.masks || []).length && (!atlasW || !atlasH)) {
      warnings.push(
        "Mask preview requires an Atlas (selected in the wizard or loaded in the workspace).",
      );
    }

    for (let i = 0; i < (this.selected.masks || []).length; i++) {
      const file = this.selected.masks[i];
      try {
        const img = await IO.loadImage(file);
        const off = document.createElement("canvas");
        off.width = img.width;
        off.height = img.height;
        const ctx = off.getContext("2d");
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, img.width, img.height);

        if (atlasW && atlasH && (img.width !== atlasW || img.height !== atlasH)) {
          try {
            imageData = fitMaskToAtlas(imageData, atlasW, atlasH);
            warnings.push(
              `Mask '${file.name}': dimensions ${img.width}×${img.height} differ from atlas ${atlasW}×${atlasH}. You'll be asked before adjusting its canvas on import.`
            );
          } catch (error) {
            maskInvalidDim++;
            warnings.push(`Mask '${file.name}': ${error.message}`);
            continue;
          }
        }

        const report = inspectMask(imageData);
        if (report.needsNormalization) {
          warnings.push(
            `Mask '${file.name}' has ${report.reasons.join(" and ")}. On import, you can normalize or keep it unchanged. Preview uses original pixels.`
          );
        }

        const rects = detector.detect(imageData, {
          includeBorder: options.includeBorder,
        });

        if (!options.append || (sim.rects || []).length === 0) {
          sim.rects = sim.dedupeRects(rects);
          maskReplaced = true;
        } else {
          const res = sim.appendRects(rects, {
            autoName: true,
            sortForNaming: true,
            snapshot: false,
            reconcileOnDuplicate: options.reconcile,
          });
          maskAdded += res.added || 0;
          maskSkipped += res.skipped || 0;
          maskReconciled += res.reconciled || 0;
        }
      } catch (e) {
        warnings.push(`Mask preview failed: ${file?.name || "(file)"}`);
      }
    }

    const endCount = sim.rects?.length || 0;
    const endNextIndex = sim.naming?.nextIndex || startNextIndex;
    const endPad = sim.naming?.pad || 4;
    const endPrefix = sim.naming?.prefix || "";

    const warnHtml = warnings.length
      ? `<div class="imp-hint" style="margin-top:10px"><b>Warnings</b><ul class="imp-file-list">${warnings
          .map((w) => `<li>${this.escapeHtml(w)}</li>`)
          .join("")}</ul></div>`
      : "";

    const jsonLine = options.append
      ? `files=${this.selected.jsons.length} added=${jsonAdded} skipped=${jsonSkipped} reconciled=${jsonReconciled}`
      : `files=${this.selected.jsons.length} replaced=${jsonReplaced ? "yes" : "no"}`;

    const maskLine = options.append
      ? `files=${this.selected.masks.length} added=${maskAdded} skipped=${maskSkipped} reconciled=${maskReconciled} invalidDim=${maskInvalidDim}`
      : `files=${this.selected.masks.length} replaced=${maskReplaced ? "yes" : "no"} invalidDim=${maskInvalidDim}`;

    this.els.summary.insertAdjacentHTML(
      "beforeend",
      `<div class="imp-hint" style="margin-top:10px"><b>Preview</b><ul class="imp-file-list">
        <li><b>Start:</b> rects=${startCount} next=${this.escapeHtml(endPrefix)}${String(startNextIndex).padStart(endPad, "0")}</li>
        <li><b>JSON:</b> ${this.escapeHtml(jsonLine)}</li>
        <li><b>Mask:</b> ${this.escapeHtml(maskLine)}</li>
        <li><b>End:</b> rects=${endCount} next=${this.escapeHtml(endPrefix)}${String(endNextIndex).padStart(endPad, "0")}</li>
      </ul></div>${warnHtml}`,
    );
  }

  async applyImport() {
    const toolbar = this.getToolbar?.();
    const state = this.getState?.();
    if (!toolbar || !state) return;

    this.syncToMainToggles();

    // Optional naming overrides
    const prefix = this.els.namePrefix?.value ?? "";
    const pad = parseInt(this.els.pad?.value, 10);
    const startIndex = parseInt(this.els.startIndex?.value, 10);

    if (prefix !== undefined) state.setNamingSeed({ prefix });
    if (Number.isFinite(pad) && pad > 0) state.setNamingSeed({ pad });
    if (Number.isFinite(startIndex) && startIndex > 0)
      state.setNamingSeed({ nextIndex: startIndex });

    try {
      const results = [];
      // 1) Atlas (optional)
      if (this.selected.atlas) {
        await toolbar.handleAtlasLoad(this.selected.atlas);
        results.push({ label: "Atlas", detail: this.selected.atlas.name });
      }

      // 2) JSONs (seed naming)
      if (this.selected.jsons.length) {
        const r = await toolbar.handleJsonLoad(this.selected.jsons, {
          append: !!this.els.append?.checked,
          reconcile: !!this.els.reconcile?.checked,
          seedNaming: !!this.els.seedFromJson?.checked,
          confirmOnMulti: false,
        });
        if (r)
          results.push({
            label: "JSON",
            detail: `files=${r.files} added=${r.added} skipped=${r.skipped}`,
          });
      }

      // 3) Masks (auto-name uses the seeded nextIndex)
      if (this.selected.masks.length) {
        const r = await toolbar.handleMaskLoad(this.selected.masks, {
          append: !!this.els.append?.checked,
          reconcile: !!this.els.reconcile?.checked,
          includeBorder: !!this.els.includeBorder?.checked,
          confirmOnMulti: false,
        });
        if (r)
          results.push({
            label: "Mask",
            detail: `files=${r.files} added=${r.added} skipped=${r.skipped}`,
          });
      }

      // Render results summary
      if (this.els.summary) {
        const items = results
          .map(
            (x) =>
              `<li><b>${this.escapeHtml(x.label)}:</b> ${this.escapeHtml(x.detail)}</li>`,
          )
          .join("");
        this.els.summary.insertAdjacentHTML(
          "beforeend",
          `<div class="imp-hint" style="margin-top:10px"><b>Import results</b><ul class="imp-file-list">${items}</ul></div>`,
        );
      }

      this.close();
    } catch (err) {
      console.error(err);
      alert("Import failed. See console for details.");
    }
  }

  escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
