# Atlas Mapper

A browser-based sprite atlas editor. Load an atlas image, import frame JSON or a color mask, organize sprites into groups, and export frame data or a project ZIP. The app uses plain JavaScript and has no runtime dependencies.

## Run locally

Serve the repository with a local HTTP server, then open `http://localhost:8000`:

```sh
python -m http.server 8000
```

Opening `index.html` directly as a file may block JavaScript modules in the browser. Node.js is only needed for the tests:

```sh
npm test
```

## Basic workflow

1. Load an atlas image using **Atlas**, or drag an image onto the canvas.
2. Import frame data with **JSON**, import a mask with **Mask**, or use **Import** to process an atlas, multiple JSON files, and masks in order.
3. Edit sprite names, groups, and bounds in the sidebar. Use **Settings** to choose the JSON export format and other display options.
4. Use **Export Project** for a ZIP containing `atlas.png`, `atlas.json`, workspace metadata, and an optional original or generated `mask.png`. You can also export JSON or a mask separately.

The JSON importer accepts the Generic, Phaser 3, and Simple List formats exported by the app, plus workspace metadata. Workspace metadata can be saved with **Save Workspace** and loaded with **Load Workspace**. Workspace JSON stores sprite data and atlas dimensions, but it does not embed the atlas or mask image. Load the image again after opening workspace JSON; the project ZIP contains the atlas image separately. Workspaces are kept in memory during the session and are not automatically restored after a page reload.

## Project layout

- `index.html` and `css/main.css`: page and styles.
- `js/core/`: sprite state, rectangle detection, mask generation, and JSON exporters.
- `js/ui/`: canvas, sidebar, toolbar, and import wizard.
- `js/utils/`: file and ZIP utilities.
- `test/`: Node.js tests for the core logic.
