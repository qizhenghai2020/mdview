let liveEditSurfaceModulePromise = null;
let liveEditorBridgeModulePromise = null;

export function loadLiveEditSurfaceComponent() {
  if (!liveEditSurfaceModulePromise) {
    liveEditSurfaceModulePromise = import("./LiveEditSurface.vue");
  }
  return liveEditSurfaceModulePromise;
}

export function loadLiveEditorBridgeModule() {
  if (!liveEditorBridgeModulePromise) {
    liveEditorBridgeModulePromise = import("./reactBridge.jsx");
  }
  return liveEditorBridgeModulePromise;
}

export function preloadLiveEditorResources() {
  void loadLiveEditSurfaceComponent();
  void loadLiveEditorBridgeModule();
}
