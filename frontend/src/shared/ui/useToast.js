import { ref } from "vue";

const DEFAULT_TOAST_DURATION = 2000;

export function useToast({ duration = DEFAULT_TOAST_DURATION } = {}) {
  const toastMessage = ref("");
  const toastType = ref("success");
  let toastTimer = 0;

  function clearToastTimer() {
    if (!toastTimer) {
      return;
    }

    clearTimeout(toastTimer);
    toastTimer = 0;
  }

  function showToast(message, type = "success") {
    toastMessage.value = String(message || "");
    toastType.value = type;
    clearToastTimer();

    if (!toastMessage.value) {
      return;
    }

    toastTimer = window.setTimeout(() => {
      toastMessage.value = "";
      toastTimer = 0;
    }, duration);
  }

  function cleanupToast() {
    clearToastTimer();
  }

  return {
    toastMessage,
    toastType,
    showToast,
    cleanupToast,
  };
}
