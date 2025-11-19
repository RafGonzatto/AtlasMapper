import { ProjectState } from "./core/ProjectState.js";
import { CanvasView } from "./ui/CanvasView.js";
import { SpriteList } from "./ui/SpriteList.js";
import { Toolbar } from "./ui/Toolbar.js";
import { Inspector } from "./ui/Inspector.js";
import { SettingsPanel } from "./ui/SettingsPanel.js";

class App {
  constructor() {
    this.state = new ProjectState();
    this.initUI();
  }

  initUI() {
    // Canvas
    const canvas = document.getElementById("atlas");
    this.view = new CanvasView(canvas, this.state);

    // Sidebar List
    const thumbsContainer = document.getElementById("thumbs");
    this.spriteList = new SpriteList(thumbsContainer, this.state);

    // Inspector
    const inspectorContainer = document.getElementById("inspector");
    this.inspector = new Inspector(inspectorContainer, this.state);

    // Settings
    const settingsContainer = document.getElementById("panel-settings");
    this.settingsPanel = new SettingsPanel(settingsContainer, this.state);

    // Toolbar (now handles file inputs and zoom buttons)
    // Note: Toolbar.js needs to be updated or we just reuse it but some IDs changed or are gone (exportBtn is in settings now)
    // Let's check Toolbar.js content. It expects exportBtn and deleteBtn.
    // In new HTML, export is in settings, delete is in inspector (and maybe toolbar-mini?).
    // Actually, I removed the main 'export' button from the top toolbar in HTML.
    // I should probably refactor Toolbar.js to be "FileLoader.js" or similar, or just adapt it.
    // For now, let's adapt the elements passed to it.

    const toolbarElements = {
      maskInput: document.getElementById("maskFile"),
      jsonInput: document.getElementById("jsonFile"),
      atlasInput: document.getElementById("atlasFile"),
      // exportBtn: document.getElementById('export'), // Moved to SettingsPanel
      // deleteBtn: document.getElementById('del'), // Moved to Inspector
      zoomInBtn: document.getElementById("zoomIn"),
      zoomOutBtn: document.getElementById("zoomOut"),
    };

    // We need to patch Toolbar.js because it expects exportBtn and deleteBtn to exist.
    // Or I can just create a dummy element or update Toolbar.js.
    // Updating Toolbar.js is cleaner.
    this.toolbar = new Toolbar(toolbarElements, this.state);

    // Search
    const searchInput = document.getElementById("search-sprites");
    searchInput.addEventListener("input", (e) => {
      this.spriteList.setFilter(e.target.value);
    });

    // Tabs
    this.setupTabs();

    // Drag and Drop Support
    this.setupDragDrop();
  }

  setupTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Deactivate all
        tabs.forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));

        // Activate clicked
        tab.classList.add("active");
        const target = tab.dataset.tab;
        document.getElementById(`panel-${target}`).classList.add("active");
      });
    });
  }

  setupDragDrop() {
    const dropZone = document.body;

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "0.8";
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "1";
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.opacity = "1";

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        // Simple heuristic: if it's an image, try to load as atlas if none exists, or mask if atlas exists
        // If it's json, load as mapping
        this.handleDroppedFiles(files);
      }
    });
  }

  handleDroppedFiles(files) {
    // This is a basic implementation.
    // Ideally we might want to check file names or ask the user.
    // For now, let's assume:
    // 1. If JSON -> Load Mapping
    // 2. If Image -> If no atlas, load atlas. If atlas exists, load mask.

    Array.from(files).forEach((file) => {
      if (file.type.includes("json")) {
        // Trigger the handler in toolbar (we can expose it or just simulate event)
        // Better: call logic directly. But for now let's use the toolbar instance method if we refactor Toolbar to expose it.
        // Or just trigger the input change.
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById("jsonFile").files = dt.files;
        document.getElementById("jsonFile").dispatchEvent(new Event("change"));
      } else if (file.type.includes("image")) {
        if (!this.state.atlasImage) {
          const dt = new DataTransfer();
          dt.items.add(file);
          document.getElementById("atlasFile").files = dt.files;
          document
            .getElementById("atlasFile")
            .dispatchEvent(new Event("change"));
        } else {
          const dt = new DataTransfer();
          dt.items.add(file);
          document.getElementById("maskFile").files = dt.files;
          document
            .getElementById("maskFile")
            .dispatchEvent(new Event("change"));
        }
      }
    });
  }
}

// Start the app
window.addEventListener("DOMContentLoaded", () => {
  new App();
});
