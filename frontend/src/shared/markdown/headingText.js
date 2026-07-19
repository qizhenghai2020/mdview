export function stripHtmlTags(text, replacement = "") {
  return String(text || "")
    .replace(/<[^>]*>/g, replacement)
    .trim();
}

export function normalizeHeadingText(text) {
  return stripHtmlTags(text, " ")
    .replace(/\u200b/g, "")
    .replace(/^[#]+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
