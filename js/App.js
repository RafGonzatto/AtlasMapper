import { ProjectState } from "./core/ProjectState.js";
import { CanvasView } from "./ui/CanvasView.js";
import { SpriteList } from "./ui/SpriteList.js";
import { Toolbar } from "./ui/Toolbar.js";

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

    // Toolbar
    const toolbarElements = {
      maskInput: document.getElementById("maskFile"),
      jsonInput: document.getElementById("jsonFile"),
      atlasInput: document.getElementById("atlasFile"),
      exportBtn: document.getElementById("export"),
      deleteBtn: document.getElementById("del"),
      zoomInBtn: document.getElementById("zoomIn"),
      zoomOutBtn: document.getElementById("zoomOut"),
    };
    this.toolbar = new Toolbar(toolbarElements, this.state);

    // Drag and Drop Support
    this.setupDragDrop();
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
