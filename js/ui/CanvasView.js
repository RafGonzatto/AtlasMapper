export class CanvasView {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.tooltip = null;

    this.applyPixelArtSettings();

    this.unsub = null;
    this.bound = {
      mousedown: this.handleMouseDown.bind(this),
      mousemove: this.handleMouseMove.bind(this),
      mouseup: this.handleMouseUp.bind(this),
      wheel: this.handleWheel.bind(this),
      mouseleave: null,
    };

    // Drag selection state
    this.isDragging = false;
    this.isPanning = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };
    this.panStart = { x: 0, y: 0 };

    // Bind events
    this.unsub = this.state.subscribe((event) => {
      if (
        [
          "atlasChanged",
          "dataChanged",
          "selectionChanged",
          "scaleChanged",
          "viewChanged",
          "settingsChanged",
          "rectUpdated",
        ].includes(event)
      ) {
        this.render();
      }
    });

    this.canvas.addEventListener("mousedown", this.bound.mousedown);
    this.canvas.addEventListener("mousemove", this.bound.mousemove);
    this.canvas.addEventListener("mouseup", this.bound.mouseup);
    this.canvas.addEventListener("wheel", this.bound.wheel);
    this.bound.mouseleave = () => {
      this.hideTooltip();
      this.isDragging = false;
      this.isPanning = false;
      this.render();
    };
    this.canvas.addEventListener("mouseleave", this.bound.mouseleave);
  }

  applyPixelArtSettings() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Keep pixel-art crisp when scaling.
    ctx.imageSmoothingEnabled = false;
    // Vendor-prefixed flags for older engines (harmless if ignored).
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "low";
  }

  getNextZoomScale(direction) {
    // Discrete zoom levels avoid uneven pixel sizes from fractional scales.
    // Keep some zoom-out options, but prefer integer zoom-in steps.
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
  }

  snapOffsetForScale(offset, scale) {
    // When scale is (almost) an integer, keep translation aligned to device pixels.
    const isIntegerish = Math.abs(scale - Math.round(scale)) < 1e-6;
    if (!isIntegerish) return offset;
    return {
      x: Math.round(offset.x),
      y: Math.round(offset.y),
    };
  }

  dispose() {
    if (this.unsub) this.unsub();

    this.canvas.removeEventListener("mousedown", this.bound.mousedown);
    this.canvas.removeEventListener("mousemove", this.bound.mousemove);
    this.canvas.removeEventListener("mouseup", this.bound.mouseup);
    this.canvas.removeEventListener("wheel", this.bound.wheel);
    if (this.bound.mouseleave)
      this.canvas.removeEventListener("mouseleave", this.bound.mouseleave);

    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  applyWrapBackground(settings) {
    const wrap = this.canvas?.parentElement;
    if (!wrap) return;

    const mode = settings?.backgroundMode || "dark";
    wrap.classList.remove(
      "bg-dark",
      "bg-light",
      "bg-checkerboard",
      "bg-custom",
    );

    if (mode === "light") wrap.classList.add("bg-light");
    else if (mode === "checkerboard") wrap.classList.add("bg-checkerboard");
    else if (mode === "custom") {
      wrap.classList.add("bg-custom");
      wrap.style.setProperty(
        "--view-bg",
        settings?.backgroundColor || "#ff00ff",
      );
    } else {
      wrap.classList.add("bg-dark");
      wrap.style.removeProperty("--view-bg");
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = this.getNextZoomScale(direction);

    // Zoom towards mouse
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate world point under mouse before zoom
    const worldX = (mouseX - this.state.viewOffset.x) / this.state.scale;
    const worldY = (mouseY - this.state.viewOffset.y) / this.state.scale;

    // Update scale
    this.state.setScale(newScale);

    // Calculate new offset to keep world point under mouse
    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = mouseY - worldY * newScale;

    const snapped = this.snapOffsetForScale(
      { x: newOffsetX, y: newOffsetY },
      newScale,
    );
    this.state.setPan(snapped.x, snapped.y);
  }

  handleMouseDown(e) {
    if (!this.state.atlasImage) return;

    // Middle click or Space+Click for Pan
    if (e.button === 1 || e.code === "Space" || e.getModifierState("Space")) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panStartOffset = { ...this.state.viewOffset };
      return;
    }

    const { x, y } = this.getMousePos(e);
    this.isDragging = true;
    this.dragStart = { x, y };
    this.dragCurrent = { x, y };
  }

  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }
    if (!this.isDragging) return;
    this.isDragging = false;

    const { x, y } = this.getMousePos(e);
    const dx = Math.abs(x - this.dragStart.x);
    const dy = Math.abs(y - this.dragStart.y);

    // If drag was very small, treat as click
    if (dx < 3 && dy < 3) {
      this.handleClick(e);
    } else {
      this.handleDragSelection(e);
    }
    this.render();
  }

  handleDragSelection(e) {
    const x1 = Math.min(this.dragStart.x, this.dragCurrent.x);
    const y1 = Math.min(this.dragStart.y, this.dragCurrent.y);
    const x2 = Math.max(this.dragStart.x, this.dragCurrent.x);
    const y2 = Math.max(this.dragStart.y, this.dragCurrent.y);

    const indices = [];
    this.state.rects.forEach((r, i) => {
      // Check intersection
      if (r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1) {
        indices.push(i);
      }
    });

    const mode = e.shiftKey ? "add" : "replace";
    this.state.selectRange(indices, mode);
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.state.scale;
    const offset = this.state.viewOffset;
    return {
      x: (e.clientX - rect.left - offset.x) / scale,
      y: (e.clientY - rect.top - offset.y) / scale,
    };
  }

  handleMouseMove(e) {
    if (!this.state.atlasImage) return;

    if (this.isPanning) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;

      const next = {
        x: this.panStartOffset.x + dx,
        y: this.panStartOffset.y + dy,
      };
      const snapped = this.snapOffsetForScale(next, this.state.scale || 1);
      this.state.setPan(snapped.x, snapped.y);
      return;
    }

    const { x, y } = this.getMousePos(e);

    if (this.isDragging) {
      this.dragCurrent = { x, y };
      this.render();
      return; // Don't show tooltip while dragging
    }

    const found = this.state.rects.find(
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
    );

    if (found) {
      this.showTooltip(e.clientX, e.clientY, found);
    } else {
      this.hideTooltip();
    }
  }

  showTooltip(x, y, rect) {
    if (!this.tooltip) {
      this.tooltip = document.createElement("div");
      this.tooltip.className = "canvas-tooltip";
      document.body.appendChild(this.tooltip);
    }
    this.tooltip.style.display = "block";
    this.tooltip.style.left = x + 15 + "px";
    this.tooltip.style.top = y + 15 + "px";
    this.tooltip.textContent = `${rect.name || "unnamed"} (${rect.w}x${
      rect.h
    })`;
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }

  handleClick(e) {
    if (!this.state.atlasImage) return;
    const { x, y } = this.getMousePos(e);

    const index = this.state.rects.findIndex(
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
    );

    let mode = "replace";
    if (e.ctrlKey || e.metaKey) mode = "toggle";
    else if (e.shiftKey) mode = "add";

    this.state.select(index, mode);
  }

  render() {
    const { atlasImage, rects, selectedIndices, scale, viewOffset, settings } =
      this.state;
    const ctx = this.ctx;
    const cvs = this.canvas;

    this.applyWrapBackground(settings);

    // Reset transform and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // Ensure pixel-art settings stay applied (resizing clears context state).
    this.applyPixelArtSettings();

    if (!atlasImage) return;

    // Resize canvas logic is tricky with Pan/Zoom.
    // Usually we want the canvas element to fill the container, and we draw the image transformed.
    // But the current implementation resizes the canvas to match the image dimensions.
    // This means 'scale' is applied via CSS or context scale?
    // Looking at previous code: ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // This implies the canvas internal resolution matches the image, but we zoom in/out?
    // Wait, if canvas.width = image.width, then zooming in (scale > 1) would crop the image if the canvas element size is fixed?
    // Or does the canvas element grow?
    // The previous code: cvs.width = atlasImage.width;
    // This means the canvas pixel count equals the image pixel count.
    // If we scale up, we are drawing bigger pixels? No, we are drawing outside the canvas bounds if we scale up without resizing canvas?
    // Actually, standard HTML5 Canvas zoom usually involves:
    // 1. Canvas size = Screen size (Container size)
    // 2. Draw image with transform (translate + scale)

    // The current implementation seems to rely on the canvas being the size of the image,
    // and maybe CSS scales it? Or maybe the user hasn't zoomed much yet?
    // Let's switch to the "Canvas fills container" model for proper Pan/Zoom.

    const container = cvs.parentElement;
    if (
      cvs.width !== container.clientWidth ||
      cvs.height !== container.clientHeight
    ) {
      cvs.width = container.clientWidth;
      cvs.height = container.clientHeight;

      // Resizing resets the context state.
      this.applyPixelArtSettings();
    }

    // Apply View Transform
    ctx.setTransform(scale, 0, 0, scale, viewOffset.x, viewOffset.y);

    // Draw Atlas
    ctx.drawImage(atlasImage, 0, 0);

    // Draw Grid if enabled
    if (this.state.settings.showGrid) {
      this.drawGrid(ctx, atlasImage.width, atlasImage.height);
    }

    // Draw Rects
    rects.forEach((b, i) => {
      const isSelected = selectedIndices.has(i);
      const groupColor = b.group
        ? this.state.getGroupColor(b.group)
        : "#00ff7f";

      ctx.lineWidth = (isSelected ? 2 : 1) / scale;
      ctx.strokeStyle = isSelected ? "#ffffff" : groupColor;

      // If selected, fill slightly
      if (isSelected) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // Dashed line for selection
        ctx.setLineDash([4 / scale, 2 / scale]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    });
    ctx.setLineDash([]);

    // Draw Sprite Number Overlay
    if (settings.showSpriteNumbers) {
      const fontSize = settings.spriteNumberSize || 14;
      // Reset transform to screen space so text size is independent of zoom
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      rects.forEach((b, i) => {
        // Convert sprite center from world coords to screen coords
        const cx = (b.x + b.w / 2) * scale + viewOffset.x;
        const cy = (b.y + b.h / 2) * scale + viewOffset.y;

        // Extract trailing number from sprite name, fall back to array index
        const nameMatch = b.name?.match(/(\d+)\s*$/);
        const text = nameMatch ? nameMatch[1] : String(i);

        // Draw background pill for readability
        const metrics = ctx.measureText(text);
        const pw = metrics.width + 6;
        const ph = fontSize + 4;
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.beginPath();
        ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 3);
        ctx.fill();

        // Draw text
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, cx, cy);
      });

      // Restore world transform for subsequent drawing
      ctx.setTransform(scale, 0, 0, scale, viewOffset.x, viewOffset.y);
    }

    // Draw Drag Selection Box
    if (this.isDragging) {
      const x = Math.min(this.dragStart.x, this.dragCurrent.x);
      const y = Math.min(this.dragStart.y, this.dragCurrent.y);
      const w = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const h = Math.abs(this.dragCurrent.y - this.dragStart.y);

      ctx.fillStyle = "rgba(78, 170, 255, 0.2)";
      ctx.strokeStyle = "#4eaaff";
      ctx.lineWidth = 1 / scale;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }

  drawGrid(ctx, w, h) {
    ctx.lineWidth = 0.5 / this.state.scale;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    // Simple 32x32 grid for reference, or maybe just a border?
    // User didn't specify grid size, so let's assume a standard 32px or just don't draw lines if not configured.
    // Actually, "exibir/ocultar grid" usually refers to the detected cells or a background grid.
    // Let's draw a 32x32 grid as a helper.
    const step = 32;
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
}
