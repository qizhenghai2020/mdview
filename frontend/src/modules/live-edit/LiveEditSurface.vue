<template>
  <div class="live-edit-surface">
    <div v-if="loadError" class="live-edit-error">
      {{ loadError }}
    </div>
    <div
      v-else
      ref="hostRef"
      class="live-edit-host"
      @focusout.capture="handleHostFocusOut"
    ></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadLiveEditorBridgeModule } from "./liveEditorLoader";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: "",
  },
  resolveImagePath: {
    type: Function,
    default: null,
  },
  readImageAsBase64: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue", "ready"]);

const hostRef = ref(null);
const loadError = ref("");

let bridge = null;
let editorInstance = null;
let lastBridgeValue = props.modelValue ?? "";
let lastBridgeProps = null;

function areBridgePropsEqual(previousProps, nextProps) {
  if (!previousProps || !nextProps) {
    return false;
  }

  return (
    previousProps.value === nextProps.value &&
    previousProps.placeholder === nextProps.placeholder &&
    previousProps.resolveImagePath === nextProps.resolveImagePath &&
    previousProps.readImageAsBase64 === nextProps.readImageAsBase64 &&
    previousProps.onChange === nextProps.onChange &&
    previousProps.onReady === nextProps.onReady
  );
}

function flushValue() {
  const latestValue =
    editorInstance?.editorStore?.toMarkdown?.() ?? props.modelValue ?? "";
  if (latestValue !== (props.modelValue ?? "")) {
    lastBridgeValue = latestValue;
    emit("update:modelValue", latestValue);
  }
  return latestValue;
}

function handleBridgeReady(editor) {
  editorInstance = editor ?? null;
  emit("ready");
}

function handleBridgeChange(value) {
  const nextValue = value ?? "";
  lastBridgeValue = nextValue;
  emit("update:modelValue", nextValue);
}

function handleHostFocusOut(event) {
  const nextTarget = event.relatedTarget;
  if (hostRef.value?.contains?.(nextTarget)) {
    return;
  }
  flushValue();
}

defineExpose({
  flushValue,
  getValue: flushValue,
});

function createBridgeProps() {
  return {
    value: props.modelValue ?? "",
    placeholder: props.placeholder,
    resolveImagePath: props.resolveImagePath,
    readImageAsBase64: props.readImageAsBase64,
    onChange: handleBridgeChange,
    onReady: handleBridgeReady,
  };
}

function syncBridge() {
  if (!bridge) {
    return;
  }

  const nextProps = createBridgeProps();
  if (areBridgePropsEqual(lastBridgeProps, nextProps)) {
    return;
  }
  lastBridgeProps = nextProps;
  bridge.update(nextProps);
}

onMounted(async () => {
  if (!hostRef.value) {
    return;
  }

  try {
    const { mountLiveEditor } = await loadLiveEditorBridgeModule();
    lastBridgeProps = createBridgeProps();
    bridge = mountLiveEditor(hostRef.value, lastBridgeProps);
  } catch (error) {
    console.error("加载实时编辑模块失败:", error);
    loadError.value = "实时编辑模块加载失败，请稍后重试。";
  }
});

watch(
  () => props.modelValue,
  (value) => {
    const nextValue = value ?? "";
    if (nextValue === lastBridgeValue) {
      return;
    }
    lastBridgeValue = nextValue;
    syncBridge();
  }
);

watch(
  () => props.placeholder,
  () => {
    syncBridge();
  }
);

watch(
  () => props.resolveImagePath,
  () => {
    syncBridge();
  }
);

watch(
  () => props.readImageAsBase64,
  () => {
    syncBridge();
  }
);

onBeforeUnmount(() => {
  flushValue();
  editorInstance = null;
  lastBridgeProps = null;
  bridge?.unmount();
  bridge = null;
});
</script>

<style scoped>
.live-edit-surface {
  min-height: 100%;
}

.live-edit-host {
  min-height: 100%;
}

.live-edit-error {
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-toolbar);
  color: #b91c1c;
  box-shadow: var(--shadow-sm);
}
</style>
