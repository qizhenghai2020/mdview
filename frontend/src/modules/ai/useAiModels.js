import { computed } from "vue";
import { buildResolvedModelConfig } from "@/modules/settings/constants";

export function useAiModels(appSettings) {
  const aiProvidersById = computed(() => {
    return new Map(
      (Array.isArray(appSettings.value.providers) ? appSettings.value.providers : []).map(
        (provider) => [provider.id, provider]
      )
    );
  });

  function resolveConfiguredAIModel(model) {
    if (!model) {
      return null;
    }

    const provider = aiProvidersById.value.get(model.providerId) || null;
    const resolved = buildResolvedModelConfig(model, provider);
    return {
      ...model,
      ...resolved,
      providerName: provider?.name || "",
      providerId: String(model.providerId || provider?.id || ""),
    };
  }

  const enabledSmartFormatModels = computed(() => {
    return appSettings.value.models
      .filter((model) => model.enabled && model.verified && model.testStatus === "passed")
      .map((model) => resolveConfiguredAIModel(model))
      .filter(
        (model) =>
          model &&
          String(model.baseUrl || "").trim() &&
          String(model.model || "").trim()
      );
  });

  const activeSmartFormatModel = computed(() => {
    return (
      enabledSmartFormatModels.value.find(
        (model) => model.id === appSettings.value.activeModelId
      ) ||
      enabledSmartFormatModels.value[0] ||
      null
    );
  });

  return {
    aiProvidersById,
    resolveConfiguredAIModel,
    enabledSmartFormatModels,
    activeSmartFormatModel,
  };
}
