export class SpriteList {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.filter = "";

    this.unsub = null;
    this.boundContainerDragOver = null;
    this.boundContainerDragLeave = null;
    this.boundContainerDrop = null;

    this.dragScrollRaf = null;
    this.dragScrollDirection = 0;
    this.dragScrollSpeed = 0;
    this.activeDrag = false;

    this.contextMenuEl = null;
    this.contextMenuOpen = false;
    this.boundCloseContextMenu = null;

    // Bind Create Group Button
    const btnCreate = document.getElementById("btn-create-group");
    if (btnCreate) {
      btnCreate.onclick = () => {
        const hasSelection = this.state.selectedIndices.size > 0;
        const name = prompt(
          hasSelection
            ? "Enter new group name (selected sprites will be moved):"
            : "Enter new group name:",
        );
        if (!name) return;

        const groupName = hasSelection
          ? this.state.createGroupFromSelection(name)
          : (this.state.addGroup(name), this.state.normalizeGroupName(name));

        if (groupName) {
          // Ensure the new group becomes visible even if user is far away
          requestAnimationFrame(() => {
            this.expandGroup(groupName);
            this.scrollGroupIntoView(groupName);
          });
        }
      };
    }

    // Auto-scroll while dragging within the thumbs list
    this.boundContainerDragOver = (e) => {
      if (!this.activeDrag) return;
      this.updateAutoScrollFromEvent(e);
    };
    this.boundContainerDragLeave = () => {
      if (!this.activeDrag) return;
      this.stopAutoScroll();
    };
    this.boundContainerDrop = () => {
      this.stopAutoScroll();
    };

    this.container.addEventListener("dragover", this.boundContainerDragOver);
    this.container.addEventListener("dragleave", this.boundContainerDragLeave);
    this.container.addEventListener("drop", this.boundContainerDrop);

