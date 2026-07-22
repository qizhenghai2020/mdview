import { WriteBase64File } from "../../../wailsjs/go/backend/App";

function normalizeFileStem(value) {
  const normalized = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return normalized || "image";
}

function getFileExtension(fileName = "") {
  const matched = String(fileName).match(/(\.[^.]+)$/);
  return matched?.[1] || ".png";
}

function getFileStem(fileName = "") {
  return String(fileName).replace(/\.[^.]+$/, "");
}

function getParentDirectory(documentPath = "") {
  const normalizedPath = String(documentPath || "");
  const slashIndex = Math.max(normalizedPath.lastIndexOf("/"), normalizedPath.lastIndexOf("\\"));
  if (slashIndex < 0) {
    return "";
  }
  return normalizedPath.slice(0, slashIndex);
}

function joinPath(directory, fileName, referencePath = "") {
  const separator = String(referencePath || "").includes("\\") ? "\\" : "/";
  return `${directory}${separator}${fileName}`;
}

function createStoredImageFileName(originalFileName = "") {
  const extension = getFileExtension(originalFileName);
  const stem = normalizeFileStem(getFileStem(originalFileName));
  return `${stem}-${Date.now()}${extension}`;
}

export async function saveImageToDocumentDirectory({
  documentPath = "",
  originalFileName = "",
  dataUrl = "",
} = {}) {
  const trimmedDocumentPath = String(documentPath || "").trim();
  const trimmedDataUrl = String(dataUrl || "").trim();
  const fallbackFileName = originalFileName || createStoredImageFileName("image.png");

  if (!trimmedDataUrl) {
    return {
      fileName: fallbackFileName,
      source: "",
      saved: false,
    };
  }

  const parentDirectory = getParentDirectory(trimmedDocumentPath);
  if (!trimmedDocumentPath || !parentDirectory) {
    return {
      fileName: fallbackFileName,
      source: trimmedDataUrl,
      saved: false,
    };
  }

  const nextFileName = createStoredImageFileName(fallbackFileName);
  const absolutePath = joinPath(parentDirectory, nextFileName, trimmedDocumentPath);
  await WriteBase64File(absolutePath, trimmedDataUrl);

  return {
    fileName: nextFileName,
    source: nextFileName,
    saved: true,
    absolutePath,
  };
}
