let mermaidModulePromise = null;
let lastMermaidTheme = "";

function normalizeMermaidTheme(theme) {
  return String(theme || "").toLowerCase() === "dark" ? "dark" : "default";
}

export async function loadMermaid(theme = "default") {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid");
  }

  const module = await mermaidModulePromise;
  const mermaid = module.default || module;
  const normalizedTheme = normalizeMermaidTheme(theme);

  if (lastMermaidTheme !== normalizedTheme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: normalizedTheme,
      securityLevel: "loose",
      flowchart: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
    });
    lastMermaidTheme = normalizedTheme;
  }

  return mermaid;
}

export function resolveMermaidThemeFromDocument() {
  if (typeof document === "undefined") {
    return "default";
  }

  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}
