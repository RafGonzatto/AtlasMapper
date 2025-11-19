export class CanvasView {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.tooltip = null;

    // Drag selection state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };

    // Bind events
    this.state.subscribe((event) => {
      if (
        [
          "atlasChanged",
          "dataChanged",
          "selectionChanged",
          "scaleChanged",
          "settingsChanged",
          "rectUpdated",
        ].includes(event)
      ) {
        this.render();
      }
    });

    this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.canvas.addEventListener("mouseleave", () => {
      this.hideTooltip();
      this.isDragging = false;
      this.render();
    });
  }

  handleMouseDown(e) {
    if (!this.state.atlasImage) return;
    const { x, y } = this.getMousePos(e);

    this.isDragging = true;
    this.dragStart = { x, y };
    this.dragCurrent = { x, y };
  }

  handleMouseUp(e) {
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
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  handleMouseMove(e) {
    if (!this.state.atlasImage) return;
    const { x, y } = this.getMousePos(e);

    if (this.isDragging) {
      this.dragCurrent = { x, y };
      this.render();
      return; // Don't show tooltip while dragging
    }

    const found = this.state.rects.find(
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
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
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
    );

    let mode = "replace";
    if (e.ctrlKey || e.metaKey) mode = "toggle";
    else if (e.shiftKey) mode = "add";

    this.state.select(index, mode);
  }

  render() {
    const { atlasImage, rects, selectedIndices, scale } = this.state;
    const ctx = this.ctx;
    const cvs = this.canvas;

    // Reset transform and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    if (!atlasImage) return;

    // Resize canvas to match atlas
    if (cvs.width !== atlasImage.width || cvs.height !== atlasImage.height) {
      cvs.width = atlasImage.width;
      cvs.height = atlasImage.height;
    }

    // Draw Atlas
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
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
