<template>
  <div class="file-tree" role="tree">
    <template v-for="node in props.nodes" :key="node.path">
      <button
        class="file-tree-row"
        :class="{ 'is-active': !node.isDir && isActive(node.path), 'is-folder': node.isDir }"
        :style="{ '--tree-depth': props.depth }"
        type="button"
        role="treeitem"
        :aria-expanded="node.isDir ? props.expandedPaths.has(node.path) : undefined"
        :title="node.path"
        @click="node.isDir ? emit('toggle', node.path) : emit('open', node.path)"
      >
        <svg
          v-if="node.isDir"
          class="tree-chevron"
          :class="{ expanded: props.expandedPaths.has(node.path) }"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="m6 3.5 4.5 4.5L6 12.5" />
        </svg>
        <span v-else class="tree-chevron-spacer"></span>

        <svg v-if="node.isDir" class="tree-icon folder-icon" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2.5 5.2c0-1 .8-1.7 1.7-1.7h4l1.6 1.8h6c1 0 1.7.8 1.7 1.7v7.2c0 1-.8 1.8-1.7 1.8H4.2c-1 0-1.7-.8-1.7-1.8v-9Z" />
        </svg>
        <svg v-else class="tree-icon file-icon" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 2.5h6l4 4v11H5v-15Z" />
          <path d="M11 2.5v4h4" />
        </svg>

        <span class="tree-label">{{ node.name }}</span>
      </button>

      <FileTree
        v-if="node.isDir && props.expandedPaths.has(node.path) && node.children?.length"
        :nodes="node.children"
        :expanded-paths="props.expandedPaths"
        :active-path="props.activePath"
        :active-path-key="resolvedActivePathKey"
        :depth="props.depth + 1"
        @toggle="emit('toggle', $event)"
        @open="emit('open', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";

defineOptions({ name: "FileTree" });

const props = defineProps({
  nodes: {
    type: Array,
    default: () => [],
  },
  expandedPaths: {
    type: Object,
    required: true,
  },
  activePath: {
    type: String,
    default: "",
  },
  activePathKey: {
    type: String,
    default: "",
  },
  depth: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(["toggle", "open"]);
const resolvedActivePathKey = computed(() => props.activePathKey || normalizePath(props.activePath));

function normalizePath(path) {
  return String(path || "").replaceAll("/", "\\").toLowerCase();
}

function isActive(path) {
  return normalizePath(path) === resolvedActivePathKey.value;
}
</script>



<style scoped>
.file-tree {
  min-width: 0;
  contain: paint;
}

.file-tree-row {
  width: 100%;
  height: 29px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px 0 calc(7px + var(--tree-depth) * 15px);
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: 29px;
}

.file-tree-row:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}

.file-tree-row.is-active {
  border-left-color: var(--accent-color);
  background: var(--bg-toc-active);
  color: var(--accent-color);
  font-weight: 600;
}

.tree-chevron,
.tree-chevron-spacer {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
}

.tree-chevron {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  transition: transform 0.14s ease;
}

.tree-chevron.expanded {
  transform: rotate(90deg);
}

.tree-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}

.folder-icon {
  fill: color-mix(in srgb, var(--accent-color) 18%, var(--bg-primary));
  stroke: color-mix(in srgb, var(--accent-color) 76%, var(--text-secondary));
  stroke-width: 1.2;
}

.file-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25;
}

.tree-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
