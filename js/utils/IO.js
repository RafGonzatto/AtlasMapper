export const IO = {
  loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject("No file provided");
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        // URL.revokeObjectURL(url); // Keep it alive for canvas drawing
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  },

  readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  downloadJSON(data, filename = "atlas.json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
