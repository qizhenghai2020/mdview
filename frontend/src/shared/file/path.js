export function getFileExtension(path) {
  const file =
    String(path || "")
      .split(/[\\/]/)
      .pop() || "";
  const dotIndex = file.lastIndexOf(".");
  return dotIndex > 0 ? file.slice(dotIndex).toLowerCase() : "";
}