    this.unsub = this.state.subscribe((event) => {
      if (event === "dataChanged" || event === "rectUpdated") {
        this.rebuild();
      } else if (event === "selectionChanged") {
        this.updateSelection();
      }
    });
  }

  dispose() {
    if (this.unsub) this.unsub();

    if (this.boundContainerDragOver)
      this.container.removeEventListener(
        "dragover",
        this.boundContainerDragOver,
      );
    if (this.boundContainerDragLeave)
      this.container.removeEventListener(
        "dragleave",
        this.boundContainerDragLeave,
      );
    if (this.boundContainerDrop)
      this.container.removeEventListener("drop", this.boundContainerDrop);

    // Close context menu & detach global listeners
    if (this.contextMenuOpen) this.closeContextMenu();
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  ensureContextMenu() {
    if (this.contextMenuEl) return;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.display = "none";
    menu.tabIndex = -1;

    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    this.boundCloseContextMenu = (e) => {
      // If click is inside menu, ignore (handled by button click)
      if (e && this.contextMenuEl && this.contextMenuEl.contains(e.target))
        return;
      this.closeContextMenu();
    };

    window.addEventListener("keydown", (e) => {
      if (!this.contextMenuOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeContextMenu();
      }
    });
  }

  closeContextMenu() {
    if (!this.contextMenuEl) return;
    this.contextMenuEl.style.display = "none";
    this.contextMenuEl.innerHTML = "";
    this.contextMenuOpen = false;

    document.removeEventListener("mousedown", this.boundCloseContextMenu);
    document.removeEventListener("scroll", this.boundCloseContextMenu, true);
    window.removeEventListener("resize", this.boundCloseContextMenu);
  }

  openMoveToGroupMenu({ x, y } = {}) {
    this.ensureContextMenu();

    const menu = this.contextMenuEl;
    menu.innerHTML = "";

    const title = document.createElement("div");
    title.className = "context-menu-title";
    title.textContent = `Move ${this.state.selectedIndices.size || 1} selected to…`;
    menu.appendChild(title);

    const addSeparator = () => {
      const sep = document.createElement("div");
      sep.className = "context-menu-sep";
      menu.appendChild(sep);
    };

    const addItem = (label, onClick, opts = {}) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "context-menu-item";
      btn.textContent = label;
      if (opts.subtle) btn.classList.add("subtle");
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          onClick?.();
        } finally {
          this.closeContextMenu();
        }
      };
      menu.appendChild(btn);
    };

    // Common destinations
    const groupNames = Array.from(this.state.groups.keys()).sort((a, b) =>
      a.localeCompare(b),
    );

    const recents = this.state.getRecentGroups?.(5) || [];

    if (recents.length > 0) {
      const recentHeader = document.createElement("div");
      recentHeader.className = "context-menu-subtitle";
      recentHeader.textContent = "Recent";
      menu.appendChild(recentHeader);

      recents.forEach((g) => {
        addItem(g, () => this.state.moveSelectedToGroup(g));
      });

      addSeparator();
    }

    const allHeader = document.createElement("div");
    allHeader.className = "context-menu-subtitle";
    allHeader.textContent = "All groups";
    menu.appendChild(allHeader);

    // Ensure default is first
    groupNames.sort((a, b) => {
      if (a === "default") return -1;
      if (b === "default") return 1;
      return a.localeCompare(b);
    });

    groupNames.forEach((g) => {
      addItem(g, () => this.state.moveSelectedToGroup(g));
    });

    addSeparator();

    addItem(
      "+ New group…",
      () => {
        const name = prompt(
          "Enter new group name (selected sprites will be moved):",
        );
        if (!name) return;
        const created = this.state.createGroupFromSelection(name);
        if (created) {
          requestAnimationFrame(() => {
            this.expandGroup(created);
            this.scrollGroupIntoView(created);
          });
        }
      },
      { subtle: true },
    );

    // Position
    menu.style.left = `${Math.max(8, x || 8)}px`;
    menu.style.top = `${Math.max(8, y || 8)}px`;
    menu.style.display = "block";
    this.contextMenuOpen = true;

    // Clamp to viewport after render
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      let nx = r.left;
      let ny = r.top;
      if (r.right > window.innerWidth - 8)
        nx -= r.right - (window.innerWidth - 8);
      if (r.bottom > window.innerHeight - 8)
        ny -= r.bottom - (window.innerHeight - 8);
      nx = Math.max(8, nx);
      ny = Math.max(8, ny);
      menu.style.left = `${nx}px`;
      menu.style.top = `${ny}px`;
      menu.focus();
    });

    // Close behavior
    document.addEventListener("mousedown", this.boundCloseContextMenu);
    document.addEventListener("scroll", this.boundCloseContextMenu, true);
    window.addEventListener("resize", this.boundCloseContextMenu);
  }

  getGroupElement(groupName) {
    return this.container.querySelector(
      `.sprite-group[data-group="${CSS.escape(groupName)}"]`,
    );
  }

  scrollGroupIntoView(groupName) {
    const el = this.getGroupElement(groupName);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  expandGroup(groupName) {
    const el = this.getGroupElement(groupName);
    if (!el) return;
    el.classList.remove("collapsed");
    const toggle = el.querySelector(".group-header .toggle");
    if (toggle) toggle.textContent = "▼";
  }

  updateAutoScrollFromEvent(e) {
    const rect = this.container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone = 36;
    const maxSpeed = 18;

    let direction = 0;
    let speed = 0;
    if (y < zone) {
      direction = -1;
      speed = Math.min(maxSpeed, Math.ceil(((zone - y) / zone) * maxSpeed));
    } else if (y > rect.height - zone) {
      direction = 1;
      const d = y - (rect.height - zone);
      speed = Math.min(maxSpeed, Math.ceil((d / zone) * maxSpeed));
    }

    this.dragScrollDirection = direction;
    this.dragScrollSpeed = speed;

    if (direction === 0) {
      this.stopAutoScroll();
      return;
    }

    if (!this.dragScrollRaf) {
      const tick = () => {
        if (!this.activeDrag || this.dragScrollDirection === 0) {
          this.dragScrollRaf = null;
          return;
        }
        this.container.scrollTop +=
          this.dragScrollDirection * this.dragScrollSpeed;
        this.dragScrollRaf = requestAnimationFrame(tick);
      };
      this.dragScrollRaf = requestAnimationFrame(tick);
    }
  }

  stopAutoScroll() {
    this.dragScrollDirection = 0;
    this.dragScrollSpeed = 0;
    if (this.dragScrollRaf) {
      cancelAnimationFrame(this.dragScrollRaf);
      this.dragScrollRaf = null;
    }
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
    const groups = Object.create(null);

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
        groupEl.dataset.group = groupName;

        // Header
        const header = document.createElement("div");
        header.className = "group-header";
        header.style.borderLeft = `3px solid ${this.state.getGroupColor(
          groupName,
        )}`;
        header.innerHTML = `
        <span class="toggle">▼</span>
        <span class="name"></span>
        <span class="count">${items.length}</span>
        <button class="group-action" title="Rename group" data-action="rename">✎</button>
        <button class="group-action" title="Delete group" data-action="delete">🗑</button>
      `;
        header.querySelector(".name").textContent = groupName;

        // Toggle collapse (ignore clicks on action buttons)
        header.onclick = (e) => {
          const actionBtn = e.target.closest?.(".group-action");
          if (actionBtn) return;

          // QoL: Alt+Click selects all items in group
          if (e.altKey) {
            const indices = items.map((it) => it.originalIndex);
            this.state.selectRange(indices, "replace");
            return;
          }

          groupEl.classList.toggle("collapsed");
          header.querySelector(".toggle").textContent =
            groupEl.classList.contains("collapsed") ? "▶" : "▼";
        };

        // Group actions
        header.querySelectorAll(".group-action").forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === "rename") {
              if (groupName === "default") {
                alert("The default group cannot be renamed.");
                return;
              }
              const newName = prompt(`Rename group '${groupName}' to:`);
              if (!newName) return;
              const ok = this.state.renameGroup(groupName, newName);
              if (!ok) {
                alert(
                  "Could not rename group. Name may already exist or be invalid.",
                );
              } else {
                requestAnimationFrame(() => {
                  this.expandGroup(newName.trim());
                  this.scrollGroupIntoView(newName.trim());
                });
              }
            }
            if (action === "delete") {
              if (groupName === "default") {
                alert("The default group cannot be deleted.");
                return;
              }
              const ok = confirm(
                `Delete group '${groupName}'? Sprites will be moved to 'default'.`,
              );
              if (!ok) return;
              this.state.deleteGroup(groupName, { moveTo: "default" });
            }
          };
        });

        // Drop Target Logic
        header.ondragover = (e) => {
          e.preventDefault();
          header.classList.add("drag-over");
          this.activeDrag = true;
          this.updateAutoScrollFromEvent(e);
        };
        header.ondragleave = () => {
          header.classList.remove("drag-over");
          this.stopAutoScroll();
        };
        header.ondrop = (e) => {
          e.preventDefault();
          header.classList.remove("drag-over");
          const data = e.dataTransfer.getData("text/plain");
          if (!data) return;

          try {
            const indices = JSON.parse(data);
            this.state.moveRectsToGroup(indices, groupName);
          } catch (err) {
            console.log(
              "[AtlasMaper] Invalid drag/drop JSON payload for moving sprites:",
              err,
            );
            if (err?.message)
              console.log("[AtlasMaper] Error message:", err.message);
            if (err?.stack) console.log(err.stack);
          }
          this.stopAutoScroll();
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

          // Context menu: move to group
          wrap.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Ensure selection is coherent: if right-clicking an unselected item,
            // select it exclusively before opening the menu.
            if (!this.state.selectedIndices.has(i)) {
              this.state.select(i, "replace");
            }

            this.openMoveToGroupMenu({ x: e.clientX, y: e.clientY });
          };

          // Drag Start
          wrap.ondragstart = (e) => {
            this.activeDrag = true;
            wrap.classList.add("dragging");
            // If dragging a selected item, drag all selected.
            // If dragging an unselected item, drag only that one.
            let indicesToDrag = [i];
            if (this.state.selectedIndices.has(i)) {
              indicesToDrag = Array.from(this.state.selectedIndices);
            }
            e.dataTransfer.setData("text/plain", JSON.stringify(indicesToDrag));
          };

          wrap.ondragend = () => {
            this.activeDrag = false;
            wrap.classList.remove("dragging");
            this.stopAutoScroll();
            this.container
              .querySelectorAll(".group-header.drag-over")
              .forEach((h) => h.classList.remove("drag-over"));
          };

          // Group indicator (border color)
          wrap.style.borderLeft = `3px solid ${this.state.getGroupColor(
            b.group || "default",
          )}`;

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

            // If a context menu is open, close it on click
            if (this.contextMenuOpen) this.closeContextMenu();

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
