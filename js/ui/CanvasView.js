export class CanvasView {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;

    // Bind events
    this.state.subscribe((event) => {
      if (
        [
          "atlasChanged",
          "dataChanged",
          "selectionChanged",
          "scaleChanged",
        ].includes(event)
      ) {
        this.render();
      }
    });

    this.canvas.addEventListener("click", this.handleClick.bind(this));
  }

  handleClick(e) {
    if (!this.state.atlasImage) return;

    const rect = this.canvas.getBoundingClientRect();
    const scale = this.state.scale;
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);

    const index = this.state.rects.findIndex(
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
    );

    this.state.selectRect(index);
  }

  render() {
    const { atlasImage, rects, selectedIndex, scale } = this.state;
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

    // Draw Rects
    rects.forEach((b, i) => {
      const isSelected = i === selectedIndex;
      ctx.lineWidth = (isSelected ? 2 : 1) / scale;
      ctx.strokeStyle = isSelected ? "#ff3e3e" : "#00ff7f";
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    });
  }
}
