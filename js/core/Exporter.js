export const Exporters = {
  generic: {
    name: "Generic (JSON Hash)",
    ext: "json",
    export: (rects, config) => {
      const frames = {};
      rects.forEach((r, i) => {
        const name = r.name || `sprite_${i}`;
        frames[name] = {
          frame: { x: r.x, y: r.y, w: r.w, h: r.h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
          sourceSize: { w: r.w, h: r.h },
          pivot: config.pivot || { x: 0.5, y: 0.5 },
        };
        if (r.group) frames[name].group = r.group;
      });
      return { frames, meta: { app: "AtlasMapper", version: "5.0" } };
    },
  },
  phaser: {
    name: "Phaser 3 (Array)",
    ext: "json",
    export: (rects, config) => {
      const frames = rects.map((r, i) => ({
        filename: r.name || `sprite_${i}`,
        frame: { x: r.x, y: r.y, w: r.w, h: r.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
        sourceSize: { w: r.w, h: r.h },
        pivot: config.pivot || { x: 0.5, y: 0.5 },
      }));
      return {
        textures: [
          {
            image: "atlas.png",
            format: "RGBA8888",
            size: { w: 0, h: 0 },
            scale: 1,
            frames,
          },
        ],
        meta: { app: "AtlasMapper", version: "5.0" },
      };
    },
  },
  simple: {
    name: "Simple List (Array)",
    ext: "json",
    export: (rects, config) => {
      return rects.map((r, i) => ({
        name: r.name || `sprite_${i}`,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        group: r.group || "",
      }));
    },
  },
};
