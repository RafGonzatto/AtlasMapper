export class SpriteList {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.filter = "";

    // Bind Create Group Button
    const btnCreate = document.getElementById("btn-create-group");
    if (btnCreate) {
      btnCreate.onclick = () => {
        const name = prompt("Enter new group name:");
        if (name) {
          this.state.addGroup(name);
        }
      };
    }

    this.state.subscribe((event, data) => {
      if (event === "dataChanged" || event === "rectUpdated") {
        this.rebuild();
      } else if (event === "selectionChanged") {
        this.updateSelection();
      }
    });
  }

  setFilter(text) {
    this.filter = text.toLowerCase();
    this.rebuild();
  }

  rebuild() {
    this.container.innerHTML = "";
    const { rects, atlasImage } = this.state;

    if (!atlasImage) return;

    // Group rects
    const groups = {};

    // Initialize with all known groups from state
    this.state.groups.forEach((_, name) => {
      groups[name] = [];
    });

    rects.forEach((r, i) => {
      // Filter logic
      if (this.filter && !r.name.toLowerCase().includes(this.filter)) {
        return;
      }
      const gName = r.group || "default";
      if (!groups[gName]) groups[gName] = [];
      groups[gName].push({ ...r, originalIndex: i });
    });

    // Render groups
    Object.keys(groups)
      .sort()
      .forEach((groupName) => {
        const items = groups[groupName];
        // if (items.length === 0) return; // Allow empty groups now

        // Group Container
        const groupEl = document.createElement("div");
        groupEl.className = "sprite-group";

        // Header
        const header = document.createElement("div");
        header.className = "group-header";
        header.innerHTML = `
        <span class="toggle">▼</span>
        <span class="name">${groupName}</span>
        <span class="count">${items.length}</span>
      `;

        // Toggle collapse
        header.onclick = () => {
          groupEl.classList.toggle("collapsed");
          header.querySelector(".toggle").textContent =
            groupEl.classList.contains("collapsed") ? "▶" : "▼";
        };

        // Drop Target Logic
        header.ondragover = (e) => {
          e.preventDefault();
          header.classList.add("drag-over");
        };
        header.ondragleave = () => header.classList.remove("drag-over");
        header.ondrop = (e) => {
          e.preventDefault();
          header.classList.remove("drag-over");
          const data = e.dataTransfer.getData("text/plain");
          if (!data) return;

          const indices = JSON.parse(data);
          indices.forEach((idx) => {
            this.state.updateRect(idx, { group: groupName });
          });
        };

        // Content Grid
        const content = document.createElement("div");
        content.className = "group-content";

        items.forEach((b) => {
          const i = b.originalIndex;
          const wrap = document.createElement("div");
          wrap.className = "thumb";
          wrap.dataset.index = i;
          wrap.draggable = true;

          // Drag Start
          wrap.ondragstart = (e) => {
            // If dragging a selected item, drag all selected.
            // If dragging an unselected item, drag only that one.
            let indicesToDrag = [i];
            if (this.state.selectedIndices.has(i)) {
              indicesToDrag = Array.from(this.state.selectedIndices);
            }
            e.dataTransfer.setData("text/plain", JSON.stringify(indicesToDrag));
          };

          // Group indicator (border color)
          if (b.group) {
            wrap.style.borderLeft = `3px solid ${this.state.getGroupColor(
              b.group
            )}`;
          }

          // Canvas thumbnail
          const mini = document.createElement("canvas");
          mini.width = b.w;
          mini.height = b.h;
          mini
            .getContext("2d")
            .drawImage(atlasImage, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);

          // Click handler with modifier support
          wrap.onclick = (e) => {
            e.stopPropagation(); // Prevent header toggle
            let mode = "replace";
            if (e.ctrlKey || e.metaKey) mode = "toggle";
            else if (e.shiftKey) mode = "add";

            this.state.select(i, mode);
          };

          // Name label
          const lbl = document.createElement("div");
          lbl.className = "thumb-name";
          lbl.textContent = b.name || String(i + 1).padStart(4, "0");
          lbl.title = b.name;

          wrap.append(mini, lbl);
          content.appendChild(wrap);
        });

        groupEl.append(header, content);
        this.container.appendChild(groupEl);
      });

    this.updateSelection();
  }

  updateSelection() {
    const indices = this.state.selectedIndices;
    // We need to traverse groups now
    const thumbs = this.container.querySelectorAll(".thumb");
    thumbs.forEach((child) => {
      const idx = parseInt(child.dataset.index);
      if (indices.has(idx)) {
        child.classList.add("selected");
        if (indices.size === 1) {
          child.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } else {
        child.classList.remove("selected");
      }
    });
  }
}
