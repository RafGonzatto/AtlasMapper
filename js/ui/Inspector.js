export class Inspector {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.inputs = {};

    this.render();
    this.bindEvents();

    this.state.subscribe((event, data) => {
      if (event === "selectionChanged" || event === "rectUpdated") {
        this.updateValues();
      }
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="inspector-header">Properties</div>
      <div class="inspector-grid">
        <label>Name</label>
        <input type="text" id="insp-name" placeholder="Sprite Name">
        
        <label>Group</label>
        <input type="text" id="insp-group" placeholder="default" list="group-list">
        <datalist id="group-list"></datalist>

        <label>X</label>
        <input type="number" id="insp-x">

        <label>Y</label>
        <input type="number" id="insp-y">

        <label>W</label>
        <input type="number" id="insp-w">

        <label>H</label>
        <input type="number" id="insp-h">
      </div>
      <div class="inspector-actions">
        <button id="insp-dup">Duplicate</button>
        <button id="insp-del" class="danger">Delete</button>
      </div>
    `;

    this.inputs = {
      name: this.container.querySelector("#insp-name"),
      group: this.container.querySelector("#insp-group"),
      x: this.container.querySelector("#insp-x"),
      y: this.container.querySelector("#insp-y"),
      w: this.container.querySelector("#insp-w"),
      h: this.container.querySelector("#insp-h"),
      dup: this.container.querySelector("#insp-dup"),
      del: this.container.querySelector("#insp-del"),
      groupList: this.container.querySelector("#group-list"),
    };
  }

  bindEvents() {
    const update = () => {
      const indices = Array.from(this.state.selectedIndices);
      if (indices.length === 0) return;

      // If multiple selected, only update group
      if (indices.length > 1) {
        const group = this.inputs.group.value;
        indices.forEach((idx) => {
          this.state.updateRect(idx, { group });
        });
        return;
      }

      // Single selection
      const idx = indices[0];
      this.state.updateRect(idx, {
        name: this.inputs.name.value,
        group: this.inputs.group.value,
        x: parseInt(this.inputs.x.value) || 0,
        y: parseInt(this.inputs.y.value) || 0,
        w: parseInt(this.inputs.w.value) || 0,
        h: parseInt(this.inputs.h.value) || 0,
      });
    };

    ["name", "group", "x", "y", "w", "h"].forEach((key) => {
      this.inputs[key].addEventListener("change", update);
      this.inputs[key].addEventListener("keydown", (e) => {
        if (e.key === "Enter") update();
      });
    });

    this.inputs.dup.addEventListener("click", () => {
      // Only duplicate single selection for now to keep it simple
      const rect = this.state.currentRect;
      if (rect) {
        const newRect = {
          ...rect,
          x: rect.x + 10,
          y: rect.y + 10,
          name: rect.name + "_copy",
        };
        const newRects = [...this.state.rects, newRect];
        this.state.setRects(newRects);
        this.state.select(newRects.length - 1);
      }
    });

    this.inputs.del.addEventListener("click", () => {
      this.state.deleteSelected();
    });
  }

  updateValues() {
    const count = this.state.selectedIndices.size;
    const disabled = count === 0;

    // Enable/Disable inputs
    Object.values(this.inputs).forEach((el) => {
      if (el.tagName === "INPUT" || el.tagName === "BUTTON") {
        el.disabled = disabled;
      }
    });

    if (count === 0) {
      this.clearInputs();
      this.container.querySelector(".inspector-header").textContent =
        "Properties";
    } else if (count === 1) {
      const rect = this.state.currentRect;
      this.container.querySelector(".inspector-header").textContent =
        "Properties";
      this.inputs.name.value = rect.name || "";
      this.inputs.group.value = rect.group || "";
      this.inputs.x.value = rect.x;
      this.inputs.y.value = rect.y;
      this.inputs.w.value = rect.w;
      this.inputs.h.value = rect.h;

      // Enable all
      Object.values(this.inputs).forEach((el) => (el.disabled = false));
    } else {
      // Multiple selection
      this.container.querySelector(
        ".inspector-header"
      ).textContent = `${count} items selected`;
      this.clearInputs();
      this.inputs.group.value = ""; // Or maybe 'Mixed'?
      this.inputs.group.placeholder = "Set group for all...";

      // Disable specific fields
      this.inputs.name.disabled = true;
      this.inputs.x.disabled = true;
      this.inputs.y.disabled = true;
      this.inputs.w.disabled = true;
      this.inputs.h.disabled = true;
      this.inputs.dup.disabled = true; // Disable duplicate for multi for now

      // Enable group and delete
      this.inputs.group.disabled = false;
      this.inputs.del.disabled = false;
    }

    // Update datalist
    this.inputs.groupList.innerHTML = "";
    this.state.groups.forEach((_, name) => {
      const opt = document.createElement("option");
      opt.value = name;
      this.inputs.groupList.appendChild(opt);
    });
  }

  clearInputs() {
    this.inputs.name.value = "";
    this.inputs.group.value = "";
    this.inputs.x.value = "";
    this.inputs.y.value = "";
    this.inputs.w.value = "";
    this.inputs.h.value = "";
    this.inputs.group.placeholder = "default";
  }
}
