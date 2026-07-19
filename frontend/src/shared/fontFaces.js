const EXTERNAL_FONT_STYLE_ELEMENT_ID = "md-viewer-external-font-faces";

function ensureStyleElement(styleId) {
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  return style;
}

function escapeCssString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function registerExternalFontFaces(fonts) {
  if (typeof document === "undefined") {
    return;
  }

  const style = ensureStyleElement(EXTERNAL_FONT_STYLE_ELEMENT_ID);
  const rules = (Array.isArray(fonts) ? fonts : [])
    .map((font) => {
      const family = String(font?.family || "").trim();
      const dataUrl = String(font?.dataUrl || "").trim();
      const source = String(font?.source || "woff2").trim();
      if (!family || !dataUrl) {
        return "";
      }

      return `
        @font-face {
          font-family: "${escapeCssString(family)}";
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url("${escapeCssString(dataUrl)}") format("${escapeCssString(source)}");
        }
      `;
    })
    .filter(Boolean)
    .join("\n");

  style.textContent = rules;
}
