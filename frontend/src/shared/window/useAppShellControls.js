import { useAppKeyboardShortcuts } from "@/shared/window/useAppKeyboardShortcuts";
import { useWindowShell } from "@/shared/window/useWindowShell";

export function useAppShellControls({ keyboard, window }) {
  const keyboardControls = useAppKeyboardShortcuts(keyboard);
  const windowControls = useWindowShell(window);

  return {
    ...windowControls,
    ...keyboardControls,
  };
}
