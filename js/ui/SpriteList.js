export class SpriteList {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.state.subscribe((event, data) => {
      if (event === "dataChanged") {
        this.rebuild();
      } else if (event === "selectionChanged") {
        this.updateSelection();
      }
    });
  }

  rebuild() {
    this.container.innerHTML = "";
    const { rects, atlasImage } = this.state;

    if (!atlasImage) return;

    rects.forEach((b, i) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb";
      wrap.dataset.index = i;

      // Canvas thumbnail
      const mini = document.createElement("canvas");
      mini.width = b.w;
      mini.height = b.h;
      mini
        .getContext("2d")
        .drawImage(atlasImage, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);

      mini.onclick = () => {
        this.state.selectRect(i);
      };

      // Input name
      const inp = document.createElement("input");
      inp.value = b.name || String(i + 1).padStart(4, "0");
      inp.oninput = (e) => {
        this.state.updateRectName(i, e.target.value);
      };
      // Prevent keydown propagation so delete key doesn't delete the sprite while typing
      inp.onkeydown = (e) => e.stopPropagation();

      wrap.append(mini, inp);
      this.container.appendChild(wrap);
    });
    this.updateSelection();
  }

  updateSelection() {
    const index = this.state.selectedIndex;
    [...this.container.children].forEach((child, i) => {
      if (i === index) {
        child.classList.add("selected");
        child.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        child.classList.remove("selected");
      }
    });
  }
}
