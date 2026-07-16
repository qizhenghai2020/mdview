import { ref, watch } from "vue";
import { DEFAULT_APP_SETTINGS } from "./constants";
import { loadAppSettings, mergeAppSettings, saveAppSettings } from "./storage";

export function useAppSettings() {
  const settings = ref(loadAppSettings());

  watch(
    settings,
    (value) => {
      saveAppSettings(value);
    },
    { deep: true }
  );

  function updateSettings(patch) {
    settings.value = mergeAppSettings({
      ...settings.value,
      ...patch,
    });
  }

  function resetPreference(key) {
    if (!(key in DEFAULT_APP_SETTINGS)) {
      return;
    }

    settings.value[key] = DEFAULT_APP_SETTINGS[key];
  }

  return {
    settings,
    updateSettings,
    resetPreference,
  };
}
