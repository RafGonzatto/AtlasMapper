export class ProjectState {
  constructor() {
    this.atlasImage = null;
    this.maskImage = null;
    this.rects = []; // Array of {x, y, w, h, name}
    this.selectedIndex = -1;
    this.scale = 1;
    this.listeners = [];
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
    this.maskImage = image;
    this.rects = rects;
    this.selectedIndex = -1;
    this.notify("dataChanged", this.rects);
  }

  setRects(rects) {
    this.rects = rects;
    this.selectedIndex = -1;
    this.notify("dataChanged", this.rects);
  }

  selectRect(index) {
    if (index >= 0 && index < this.rects.length) {
      this.selectedIndex = index;
    } else {
      this.selectedIndex = -1;
    }
    this.notify("selectionChanged", this.selectedIndex);
  }

  updateRectName(index, name) {
    if (this.rects[index]) {
      this.rects[index].name = name;
      this.notify("rectUpdated", { index, rect: this.rects[index] });
    }
  }

  deleteRect(index) {
    if (index > -1 && index < this.rects.length) {
      this.rects.splice(index, 1);
      if (this.selectedIndex === index) {
        this.selectedIndex = -1;
      } else if (this.selectedIndex > index) {
        this.selectedIndex--;
      }
      this.notify("dataChanged", this.rects);
      this.notify("selectionChanged", this.selectedIndex);
    }
  }

  setScale(scale) {
    this.scale = scale;
    this.notify("scaleChanged", this.scale);
  }

  get currentRect() {
    return this.selectedIndex > -1 ? this.rects[this.selectedIndex] : null;
  }
}
