import Prism from "prismjs";

if (typeof window !== "undefined") {
  Prism.manual = true;
}

import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-mermaid";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";

const LANGUAGE_ALIAS = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  py: "python",
  rs: "rust",
  md: "markdown",
  yml: "yaml",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  kt: "kotlin",
};

function normalizeLanguage(lang) {
  const normalized = String(lang || "").toLowerCase();
  return LANGUAGE_ALIAS[normalized] ?? normalized;
}

export function tokenize(code, lang) {
  const source = String(code ?? "");

  if (!source) {
    return [];
  }

  if (!lang) {
    return [source];
  }

  const normalized = normalizeLanguage(lang);
  const grammar = Prism.languages[normalized];

  if (!grammar) {
    return [source];
  }

  try {
    return Prism.tokenize(source, grammar);
  } catch (error) {
    console.warn("Prism tokenize failed:", normalized, error);
    return [source];
  }
}

export default Prism;
