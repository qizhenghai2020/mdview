export function getAIModelDisplayName(model, fallback = "未命名模型") {
  const displayName = String(model?.name || model?.model || "").trim();
  return displayName || fallback;
}

export function hasConfiguredAIModel(model) {
  return Boolean(String(model?.baseUrl || "").trim() && String(model?.model || "").trim());
}
