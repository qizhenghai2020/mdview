<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

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

function createBridgeProps() {
  return {
    value: props.modelValue ?? "",
    placeholder: props.placeholder,
    resolveImagePath: props.resolveImagePath,
    readImageAsBase64: props.readImageAsBase64,
    onChange: (value) => emit("update:modelValue", value),
    onReady: () => emit("ready"),
  };
}

function syncBridge() {
  if (!bridge) {
    return;
  }

  bridge.update(createBridgeProps());
}

onMounted(async () => {
  if (!hostRef.value) {
    return;
  }

  try {
    const { mountLiveEditor } = await import("./reactBridge.jsx");
    bridge = mountLiveEditor(hostRef.value, createBridgeProps());
  } catch (error) {
    console.error("加载实时编辑模块失败:", error);
    loadError.value = "实时编辑模块加载失败，请稍后重试。";
  }
});

watch(
  () => props.modelValue,
  () => {
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
  bridge?.unmount();
  bridge = null;
});
</script>

<template>
  <div class="live-edit-surface">
    <div v-if="loadError" class="live-edit-error">
      {{ loadError }}
    </div>
    <div v-else ref="hostRef" class="live-edit-host"></div>
  </div>
</template>

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
