import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const AUTO_HIGHLIGHT_LANGUAGE_SUBSET = [
  "javascript",
  "typescript",
  "json",
  "bash",
  "python",
  "css",
  "sql",
  "yaml",
  "xml",
  "markdown",
  "go",
  "java",
  "rust",
];

const LANGUAGE_ALIASES = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  cs: "csharp",
  "c#": "csharp",
  htm: "xml",
  html: "xml",
  kt: "kotlin",
};

const AUTO_HIGHLIGHT_MAX_CHARS = 8000;
const AUTO_HIGHLIGHT_MAX_LINES = 240;
const EXPLICIT_HIGHLIGHT_MAX_CHARS = 48000;
const EXPLICIT_HIGHLIGHT_MAX_LINES = 1200;
const LARGE_DOCUMENT_THRESHOLD = 80000;
const HUGE_DOCUMENT_THRESHOLD = 180000;
const DEFAULT_HIGHLIGHT_BUDGET = {
  totalHighlightChars: 120000,
  totalAutoHighlightChars: 24000,
  maxHighlightedBlocks: 28,
};
const LARGE_DOCUMENT_HIGHLIGHT_BUDGET = {
  totalHighlightChars: 72000,
  totalAutoHighlightChars: 12000,
  maxHighlightedBlocks: 16,
};
const HUGE_DOCUMENT_HIGHLIGHT_BUDGET = {
  totalHighlightChars: 36000,
  totalAutoHighlightChars: 6000,
  maxHighlightedBlocks: 8,
};

[
  ["bash", bash],
  ["c", c],
  ["cpp", cpp],
  ["csharp", csharp],
  ["css", css],
  ["go", go],
  ["java", java],
  ["javascript", javascript],
  ["json", json],
  ["kotlin", kotlin],
  ["markdown", markdown],
  ["php", php],
  ["plaintext", plaintext],
  ["python", python],
  ["ruby", ruby],
  ["rust", rust],
  ["sql", sql],
  ["swift", swift],
  ["typescript", typescript],
  ["xml", xml],
  ["yaml", yaml],
].forEach(([name, grammar]) => {
  hljs.registerLanguage(name, grammar);
});

export function escapeCodeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countLines(value) {
  if (!value) {
    return 0;
  }

  let lines = 1;
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) {
      lines += 1;
    }
  }
  return lines;
}

function exceedsHighlightBudget(source, maxChars, maxLines) {
  return source.length > maxChars || countLines(source) > maxLines;
}

function normalizeLanguage(lang) {
  const normalized = String(lang || "").trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function getDocumentHighlightBudget(documentLength) {
  const length = Number(documentLength) || 0;
  if (length >= HUGE_DOCUMENT_THRESHOLD) {
    return HUGE_DOCUMENT_HIGHLIGHT_BUDGET;
  }
  if (length >= LARGE_DOCUMENT_THRESHOLD) {
    return LARGE_DOCUMENT_HIGHLIGHT_BUDGET;
  }
  return DEFAULT_HIGHLIGHT_BUDGET;
}

function canConsumeHighlightBudget(state, sourceLength, isAutoHighlight) {
  if (!state) {
    return true;
  }

  if (state.highlightedBlocks >= state.maxHighlightedBlocks) {
    return false;
  }
  if (state.highlightedChars + sourceLength > state.totalHighlightChars) {
    return false;
  }
  if (isAutoHighlight && state.autoHighlightedChars + sourceLength > state.totalAutoHighlightChars) {
    return false;
  }
  return true;
}

function consumeHighlightBudget(state, sourceLength, isAutoHighlight) {
  if (!state) {
    return;
  }

  state.highlightedBlocks += 1;
  state.highlightedChars += sourceLength;
  if (isAutoHighlight) {
    state.autoHighlightedChars += sourceLength;
  }
}

function renderHighlightedCodeBlockInternal(text, lang = "", budgetState = null) {
  const source = String(text ?? "");
  const requestedLanguage = normalizeLanguage(lang);
  const supportedLanguage = requestedLanguage && hljs.getLanguage(requestedLanguage)
    ? requestedLanguage
    : "";

  let highlighted = escapeCodeHtml(source);
  let cssLanguage = requestedLanguage || "plain";

  if (supportedLanguage) {
    cssLanguage = supportedLanguage;
    if (
      !exceedsHighlightBudget(source, EXPLICIT_HIGHLIGHT_MAX_CHARS, EXPLICIT_HIGHLIGHT_MAX_LINES) &&
      canConsumeHighlightBudget(budgetState, source.length, false)
    ) {
      try {
        highlighted = hljs.highlight(source, { language: supportedLanguage }).value;
        consumeHighlightBudget(budgetState, source.length, false);
      } catch (_) {
        highlighted = escapeCodeHtml(source);
      }
    }
  } else if (
    source &&
    !exceedsHighlightBudget(source, AUTO_HIGHLIGHT_MAX_CHARS, AUTO_HIGHLIGHT_MAX_LINES) &&
    canConsumeHighlightBudget(budgetState, source.length, true)
  ) {
    try {
      const autoResult = hljs.highlightAuto(source, AUTO_HIGHLIGHT_LANGUAGE_SUBSET);
      highlighted = autoResult.value;
      cssLanguage = autoResult.language || "auto";
      consumeHighlightBudget(budgetState, source.length, true);
    } catch (_) {
      highlighted = escapeCodeHtml(source);
      cssLanguage = requestedLanguage || "plain";
    }
  }

  return `<pre class="code-block"><code class="hljs language-${cssLanguage}">${highlighted}</code></pre>`;
}

export function createCodeBlockRenderer({ documentLength = 0 } = {}) {
  const limits = getDocumentHighlightBudget(documentLength);
  const budgetState = {
    highlightedChars: 0,
    autoHighlightedChars: 0,
    highlightedBlocks: 0,
    totalHighlightChars: limits.totalHighlightChars,
    totalAutoHighlightChars: limits.totalAutoHighlightChars,
    maxHighlightedBlocks: limits.maxHighlightedBlocks,
  };

  return (text, lang = "") => renderHighlightedCodeBlockInternal(text, lang, budgetState);
}

export function renderHighlightedCodeBlock(text, lang = "") {
  return renderHighlightedCodeBlockInternal(text, lang);
}
