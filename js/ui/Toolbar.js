import { IO } from "../utils/IO.js";
import { RectDetector } from "../core/RectDetector.js";

export class Toolbar {
  constructor(elements, state) {
    this.elements = elements;
    this.state = state;
    this.detector = new RectDetector();

    this.bindEvents();
    this.updateStatus();

    this.state.subscribe((event) => {
      if (event === "selectionChanged" || event === "dataChanged") {
        this.updateStatus();
      }
    });
  }

  bindEvents() {
    const { maskInput, jsonInput, atlasInput, zoomInBtn, zoomOutBtn } =
      this.elements;

    // File Inputs
    if (maskInput)
      maskInput.addEventListener("change", (e) =>
        this.handleMaskLoad(e.target.files[0])
      );
    if (jsonInput)
      jsonInput.addEventListener("change", (e) =>
        this.handleJsonLoad(e.target.files[0])
      );
    if (atlasInput)
      atlasInput.addEventListener("change", (e) =>
        this.handleAtlasLoad(e.target.files[0])
      );

    // Buttons
    if (zoomInBtn)
      zoomInBtn.addEventListener("click", () =>
        this.state.setScale(this.state.scale * 1.25)
      );
    if (zoomOutBtn)
      zoomOutBtn.addEventListener("click", () =>
        this.state.setScale(Math.max(0.25, this.state.scale / 1.25))
      );

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
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
    });
  }

  async handleAtlasLoad(file) {
    if (!file) return;
    try {
      const img = await IO.loadImage(file);
      this.state.setAtlas(img);
    } catch (err) {
      console.error(err);
      alert("Error loading atlas image.");
    }
  }

  async handleMaskLoad(file) {
    if (!file) return;
    if (!this.state.atlasImage) {
      alert("Please load the Atlas image first.");
      return;
    }

    try {
      const img = await IO.loadImage(file);
      if (
        img.width !== this.state.atlasImage.width ||
        img.height !== this.state.atlasImage.height
      ) {
        alert("Mask dimensions must match Atlas dimensions.");
        return;
      }

      // Process mask
      const off = document.createElement("canvas");
      off.width = img.width;
      off.height = img.height;
      const ctx = off.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);

      // Ask user about border inclusion (simple confirm for now, or we can add a checkbox in UI)
      // Since we can't easily add a checkbox in the file dialog flow, let's check a UI element
      // or just use confirm() as a quick solution, but better to have a persistent setting.
      // Let's look for a checkbox in the DOM. If not found, default to false.
      const includeBorder =
        document.getElementById("chk-include-border")?.checked || false;

      const rects = this.detector.detect(imageData, { includeBorder });
      this.state.setMask(img, rects);
    } catch (err) {
      console.error(err);
      alert("Error processing mask.");
    }
  }

  async handleJsonLoad(file) {
    if (!file) return;
    try {
      const text = await IO.readTextFile(file);
      const data = JSON.parse(text);

      if (!data.frames) throw new Error("Invalid JSON format");

      const rects = Object.entries(data.frames).map(([name, entry]) => ({
        x: entry.frame.x,
        y: entry.frame.y,
        w: entry.frame.w,
        h: entry.frame.h,
        name: name,
      }));

      this.state.setRects(rects);
    } catch (err) {
      console.error(err);
      alert("Invalid JSON file.");
    }
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
}
