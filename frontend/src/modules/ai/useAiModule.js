import { useAiActions } from "@/modules/ai/useAiActions";
import { useAiModels } from "@/modules/ai/useAiModels";
import { useAiState } from "@/modules/ai/useAiState";
import { useSmartFormatContent } from "@/modules/ai/useSmartFormatContent";

export function useAiModule({
  appSettings,
  loading,
  content,
  design,
  theme,
  bridge,
  helpers,
  state: stateOptions = {},
  smartFormatContent: smartFormatContentOptions = {},
}) {
  const state = useAiState(stateOptions);
  const models = useAiModels(appSettings);
  const contentHelpers = useSmartFormatContent(smartFormatContentOptions);
  const actions = useAiActions({
    state,
    appSettings,
    loading,
    models,
    content,
    design,
    theme,
    bridge,
    helpers: {
      ...helpers,
      applySmartFormattedContent: contentHelpers.applySmartFormattedContent,
      stripOuterMarkdownFence: contentHelpers.stripOuterMarkdownFence,
    },
  });

  return {
    ...state,
    ...models,
    ...contentHelpers,
    ...actions,
  };
}
