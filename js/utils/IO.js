export const IO = {
  loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject("No file provided");
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };
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

  parseJSON(text, label = "(input)", options = {}) {
    const previewChars = Number.isFinite(options.previewChars)
      ? options.previewChars
      : 240;
    const contextChars = Number.isFinite(options.contextChars)
      ? options.contextChars
      : 120;
    const includeTextIfSmall = options.includeTextIfSmall ?? false;
    const maxTextCharsToLog = Number.isFinite(options.maxTextCharsToLog)
      ? options.maxTextCharsToLog
      : 20000;

    const safeToString = (value) => {
      try {
        return String(value);
      } catch {
        return "[unstringifiable]";
      }
    };

    const getAllProps = (obj) => {
      if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
        return null;
      }
      const out = {};
      for (const key of Object.getOwnPropertyNames(obj)) {
        try {
          out[key] = obj[key];
        } catch (e) {
          out[key] = `[threw on access: ${safeToString(e)}]`;
        }
      }
      for (const sym of Object.getOwnPropertySymbols(obj)) {
        const symKey = sym?.description
          ? `Symbol(${sym.description})`
          : sym.toString();
        try {
          out[symKey] = obj[sym];
        } catch (e) {
          out[symKey] = `[threw on access: ${safeToString(e)}]`;
        }
      }
      return out;
    };

    const extractPosition = (message) => {
      if (!message) return null;
      // Chrome/Edge: "Unexpected token ... in JSON at position N"
      const m1 = /\bposition\s+(\d+)\b/i.exec(message);
      if (m1) return { index: Number(m1[1]) };

      // Firefox sometimes: "at line X column Y of the JSON data"
      const m2 = /\bline\s+(\d+)\s+column\s+(\d+)\b/i.exec(message);
      if (m2) return { line: Number(m2[1]), column: Number(m2[2]) };

      return null;
    };

    const indexToLineCol = (s, index) => {
      if (typeof s !== "string" || !Number.isFinite(index)) return null;
      const idx = Math.max(0, Math.min(s.length, index | 0));
      let line = 1;
      let col = 1;
      for (let i = 0; i < idx; i++) {
        if (s.charCodeAt(i) === 10 /* \n */) {
          line++;
          col = 1;
        } else {
          col++;
        }
      }
      return { line, column: col };
    };

    const sliceWithMarker = (s, index, radius) => {
      if (typeof s !== "string" || !Number.isFinite(index)) return null;
      const r = Math.max(0, radius | 0);
      const idx = Math.max(0, Math.min(s.length, index | 0));
      const start = Math.max(0, idx - r);
      const end = Math.min(s.length, idx + r);
      const snippet = s.slice(start, end);
      const caretPos = idx - start;
      const caret = " ".repeat(Math.max(0, caretPos)) + "^";
      return { start, end, snippet, caret };
    };

    const logErrorDeep = (err) => {
      const seen = new Set();
      const chain = [];
      let cur = err;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        chain.push({
          name: cur?.name,
          message: cur?.message,
          stack: cur?.stack,
          toString: safeToString(cur),
          props: getAllProps(cur),
        });
        cur = cur?.cause;
      }
      return chain;
    };

    try {
      return JSON.parse(text);
    } catch (err) {
      const name = err?.name || "Error";
      const message = err?.message || safeToString(err);
      const stack = err?.stack;

      console.log(`[AtlasMaper] ${name} while parsing JSON (${label})`);
      console.log(`[AtlasMaper] Error message: ${message}`);
      console.log(`[AtlasMaper] Error (toString): ${safeToString(err)}`);
      console.log(`[AtlasMaper] Error type:`, {
        isSyntaxError: err instanceof SyntaxError,
        typeof: typeof err,
        constructorName: err?.constructor?.name,
      });
      if (stack) console.log("[AtlasMaper] Stack:\n" + stack);

      // Dump every own property (including non-enumerable + symbols)
      console.log("[AtlasMaper] Error own properties:", getAllProps(err));
      // Dump cause chain if present
      if (err?.cause)
        console.log("[AtlasMaper] Error cause chain:", logErrorDeep(err));

      if (typeof text === "string") {
        const len = text.length;
        const hasBOM = len > 0 && text.charCodeAt(0) === 0xfeff;
        const firstNonWsIdx = text.search(/\S/);
        const firstNonWs = firstNonWsIdx >= 0 ? text[firstNonWsIdx] : "";
        const firstNonWsCode = firstNonWs
          ? `U+${firstNonWs.codePointAt(0).toString(16).toUpperCase()}`
          : null;

        console.log("[AtlasMaper] JSON input info:", {
          label,
          length: len,
          hasBOM,
          firstNonWhitespaceIndex: firstNonWsIdx,
          firstNonWhitespaceChar: firstNonWs || null,
          firstNonWhitespaceCodepoint: firstNonWsCode,
        });

        const startPreview = text.slice(0, Math.max(0, previewChars | 0));
        const endPreview = text.slice(
          Math.max(0, len - Math.max(0, previewChars | 0)),
          len,
        );
        console.log(
          `[AtlasMaper] JSON preview (start, ${Math.max(0, previewChars | 0)} chars):`,
          startPreview,
        );
        console.log(
          `[AtlasMaper] JSON preview (end, ${Math.max(0, previewChars | 0)} chars):`,
          endPreview,
        );

        const pos = extractPosition(message);
        if (pos) {
          let index = pos.index;
          let line = pos.line;
          let column = pos.column;

          if (
            !Number.isFinite(index) &&
            Number.isFinite(line) &&
            Number.isFinite(column)
          ) {
            // Best-effort: convert line/col to index
            let curLine = 1;
            let curCol = 1;
            for (let i = 0; i < len; i++) {
              if (curLine === line && curCol === column) {
                index = i;
                break;
              }
              if (text.charCodeAt(i) === 10) {
                curLine++;
                curCol = 1;
              } else {
                curCol++;
              }
            }
          }

          if (Number.isFinite(index)) {
            const lc = indexToLineCol(text, index);
            if (lc) ({ line, column } = lc);
            console.log("[AtlasMaper] Parsed error position:", {
              index,
              line,
              column,
            });
            const ctx = sliceWithMarker(
              text,
              index,
              Math.max(0, contextChars | 0),
            );
            if (ctx) {
              console.log(
                `[AtlasMaper] JSON context [${ctx.start}..${ctx.end}] (index ${index}):`,
                ctx.snippet,
              );
              console.log("[AtlasMaper] Context marker:\n" + ctx.caret);
            }
          } else {
            console.log(
              "[AtlasMaper] Parsed error position (line/column):",
              pos,
            );
          }
        }

        if (includeTextIfSmall && len <= Math.max(0, maxTextCharsToLog | 0)) {
          console.log("[AtlasMaper] Full JSON text (small input):", text);
        } else if (includeTextIfSmall) {
          console.log("[AtlasMaper] Full JSON text not logged (too large):", {
            length: len,
            maxTextCharsToLog,
          });
        }
      } else {
        console.log("[AtlasMaper] JSON input was not a string:", {
          typeof: typeof text,
          value: text,
        });
      }

      // Include some runtime context that helps reproduction
      try {
        console.log("[AtlasMaper] Runtime context:", {
          time: new Date().toISOString(),
          userAgent: navigator?.userAgent,
          platform: navigator?.platform,
          language: navigator?.language,
        });
      } catch {
        // ignore
      }

      throw err;
    }
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

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  canvasBlob(canvas) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed.")), "image/png"),
    );
  },
};
