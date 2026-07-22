<template>
  <div
    class="app-container"
    :class="{
      dark: isDark,
      dragging: isDragging,
      'split-mode': viewMode === 'split',
      'live-mode': viewMode === 'live',
      'interaction-optimizing':
        isResizingSplit || isResizingToc || isEditorInteractionReliefActive,
      'theme-radius-flat': styleConfig.themeRoundedCorners === false,
      'design-modal-active': showDesignExportModal || isDesignExportWindow,
    }"
    :style="appContainerStyle"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <template v-if="startupContextReady">
      <!-- 拖拽遮罩 -->
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-hint">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="12" y2="12" />
            <line x1="15" y1="15" x2="12" y2="12" />
          </svg>
          <p>释放以打开文本文件或目录</p>
        </div>
      </div>

      <!-- Loading 遮罩 -->
      <div v-if="isLoading" class="loading-overlay">
        <div
          class="loading-content"
          :class="{
            'loading-content--detailed': isDetailedAiLoading,
            'loading-content--closable': canCloseAiLoading,
          }"
        >
          <div
            class="loading-status-line"
            :class="{ 'loading-status-line--closable': canCloseAiLoading }"
          >
            <div class="loading-status-main">
              <div class="loading-spinner-large"></div>
              <p class="loading-message">{{ loadingText }}</p>
            </div>
            <button
              v-if="canCloseAiLoading"
              class="loading-close-btn"
              type="button"
              @click="closeActiveAiLoading"
            >
              关闭
            </button>
          </div>
          <p
            v-if="isDetailedAiLoading && smartFormatProgressDetail"
            class="loading-submessage"
          >
            {{ smartFormatProgressDetail }}
          </p>
          <div
            v-if="isDetailedAiLoading && smartFormatProgressSteps.length"
            class="loading-progress-card"
          >
            <div class="loading-progress-title">当前进度</div>
            <div class="loading-progress-list">
              <div
                v-for="item in smartFormatProgressSteps"
                :key="item.id"
                class="loading-progress-item"
              >
                <span class="loading-progress-time">{{ item.time }}</span>
                <span class="loading-progress-text">{{ item.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Toast 提示 -->
      <transition name="toast">
        <div v-if="toastMessage" class="toast-container" :class="toastType">
          <svg
            v-if="toastType === 'success'"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <svg
            v-else
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{{ toastMessage }}</span>
        </div>
      </transition>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left" @dblclick.stop>
          <img
            class="app-logo toolbar-logo"
            :src="appLogoUrl"
            alt="MD 查看器"
            draggable="false"
            @dragstart.prevent
          />
          <button
            class="toolbar-btn"
            @click="showToc = !showToc"
            :class="{ active: showToc }"
            title="文件与文档大纲"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="18" y2="18" />
            </svg>
            <span>导航</span>
          </button>
          <button
            class="toolbar-btn"
            @click="openFile"
            title="打开一个或多个文本文件 (Ctrl+O)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              />
            </svg>
            <span>文件</span>
          </button>
          <button class="toolbar-btn" @click="openDirectory" title="打开文件夹">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l2 2.4h6.8A2.5 2.5 0 0 1 21 8.9v1.2"
              />
              <path
                d="M3.3 10h17.4a1.2 1.2 0 0 1 1.15 1.55l-1.72 5.7A2.5 2.5 0 0 1 17.73 19H5.9a2.5 2.5 0 0 1-2.42-1.9L2.15 11.5A1.2 1.2 0 0 1 3.3 10Z"
              />
              <path d="M9 14h6" />
            </svg>
            <span>文件夹</span>
          </button>
          <!-- 保存按钮 - 只要内容有改动就显示 -->
          <button
            v-if="hasChanges"
            class="toolbar-btn save-btn"
            @click="saveFile"
            :disabled="isSaving"
            title="保存 (Ctrl+S)"
          >
            <svg
              v-if="!isSaving"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span v-else class="loading-spinner-sm"></span>
            <span>保存</span>
          </button>
          <button
            v-if="hasChanges"
            class="toolbar-btn reset-edit-btn"
            type="button"
            :disabled="isSaving"
            title="放弃未保存修改并恢复到上次保存/加载的内容"
            @click="resetEditedContent"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 12a9 9 0 1 0 3-6.71" />
              <polyline points="3 3 3 9 9 9" />
            </svg>
            <span>重置</span>
          </button>
        </div>
        <div class="toolbar-center" @dblclick="toggleWindowMaximize">
          <div class="file-title-row">
            <span class="file-name" :title="filePath">{{ fileName }}</span>
            <span v-if="hasFileConflict" class="file-conflict-status">内容冲突</span>
            <button
              v-if="hasFileConflict"
              class="title-conflict-action"
              type="button"
              title="处理当前编辑与外部文件的版本冲突"
              aria-label="处理文件冲突"
              @click.stop="openFileConflictResolution"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
              </svg>
            </button>
          </div>
        </div>
        <div class="toolbar-right" @dblclick.stop>
          <!-- 缩放控制 -->
          <div class="zoom-controls">
            <button
              class="toolbar-btn zoom-btn"
              @click="zoomOut"
              :disabled="zoomLevel <= MIN_ZOOM"
              title="缩小"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <button class="toolbar-btn zoom-value" @click="resetZoom" title="还原">
              {{ zoomLevel }}%
            </button>
            <button
              class="toolbar-btn zoom-btn"
              @click="zoomIn"
              :disabled="zoomLevel >= MAX_ZOOM"
              title="放大"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
          </div>

          <!-- 视图模式切换 -->
          <div class="view-mode-tabs" role="tablist" aria-label="视图模式">
            <button
              v-for="tab in VIEW_MODE_TABS"
              :key="tab.mode"
              class="view-mode-tab"
              type="button"
              role="tab"
              :aria-selected="viewMode === tab.mode"
              :class="{ active: viewMode === tab.mode }"
              :title="tab.title"
              @mouseenter="handleViewModeTabIntent(tab.mode)"
              @focus="handleViewModeTabIntent(tab.mode)"
              @mousedown="handleViewModeTabIntent(tab.mode)"
              @click="switchViewMode(tab.mode)"
            >
              <span class="view-mode-icon" aria-hidden="true">
                <svg
                  v-if="tab.mode === 'preview'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg
                  v-else-if="tab.mode === 'live'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                <svg
                  v-else-if="tab.mode === 'split'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M12 4v16" />
                </svg>
              </span>
              <span class="view-mode-label">{{ tab.label }}</span>
            </button>
          </div>

          <button
            class="toolbar-btn design-btn"
            type="button"
            :disabled="isExporting || !hasDocumentContent"
            title="打开 HTML 设计器"
            @mouseenter="handleDesignButtonIntent"
            @focus="handleDesignButtonIntent"
            @mousedown="handleDesignButtonIntent"
            @click="openDesignExportHtml"
          >
            <span v-if="isExporting" class="loading-spinner-sm"></span>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>设计</span>
          </button>

          <button
            class="toolbar-btn smart-format-btn"
            type="button"
            :disabled="isSmartFormatting || !isMarkdownDocument"
            :title="
              isMarkdownDocument
                ? '使用当前模型智能整理 Markdown 排版'
                : '智能排版仅适用于 Markdown 文档'
            "
            @click="openSmartFormatPrompt"
          >
            <span v-if="isSmartFormatting" class="loading-spinner-sm"></span>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z" />
              <path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z" />
            </svg>
            <span>AI排版</span>
          </button>

          <!-- 主题按钮 -->
          <button
            class="toolbar-btn style-config-btn"
            @click="toggleStylePanel"
            :class="{ active: stylePanelState.visible }"
            title="样式配置"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>样式</span>
          </button>

          <button
            class="toolbar-btn theme-btn"
            @click="cycleTheme"
            :title="'主题: ' + themes.find((t) => t.id === currentTheme)?.name"
          >
            <svg
              v-if="currentTheme === 'dark'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <svg
              v-else-if="currentTheme === 'elegant'"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <span class="theme-name">{{
              themes.find((t) => t.id === currentTheme)?.name
            }}</span>
          </button>
          <button
            class="toolbar-btn settings-btn"
            type="button"
            title="设置"
            @click="openSettings('general')"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.37.6.6 1 .6h.6a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.4z"
              />
            </svg>
            <span>设置</span>
          </button>

          <div v-if="showNativeWindowControls" class="window-controls" aria-label="窗口控制">
            <button
              class="window-control"
              type="button"
              title="最小化"
              aria-label="最小化"
              @click="minimizeWindow"
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6.5h8" />
              </svg>
            </button>
            <button
              class="window-control"
              type="button"
              :title="isWindowMaximized ? '还原' : '最大化'"
              :aria-label="isWindowMaximized ? '还原' : '最大化'"
              @click="toggleWindowMaximize(null)"
            >
              <svg v-if="isWindowMaximized" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 4.5v-2h6v6h-2" />
                <rect x="2.5" y="4.5" width="5" height="5" />
              </svg>
              <svg v-else viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="2.5" width="7" height="7" />
              </svg>
            </button>
            <button
              class="window-control window-close"
              type="button"
              title="关闭"
              aria-label="关闭"
              @click="closeWindow"
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="m2.5 2.5 7 7m0-7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <!-- TOC 侧边栏 -->
        <div
          class="toc-sidebar"
          v-if="shouldShowSidebar"
          :style="{ width: tocWidth + 'px' }"
        >
          <div class="sidebar-tabs" role="tablist" aria-label="侧边栏内容">
            <button
              v-if="hasWorkspaceFiles"
              class="sidebar-tab"
              :class="{ active: sidebarSection === 'files' }"
              type="button"
              role="tab"
              :aria-selected="sidebarSection === 'files'"
              @click="sidebarSection = 'files'"
            >
              <span class="name">文件</span> <span>{{ workspaceFileCount }}</span>
            </button>
            <button
              v-if="tocItems.length"
              class="sidebar-tab"
              :class="{ active: sidebarSection === 'outline' }"
              type="button"
              role="tab"
              :aria-selected="sidebarSection === 'outline'"
              @click="sidebarSection = 'outline'"
            >
              <span class="name">大纲</span> <span>{{ tocItems.length }}</span>
            </button>
          </div>

          <div
            v-if="sidebarSection === 'files' && hasWorkspaceFiles"
            class="file-tree-panel"
          >
            <FileTree
              :nodes="workspaceRoots"
              :expanded-paths="expandedTreePaths"
              :active-path="filePath"
              :active-path-key="normalizedActiveWorkspacePath"
              @toggle="toggleTreePath"
              @open="openWorkspaceFile"
            />
          </div>

          <div v-else-if="tocItems.length" class="toc-list">
            <div
              v-for="item in tocItems"
              :key="item.id"
              class="toc-item"
              :class="{ active: activeTocId === item.id, [`toc-h${item.level}`]: true }"
              :style="item.indentStyle"
              @click="scrollToHeading(item)"
            >
              {{ item.text }}
            </div>
          </div>
          <!-- 拖动手柄 -->
          <div class="toc-resize-handle" @mousedown="startResizeToc"></div>
        </div>

        <!-- 分屏模式 -->
        <div class="document-stage" :class="{ 'sidebar-resizing': isResizingToc }">
          <div class="document-stage-surface">
            <template v-if="viewMode === 'split'">
              <div
                ref="splitContainerRef"
                class="split-workspace"
                :class="{ resizing: isResizingSplit }"
                :style="splitContainerStyle"
              >
                <div class="split-container">
                  <textarea
                    ref="editorRef"
                    class="split-editor"
                    v-model="editedContent"
                    @input="handlePlainTextEditorInput"
                    @contextmenu="handleSplitEditorContextMenu"
                    @scroll="handleEditorScroll"
                    @scrollend="resetSyncState"
                    :placeholder="editorPlaceholder"
                    spellcheck="false"
                  ></textarea>
                </div>
                <div
                  class="split-divider split-resize-handle"
                  title="拖动调整左右宽度"
                  @mousedown="startResizeSplit"
                ></div>
                <div
                  class="split-preview"
                  :class="{ 'html-preview-shell': isHtmlDocument }"
                  ref="previewRef"
                  @scroll="handlePreviewScroll"
                  @scrollend="resetSyncState"
                >
                  <div
                    v-if="isMarkdownDocument"
                    class="markdown-body"
                    v-html="renderedHtml"
                  ></div>
                  <iframe
                    v-else-if="isHtmlDocument"
                    ref="htmlPreviewFrameRef"
                    class="html-preview-frame"
                    :srcdoc="htmlPreviewDocument"
                    @load="handleHtmlPreviewLoad"
                  ></iframe>
                  <pre
                    v-else
                    class="plain-text-preview"
                  ><code>{{ markdownContent }}</code></pre>
                </div>
              </div>
            </template>

            <template v-else-if="viewMode === 'live'">
              <div class="live-editor-view" ref="liveEditorRef">
                <div v-if="isMarkdownDocument" class="live-editor-shell">
                  <LiveEditSurface
                    v-bind="imageResolverBindings"
                    ref="liveEditSurfaceRef"
                    v-model="editedContent"
                    :placeholder="LIVE_EDIT_PLACEHOLDER"
                    :file-path="filePath"
                    :request-ai-insert-content="requestAiInsertContentWithPrompt"
                    @ready="handleLiveEditorReady"
                  />
                </div>
                <textarea
                  v-else-if="isHtmlDocument"
                  class="html-source-editor"
                  v-model="editedContent"
                  @input="handlePlainTextEditorInput"
                  :placeholder="editorPlaceholder"
                  spellcheck="false"
                ></textarea>
                <textarea
                  v-else
                  class="plain-text-editor"
                  v-model="editedContent"
                  @input="handlePlainTextEditorInput"
                  :placeholder="editorPlaceholder"
                  spellcheck="false"
                ></textarea>
              </div>
            </template>

            <!-- 预览模式 -->
            <template v-else>
              <div
                ref="previewRef"
                class="content-area"
                :class="{ 'html-preview-shell': isHtmlDocument }"
                @scroll="handlePreviewScroll"
              >
                <div
                  v-if="isMarkdownDocument"
                  class="markdown-body"
                  v-html="renderedHtml"
                ></div>
                <iframe
                  v-else-if="isHtmlDocument"
                  ref="htmlPreviewFrameRef"
                  class="html-preview-frame"
                  :srcdoc="htmlPreviewDocument"
                  @load="handleHtmlPreviewLoad"
                ></iframe>
                <pre
                  v-else
                  class="plain-text-preview standalone"
                ><code>{{ markdownContent }}</code></pre>
              </div>
            </template>
          </div>

          <div v-if="isResizingToc" class="sidebar-resize-placeholder" aria-hidden="true">
            <div class="sidebar-resize-placeholder-card">
              <span class="sidebar-resize-placeholder-title">正在调整导航宽度</span>
              <span class="sidebar-resize-placeholder-hint">松开鼠标后恢复正文显示</span>
            </div>
          </div>

          <button
            v-if="hasDocumentContent && !isResizingToc"
            class="back-to-top-btn"
            type="button"
            title="回到顶部"
            aria-label="回到顶部"
            @click="scrollDocumentToTop"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>

        <StyleConfigPanel
          v-if="stylePanelState.visible"
          v-model:config="styleConfig"
          v-model:panel-state="stylePanelState"
          :current-theme="currentTheme"
          :themes="themes"
          :effective-metrics="styleConfigMetrics"
          :show-reset="hasCustomStyleConfig"
          :smart-themes="themeList"
          :generating-smart-theme="isGeneratingSmartTheme"
          @theme-change="setTheme"
          @reset="resetPluginStyles"
          @generate-smart-theme="openSmartThemePrompt"
          @apply-smart-theme="applySmartTheme"
          @delete-smart-theme="deleteSmartTheme"
        />
      </div>

      <SettingsModal
        v-bind="settingsModalBindings"
        v-if="showSettingsModal"
        v-model:settings="appSettings"
        :initial-section="settingsInitialSection"
        :browser-zoom-level="browserZoomLevel"
        @reset-browser-zoom="resetBrowserZoom"
        @close="showSettingsModal = false"
      />

      <FileConflictModal
        :visible="showFileConflictModal"
        :file-name="fileName"
        :resolving="isResolvingFileConflict"
        @close="showFileConflictModal = false"
        @use-current="resolveFileConflictWithCurrent"
        @use-external="resolveFileConflictWithExternal"
      />

      <SmartFormatPreviewModal
        v-bind="imageResolverBindings"
        :visible="showSmartFormatPreview"
        :original-content="smartFormatOriginalContent"
        :formatted-content="smartFormatCandidateContent"
        @use="confirmSmartFormatPreview"
        @close="closeSmartFormatPreview"
      />

      <SmartFormatPromptModal
        :visible="showSmartFormatPrompt"
        :initial-instruction="smartFormatInstruction"
        @confirm="confirmSmartFormatPrompt"
        @close="showSmartFormatPrompt = false"
      />

      <SmartFormatPromptModal
        class="design-format-prompt"
        :visible="showDesignSmartFormatPrompt"
        :initial-instruction="designSmartFormatInstruction"
        @confirm="confirmDesignSmartFormatPrompt"
        @close="closeDesignSmartFormatPrompt"
      />

      <SmartFormatPromptModal
        :visible="aiInsertPromptState.visible"
        :eyebrow="aiInsertPromptState.eyebrow"
        :title="aiInsertPromptState.title"
        :description="aiInsertPromptState.description"
        :input-label="aiInsertPromptState.inputLabel"
        :placeholder="aiInsertPromptState.placeholder"
        :meta-hint="aiInsertPromptState.metaHint"
        :confirm-text="aiInsertPromptState.confirmText"
        :recommendation-label="aiInsertPromptState.recommendationLabel"
        :recommendations="aiInsertPromptState.recommendations"
        :max-length="aiInsertPromptState.maxLength"
        @confirm="confirmAiInsertPrompt"
        @close="closeAiInsertPrompt"
      />

      <SmartThemePromptModal
        :visible="showSmartThemePrompt"
        :initial-prompt="smartThemePrompt"
        :history-items="smartThemePromptHistory"
        @confirm="confirmSmartThemePrompt"
        @delete-history="deleteSmartThemePromptHistoryItem"
        @close="showSmartThemePrompt = false"
      />

      <div
        v-if="showDesignSmartFormatPreview"
        class="design-dialog-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="HTML AI 排版预览"
      >
        <section class="design-dialog-card design-smart-format-card">
          <header class="design-dialog-header">
            <div>
              <h3>确认是否应用 AI HTML 排版结果</h3>
              <p>左边是当前设计内容，右边是 AI 生成的新排版。</p>
            </div>
            <button
              class="design-dialog-close"
              type="button"
              aria-label="关闭 HTML AI 排版预览"
              @click="closeDesignSmartFormatPreview"
            >
              ×
            </button>
          </header>
          <div class="design-smart-format-compare">
            <section class="design-smart-format-pane">
              <div class="design-smart-format-pane-title">当前内容</div>
              <iframe
                class="design-smart-format-frame"
                :srcdoc="designSmartFormatOriginalPreviewDocument"
                title="当前 HTML 内容"
              ></iframe>
            </section>
            <section class="design-smart-format-pane">
              <div class="design-smart-format-pane-title">AI 排版结果</div>
              <iframe
                class="design-smart-format-frame"
                :srcdoc="designSmartFormatCandidatePreviewDocument"
                title="AI HTML 排版结果"
              ></iframe>
            </section>
          </div>
          <footer class="design-dialog-actions">
            <button
              class="design-dialog-btn"
              type="button"
              @click="closeDesignSmartFormatPreview"
            >
              保留当前内容
            </button>
            <button
              class="design-dialog-btn primary"
              type="button"
              @click="confirmDesignSmartFormatPreview"
            >
              应用 AI 排版结果
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="showDesignDraftPrompt"
        class="design-dialog-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="设计草稿选择"
      >
        <section class="design-dialog-card design-draft-card">
          <header class="design-dialog-header">
            <div>
              <h3>发现设计草稿</h3>
              <p>这个文档在本次软件运行期间已经改过一次设计内容。</p>
            </div>
          </header>
          <div class="design-dialog-body">
            <p class="design-dialog-text">
              你可以继续编辑上次关闭时留下的草稿，或者用当前文档内容覆盖设计器中的草稿。
            </p>
            <div
              class="design-dialog-file"
              :title="designDraftPromptState?.sourcePath || ''"
            >
              {{ designDraftPromptState?.sourcePath || designDraftPromptState?.fileName }}
            </div>
          </div>
          <footer class="design-dialog-actions">
            <button
              class="design-dialog-btn"
              type="button"
              @click="dismissDesignDraftPrompt"
            >
              稍后再说
            </button>
            <button
              class="design-dialog-btn"
              type="button"
              @click="overwriteDesignDraftWithCurrentDocument"
            >
              用当前内容覆盖
            </button>
            <button
              class="design-dialog-btn primary"
              type="button"
              @click="continueDesignDraftEditing"
            >
              继续编辑草稿
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="showDesignExportModal"
        class="design-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设计导出 HTML"
      >
        <section class="design-export-shell">
          <header class="design-export-header" @dblclick="toggleWindowMaximize">
            <div class="design-export-brand">
              <img :src="appLogoUrl" class="app-logo" alt="" draggable="false" />
              <span class="design-export-brand-title">HTML设计器</span>
              <div class="design-export-brand-meta">
                <span
                  class="design-export-brand-file"
                  :title="designExportWindowFileName"
                >
                  {{ designExportWindowFileName }}
                </span>
                <span
                  class="design-export-brand-status"
                  :class="{ 'is-dirty': designExportStatusDirty }"
                >
                  {{ designExportStatusText }}
                </span>
                <button
                  class="design-export-header-btn"
                  type="button"
                  :disabled="isPreparingDesignExport"
                  @click.stop="triggerDesignReset"
                >
                  初始化默认值
                </button>
              </div>
            </div>
            <div class="design-export-header-actions" @dblclick.stop>
              <button
                class="design-export-header-btn design-export-help-btn"
                type="button"
                @click.stop="showDesignHelpModal = true"
              >
                帮助中心
              </button>
              <div
                v-if="showNativeWindowControls"
                class="window-controls"
                aria-label="窗口控制"
                @dblclick.stop
              >
                <button
                  class="window-control"
                  type="button"
                  title="最小化"
                  aria-label="最小化"
                  @click.stop="minimizeWindow"
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 8.5h8" />
                  </svg>
                </button>
                <button
                  class="window-control"
                  type="button"
                  :title="isWindowMaximized ? '还原' : '最大化'"
                  :aria-label="isWindowMaximized ? '还原' : '最大化'"
                  @click.stop="toggleWindowMaximize(null)"
                >
                  <svg v-if="isWindowMaximized" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4 2.5h5.5v5.5" />
                    <path d="M2.5 4h5.5v5.5H2.5z" />
                  </svg>
                  <svg v-else viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="2.5" y="2.5" width="7" height="7" />
                  </svg>
                </button>
                <button
                  class="window-control window-close"
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  @click.stop="closeDesignExportModal"
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m2.5 2.5 7 7m0-7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <div class="design-export-body">
            <iframe
              v-if="designHtml"
              :key="designFrameLoadVersion"
              ref="designFrameRef"
              class="design-export-frame"
              :srcdoc="designHtml"
              title="设计导出 HTML"
              @load="handleDesignFrameLoad"
            ></iframe>
            <div v-if="isPreparingDesignExport" class="design-export-loading">
              正在生成当前文档的 HTML 内容...
            </div>
            <div v-if="designExportError" class="design-export-error">
              {{ designExportError }}
            </div>
          </div>

          <div
            v-if="showDesignHelpModal"
            class="design-dialog-backdrop design-help-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="帮助中心"
            @click.self="showDesignHelpModal = false"
          >
            <section class="design-dialog-card design-help-card">
              <header class="design-dialog-header">
                <div>
                  <h3>帮助中心</h3>
                  <p>设计器常用操作、排序方式和容易踩坑的地方都在这里。</p>
                </div>
                <button
                  class="design-dialog-close"
                  type="button"
                  aria-label="关闭帮助中心"
                  @click="showDesignHelpModal = false"
                >
                  ×
                </button>
              </header>
              <div class="design-help-layout">
                <div class="design-help-list">
                  <article
                    v-for="item in DESIGN_HELP_TOPICS"
                    :key="item.title"
                    class="design-help-item"
                  >
                    <h4>{{ item.title }}</h4>
                    <p>{{ item.description }}</p>
                  </article>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>

      <Teleport to="body">
        <div
          v-if="splitInsertMenuState"
          ref="splitInsertMenuRef"
          class="md-live-context-menu"
          :style="{
            left: `${splitInsertMenuState.x}px`,
            top: `${splitInsertMenuState.y}px`,
          }"
          role="menu"
          @contextmenu.prevent
        >
          <section
            v-for="section in splitInsertMenuSections"
            :key="section.title"
            class="md-live-context-menu-section"
          >
            <div class="md-live-context-menu-title">{{ section.title }}</div>
            <button
              v-for="item in section.items"
              :key="item.id"
              type="button"
              :class="[
                'md-live-context-menu-item',
                item.children?.length ? 'has-children' : '',
              ]"
              role="menuitem"
              @mousedown.prevent
              @mouseenter="openSplitInsertSubmenu(item, $event)"
              @click="
                item.children?.length
                  ? openSplitInsertSubmenu(item, $event)
                  : handleSplitInsertMenuItem(item)
              "
            >
              <span class="md-live-context-menu-item-label">{{ item.label }}</span>
              <span class="md-live-context-menu-item-desc">{{ item.description }}</span>
              <span v-if="item.children?.length" class="md-live-context-menu-item-arrow">›</span>
            </button>
          </section>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="splitInsertSubmenuState"
          ref="splitInsertSubmenuRef"
          class="md-live-context-submenu"
          :style="{
            left: `${splitInsertSubmenuState.x}px`,
            top: `${splitInsertSubmenuState.y}px`,
          }"
          role="menu"
          @contextmenu.prevent
        >
          <button
            v-for="item in splitInsertSubmenuState.items"
            :key="item.id"
            type="button"
            :class="[
              'md-live-context-menu-item',
              item.children?.length ? 'has-children' : '',
            ]"
            role="menuitem"
            @mousedown.prevent
            @mouseenter="
              item.children?.length
                ? openSplitInsertNestedSubmenu(item, $event)
                : closeSplitInsertNestedSubmenu()
            "
            @click="
              item.children?.length
                ? openSplitInsertNestedSubmenu(item, $event)
                : handleSplitInsertMenuItem(item)
            "
          >
            <span class="md-live-context-menu-item-label">{{ item.label }}</span>
            <span class="md-live-context-menu-item-desc">{{ item.description }}</span>
            <span v-if="item.children?.length" class="md-live-context-menu-item-arrow">›</span>
          </button>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="splitInsertNestedSubmenuState"
          ref="splitInsertNestedSubmenuRef"
          class="md-live-context-submenu"
          :style="{
            left: `${splitInsertNestedSubmenuState.x}px`,
            top: `${splitInsertNestedSubmenuState.y}px`,
          }"
          role="menu"
          @contextmenu.prevent
        >
          <button
            v-for="item in splitInsertNestedSubmenuState.items"
            :key="item.id"
            type="button"
            class="md-live-context-menu-item"
            role="menuitem"
            @mousedown.prevent
            @click="handleSplitInsertMenuItem(item)"
          >
            <span class="md-live-context-menu-item-label">{{ item.label }}</span>
            <span class="md-live-context-menu-item-desc">{{ item.description }}</span>
          </button>
        </div>
      </Teleport>

      <input
        ref="splitImageInputRef"
        class="md-insert-hidden-input"
        type="file"
        accept="image/*"
        @change="handleSplitImageFileChange"
      />

      <Teleport to="body">
        <div
          v-if="splitInsertDialogState"
          class="md-insert-dialog-backdrop"
          @mousedown="closeSplitInsertDialog"
        >
          <section
            class="md-insert-dialog"
            role="dialog"
            aria-modal="true"
            :aria-label="splitInsertDialogTitle"
            @mousedown.stop
          >
            <header class="md-insert-dialog-header">
              <div>
                <h3>{{ splitInsertDialogTitle }}</h3>
                <p>{{ splitInsertDialogDescription }}</p>
              </div>
              <button
                type="button"
                class="md-insert-dialog-close"
                @click="closeSplitInsertDialog"
              >
                ×
              </button>
            </header>

            <div class="md-insert-dialog-body">
              <template v-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.heading">
                <label class="md-insert-field">
                  <span class="md-insert-field-label">标题级别</span>
                  <select
                    v-model.number="splitInsertDialogState.draft.level"
                    class="md-insert-input"
                  >
                    <option v-for="level in [1, 2, 3, 4, 5, 6]" :key="level" :value="level">
                      {{ getHeadingLevelLabel(level) }} (H{{ level }})
                    </option>
                  </select>
                </label>
                <label class="md-insert-field">
                  <span class="md-insert-field-label">标题内容</span>
                  <input
                    v-model="splitInsertDialogState.draft.title"
                    class="md-insert-input"
                    type="text"
                    :placeholder="`输入${getHeadingLevelLabel(splitInsertDialogState.draft.level)}`"
                  />
                </label>
                <label class="md-insert-field">
                  <span class="md-insert-field-label">正文内容</span>
                  <textarea
                    v-model="splitInsertDialogState.draft.body"
                    class="md-insert-textarea"
                    placeholder="可选，插入标题下方正文"
                  ></textarea>
                </label>
              </template>

              <template v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.quote">
                <label class="md-insert-field">
                  <span class="md-insert-field-label">引用内容</span>
                  <textarea
                    v-model="splitInsertDialogState.draft.text"
                    class="md-insert-textarea"
                    placeholder="输入引用内容，支持多行"
                  ></textarea>
                </label>
              </template>

              <template
                v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.taskList"
              >
                <div class="md-insert-field">
                  <div class="md-insert-field-head">
                    <span class="md-insert-field-label">任务项</span>
                    <button type="button" class="md-insert-mini-btn" @click="addSplitTaskItem">
                      新增一项
                    </button>
                  </div>
                  <div class="md-insert-list-editor">
                    <div
                      v-for="(task, index) in splitInsertDialogState.draft.items"
                      :key="`split-task-${index}`"
                      class="md-insert-list-row"
                    >
                      <label class="md-insert-check">
                        <input v-model="task.checked" type="checkbox" />
                        <span>已完成</span>
                      </label>
                      <input
                        v-model="task.text"
                        class="md-insert-input"
                        type="text"
                        placeholder="任务内容"
                      />
                      <button
                        type="button"
                        class="md-insert-mini-btn danger"
                        @click="removeSplitTaskItem(index)"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.table">
                <div class="md-insert-field">
                  <div class="md-insert-field-head">
                    <span class="md-insert-field-label">表格内容</span>
                    <div class="md-insert-inline-actions">
                      <button type="button" class="md-insert-mini-btn" @click="addSplitTableColumn">
                        新增列
                      </button>
                      <button type="button" class="md-insert-mini-btn" @click="addSplitTableRow">
                        新增行
                      </button>
                    </div>
                  </div>
                  <div class="md-insert-table-editor">
                    <table class="md-insert-table-grid">
                      <thead>
                        <tr>
                          <th class="md-insert-table-index-cell">#</th>
                          <th
                            v-for="(header, headerIndex) in splitInsertDialogState.draft.headers"
                            :key="`split-header-${headerIndex}`"
                            class="md-insert-table-cell is-header"
                          >
                            <input
                              v-model="splitInsertDialogState.draft.headers[headerIndex]"
                              class="md-insert-input"
                              type="text"
                              :placeholder="`列${headerIndex + 1}`"
                            />
                            <button
                              type="button"
                              class="md-insert-mini-btn danger"
                              :disabled="splitInsertDialogState.draft.headers.length <= 1"
                              @click="removeSplitTableColumn(headerIndex)"
                            >
                              删列
                            </button>
                          </th>
                          <th class="md-insert-table-action-head">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(row, rowIndex) in splitInsertDialogState.draft.rows"
                          :key="`split-row-${rowIndex}`"
                        >
                          <td class="md-insert-table-index-cell">{{ rowIndex + 1 }}</td>
                          <td
                            v-for="(cell, columnIndex) in row"
                            :key="`split-cell-${rowIndex}-${columnIndex}`"
                            class="md-insert-table-cell"
                          >
                            <input
                              v-model="splitInsertDialogState.draft.rows[rowIndex][columnIndex]"
                              class="md-insert-input"
                              type="text"
                              :placeholder="`第${rowIndex + 1}行第${columnIndex + 1}列`"
                            />
                          </td>
                          <td class="md-insert-table-row-actions">
                            <button
                              type="button"
                              class="md-insert-mini-btn danger"
                              @click="removeSplitTableRow(rowIndex)"
                            >
                              删行
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>

              <template v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.image">
                <div class="md-insert-upload-hint">
                  图片会在右键菜单中直接调起文件选择器，选中后自动插入到当前位置。
                </div>
              </template>

              <template v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.code">
                <label class="md-insert-field">
                  <span class="md-insert-field-label">代码语言</span>
                  <input
                    v-model="splitInsertDialogState.draft.language"
                    class="md-insert-input"
                    type="text"
                    list="split-insert-language-list"
                    placeholder="例如：javascript"
                  />
                  <datalist id="split-insert-language-list">
                    <option
                      v-for="language in CODE_LANGUAGE_SUGGESTIONS"
                      :key="language"
                      :value="language"
                    ></option>
                  </datalist>
                </label>
                <label class="md-insert-field">
                  <span class="md-insert-field-label">代码内容</span>
                  <textarea
                    v-model="splitInsertDialogState.draft.code"
                    class="md-insert-textarea is-code"
                    placeholder="输入代码内容"
                  ></textarea>
                </label>
              </template>

              <template
                v-else-if="splitInsertDialogState.item.type === INSERT_ITEM_TYPES.mermaid"
              >
                <label class="md-insert-field">
                  <span class="md-insert-field-label">Mermaid 内容</span>
                  <textarea
                    v-model="splitInsertDialogState.draft.code"
                    class="md-insert-textarea is-code"
                    placeholder="支持直接粘贴 ```mermaid ... ``` 或只粘贴内部代码"
                  ></textarea>
                  <span class="md-insert-field-tip">
                    支持直接粘贴完整的 ` ```mermaid ` 代码块，也支持只粘贴内部内容，保存时会自动整理。
                  </span>
                </label>
              </template>

              <div v-if="splitInsertDialogState.error" class="md-insert-dialog-error">
                {{ splitInsertDialogState.error }}
              </div>
            </div>

            <footer class="md-insert-dialog-actions">
              <button type="button" class="md-insert-dialog-btn" @click="closeSplitInsertDialog">
                取消
              </button>
              <button
                type="button"
                class="md-insert-dialog-btn primary"
                @click="confirmSplitInsertDialog"
              >
                插入内容
              </button>
            </footer>
          </section>
        </div>
      </Teleport>

      <SmartFormatFailureModal
        v-model:model-id="smartFormatRetryModelId"
        :visible="showSmartFormatFailure"
        :message="smartFormatError"
        :detail="smartFormatErrorDetail"
        :models="enabledSmartFormatModels"
        :progress-steps="smartFormatProgressSteps"
        @retry="retrySmartFormat"
        @close="showSmartFormatFailure = false"
        @open-settings="openSettingsFromSmartFormatFailure"
      />
    </template>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  defineAsyncComponent,
} from "vue";
import { marked } from "marked";
import { useEditedContentFlow } from "@/modules/live-edit/useEditedContentFlow";
import { useSplitScrollSync } from "@/modules/live-edit/useSplitScrollSync";
import { useViewModeController } from "@/modules/live-edit/useViewModeController";
import {
  loadLiveEditSurfaceComponent,
  preloadLiveEditorResources,
} from "@/modules/live-edit/liveEditorLoader";
import {
  CODE_LANGUAGE_SUGGESTIONS,
  INSERT_ITEM_TYPES,
  MENU_ITEM_ACTIONS,
  buildMarkdownContextMenuSections,
  createAiGenerationRequest,
  buildInsertSnippet,
  createDirectInsertSnippet,
  createInsertDraft,
  createGeneratedInsertSnippet,
  getHashHeadingContext,
  getHeadingLevelLabel,
  normalizeHeadingLevel,
  replaceHashHeadingLevel,
  resolveAdjacentMenuPosition,
  resolveFloatingMenuPosition,
  shouldOpenInsertDialog,
} from "@/modules/live-edit/insertMenuShared";
import { saveImageToDocumentDirectory } from "@/modules/live-edit/imageInsert";
import { useHtmlPreviewDocument } from "@/modules/preview/useHtmlPreviewDocument";
import { usePreviewImageResolver } from "@/modules/preview/usePreviewImageResolver";
import { usePerfInstrumentation } from "@/shared/perf/usePerfInstrumentation";
import { useStyleConfigPlugin } from "@/modules/style-config/useStyleConfigPlugin";
import { DEFAULT_APP_SETTINGS } from "@/modules/settings/constants";
import { useAppSettings } from "@/modules/settings/useAppSettings";
import { useDesktopAppKit } from "@/app/desktop";
import {
  escapeCodeHtml,
  createCodeBlockRenderer,
  renderHighlightedCodeBlock,
} from "@/shared/markdown/codeBlockHighlight";
import {
  loadMermaid,
  resolveMermaidThemeFromDocument,
} from "@/shared/markdown/mermaidRuntime";
import { postProcessMarkdownHtml } from "@/shared/markdown/renderPostProcess";
import { createMarkdownTableController } from "@/shared/markdown/tableLayout";
import {
  createRenderedHeadingCollector,
  createTocExtractor,
  createTocSyncController,
} from "@/shared/markdown/toc";
import { DEFAULT_DESIGN_EXPORT_STATUS_TEXT } from "@/modules/design/constants";
import FileTree from "@/modules/file-explorer/FileTree.vue";
import { normalizeWindowsPath } from "@/modules/file-explorer/useWorkspaceFileFlow";
import appLogoUrl from "@/assets/app-logo.png";
import { registerExternalFontFaces } from "@/shared/fontFaces";
import {
  escapeAttribute,
  escapeHtml,
} from "@/modules/export/useExportSurface";
import { getFileExtension } from "@/shared/file/path";
import { usePaneResizeController } from "@/shared/window/usePaneResizeController";
import { useTableColumnResize } from "@/shared/markdown/useTableColumnResize";
import { useHeadingNavigation } from "@/shared/markdown/useHeadingNavigation";
import { useToast } from "@/shared/ui/useToast";
import {
  registeredFontOptions,
  setExternalFontOptions,
} from "@/modules/style-config/fontRegistry";
import {
  createSmartThemeStyleSheet,
  getSmartThemeWindowColor,
  isSmartThemeId,
  saveSmartThemePromptHistory,
  saveSmartThemes,
} from "@/modules/style-config/smartThemes";

const StyleConfigPanel = defineAsyncComponent(() =>
  import("@/modules/style-config/StyleConfigPanel.vue")
);
const SmartThemePromptModal = defineAsyncComponent(() =>
  import("@/modules/style-config/SmartThemePromptModal.vue")
);
const SettingsModal = defineAsyncComponent(() =>
  import("@/modules/settings/SettingsModal.vue")
);
const SmartFormatFailureModal = defineAsyncComponent(() =>
  import("@/modules/ai/SmartFormatFailureModal.vue")
);
const SmartFormatPromptModal = defineAsyncComponent(() =>
  import("@/modules/ai/SmartFormatPromptModal.vue")
);
const SmartFormatPreviewModal = defineAsyncComponent(() =>
  import("@/modules/ai/SmartFormatPreviewModal.vue")
);
const LiveEditSurface = defineAsyncComponent(loadLiveEditSurfaceComponent);
const FileConflictModal = defineAsyncComponent(() =>
  import("@/modules/file-sync/FileConflictModal.vue")
);

const {
  showNativeWindowControls,
  startupContextReadyDefault,
  imageResolverBindings,
  settingsModalBindings,
  applyDesignFrameUiThemeOnly,
  applyDesignExportHtml,
  releaseDesignFrameBridgeResources,
  readDesignFrameCurrentHtml,
  useAiFlows,
  useDesignFlows,
  useFileFlows,
  useRuntimeFlows,
} = useDesktopAppKit();

const { settings: appSettings } = useAppSettings();

function readPreference(key) {
  return appSettings.value.persistence[key]
    ? appSettings.value[key]
    : DEFAULT_APP_SETTINGS[key];
}

const markdownContent = ref("");
const editedContent = ref("");
const originalContent = ref(""); // 用于保存原始内容，判断是否有修改
const renderedHtml = ref("");
const fileName = ref("未打开文件");
const filePath = ref("");
const workspaceRoots = ref([]);
const workspaceFileCount = ref(0);
const expandedTreePaths = ref(new Set());
const sidebarSection = ref("outline");
const isDark = ref(false);
const showToc = ref(readPreference("showToc"));
const tocItems = ref([]);
const activeTocId = ref("");
const isDragging = ref(false);
const zoomLevel = ref(readPreference("zoom"));
const browserZoomLevel = ref(100);
const TOOLBAR_HEIGHT = 44;
const currentTheme = ref(readPreference("theme"));
const viewMode = ref(readPreference("viewMode")); // 'preview' | 'split' | 'live'
const editorRef = ref(null);
const previewRef = ref(null);
const liveEditorRef = ref(null);
const liveEditSurfaceRef = ref(null);
const splitContainerRef = ref(null);
const splitInsertMenuRef = ref(null);
const splitInsertSubmenuRef = ref(null);
const splitInsertNestedSubmenuRef = ref(null);
const splitInsertMenuState = ref(null);
const splitInsertSubmenuState = ref(null);
const splitInsertNestedSubmenuState = ref(null);
const splitInsertDialogState = ref(null);
const splitImageInputRef = ref(null);
const splitPendingImageInsertState = ref(null);
const designFrameRef = ref(null);
const designFrameLoadVersion = ref(0);
const htmlPreviewFrameRef = ref(null);
const browserViewportWidth = ref(getBrowserViewportWidth());
const browserViewportHeight = ref(getBrowserViewportHeight());
const mermaidIdCounter = ref(0);
const isExternalChange = ref(false);
const editHistory = ref([]); // 编辑历史，用于撤销
const historyIndex = ref(-1); // 当前历史位置
const MAX_HISTORY = 50; // 最大历史记录数
const HISTORY_SNAPSHOT_DELAY = 320;
const LIVE_TOC_SYNC_DELAY = 160;
const SPLIT_RENDER_DELAY = 220;
const LARGE_DOC_TOC_SYNC_DELAY = 260;
const HUGE_DOC_TOC_SYNC_DELAY = 380;
const LARGE_DOC_SPLIT_RENDER_DELAY = 420;
const HUGE_DOC_SPLIT_RENDER_DELAY = 620;
const FAST_TOC_EXTRACTION_THRESHOLD = 60000;
const MERMAID_RENDER_IDLE_TIMEOUT = 520;
const MERMAID_RENDER_DELAY = 120;
const LARGE_DOC_THRESHOLD = 80000;
const HUGE_DOC_THRESHOLD = 180000;
const isLoading = ref(false); // 文档加载状态
const loadingText = ref("加载中..."); // 加载提示文字
const showSettingsModal = ref(false);
const settingsInitialSection = ref("general");
const externalConflictContent = ref(null);
const showFileConflictModal = ref(false);
const isResolvingFileConflict = ref(false);
const isWindowMaximized = ref(false);
const startupContextReady = ref(startupContextReadyDefault);
const startupMode = ref("");
const isExporting = ref(false);
const showDesignExportModal = ref(false);
const showDesignDraftPrompt = ref(false);
const showDesignHelpModal = ref(false);
const isPreparingDesignExport = ref(false);
const isClosingDesignExport = ref(false);
const designHtml = ref("");
const designLoadError = ref("");
const designExportError = ref("");
const designExportDocumentHtml = ref("");
const designExportSourcePath = ref("");
const designExportBaselineHtml = ref("");
const designExportWindowFileName = ref("markdown-preview.html");
const designExportStatusText = ref(DEFAULT_DESIGN_EXPORT_STATUS_TEXT);
const designExportStatusDirty = ref(false);
const designDraftPromptState = ref(null);
const MAX_SMART_FORMAT_PROGRESS_STEPS = 6;
const AI_INSERT_PROMPT_MAX_LENGTH = 1200;
const AI_INSERT_CODE_RECOMMENDATIONS = Object.freeze([
  {
    label: "工具函数",
    text: "生成一个可直接插入 Markdown 代码块的实用函数，包含必要的输入校验、关键注释和示例参数命名。",
  },
  {
    label: "接口请求",
    text: "生成一个清晰的接口请求示例，包含请求参数、错误处理和成功返回后的核心逻辑。",
  },
  {
    label: "组件逻辑",
    text: "生成一段结构清晰的组件逻辑代码，突出状态、事件处理和关键渲染流程。",
  },
]);
const AI_INSERT_MERMAID_RECOMMENDATIONS = Object.freeze([
  {
    label: "流程图",
    text: "生成 Mermaid flowchart 流程图，清晰表达开始、判断、分支、处理过程和结束。",
  },
  {
    label: "时序图",
    text: "生成 Mermaid sequenceDiagram 时序图，明确参与者、请求顺序和返回结果。",
  },
  {
    label: "ER图",
    text: "生成 Mermaid erDiagram，列出主要实体、关键字段和实体间关系。",
  },
]);

function createAiInsertPromptState() {
  return {
    visible: false,
    eyebrow: "AI GENERATE",
    title: "这次希望 AI 生成什么？",
    description: "",
    inputLabel: "生成需求",
    placeholder: "",
    metaHint: "",
    confirmText: "开始AI生成",
    recommendationLabel: "常用推荐",
    recommendations: [],
    maxLength: AI_INSERT_PROMPT_MAX_LENGTH,
    request: null,
  };
}

const aiInsertPromptState = ref(createAiInsertPromptState());
let aiInsertPromptResolver = null;
const MARKDOWN_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkdn",
  ".mkd",
  ".mdwn",
]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const LIVE_EDIT_PLACEHOLDER = "在此实时编辑 Markdown 内容...";
const DESIGN_BRIDGE_MARKER = 'btnSave.addEventListener("click", saveFile);';
const STARTUP_MODE_DESIGN_EXPORT = "design-export";
const VIEW_MODE_TABS = [
  { mode: "preview", label: "预览", title: "切换到预览模式" },
  { mode: "live", label: "编辑", title: "切换到可视化编辑模式" },
  { mode: "split", label: "分栏", title: "切换到分栏编辑模式" },
];
const {
  perfNow,
  perfRound,
  perfLog,
  createPerfTrace,
  schedulePerfPaintMarks,
  setupPerfObservers,
  teardownPerfObservers,
} = usePerfInstrumentation();
const DESIGN_HELP_TOPICS = [
  {
    title: "Ctrl / Cmd + 滚轮缩放",
    description: "按住 Ctrl 或 Cmd 再滚动滚轮，会围绕鼠标所在位置缩放设计画布。",
  },
  {
    title: "空格 + 左键拖动画布",
    description: "按住空格时，画布进入平移模式，可拖动画布查看不同区域。",
  },
  {
    title: "左键点击页面元素",
    description: "会选中该元素，左侧显示节点结构，右侧显示样式和属性。",
  },
  {
    title: "双击文字进入编辑",
    description: "选中可编辑的文本元素后，双击高亮框可进入文字编辑状态。",
  },
  {
    title: "左键点击左侧节点",
    description: "用于从结构树中精确选中元素，适合选择较小或被遮挡的节点。",
  },
  {
    title: "右键点击页面元素",
    description:
      "会结束当前的属性编辑状态，并在目标元素上重新显示悬浮高亮，方便确认当前目标。",
  },
  {
    title: "方向键调整顺序",
    description:
      "选中元素后按上下左右方向键，会把当前节点在同级节点里向前或向后调整顺序。",
  },
  {
    title: "操作区上移 / 下移",
    description: "右侧操作区里的上移、下移和键盘方向键一样，都是调整当前节点的同级顺序。",
  },
  {
    title: "Ctrl / Cmd + S 导出 HTML",
    description: "会直接触发当前设计内容的 HTML 导出。",
  },
  {
    title: "Ctrl / Cmd + Z / Shift + Ctrl / Cmd + Z",
    description: "分别对应撤销和重做当前修改。",
  },
  {
    title: "Esc 退出当前状态",
    description: "可关闭当前属性面板，或退出部分正在进行的编辑状态。",
  },
  {
    title: "初始化默认值",
    description: "会恢复到本次打开设计器时载入的版本，适合放弃本轮试验性修改。",
  },
  {
    title: "设计草稿续编",
    description:
      "同一文档在本次软件运行期间关闭后再打开，会提示继续上次草稿或用当前内容覆盖。",
  },
];
// 目录宽度相关
const isDesignExportWindow = computed(
  () => startupMode.value === STARTUP_MODE_DESIGN_EXPORT
);
const tocWidth = ref(readPreference("tocWidth"));
const isResizingToc = ref(false);
const tocMinWidth = 120;
const tocMaxWidth = 500;
const splitMinPercent = 20;
const splitMaxPercent = 80;
const DOCUMENT_TYPE_PROBE_MAX_CHARS = 4096;
const LARGE_EDITOR_OPTIMIZATION_THRESHOLD = 30000;
const LARGE_EDITOR_SIDE_EFFECT_DELAY = 48;
const HUGE_EDITOR_SIDE_EFFECT_DELAY = 96;
const EDITOR_INTERACTION_RELIEF_MS = 180;
const splitEditorWidth = ref(readPreference("splitWidth"));
const isResizingSplit = ref(false);
const isEditorInteractionReliefActive = ref(false);
const splitContainerStyle = computed(() => ({
  "--split-editor-width": `${splitEditorWidth.value}%`,
}));
const hasWorkspaceFiles = computed(() => workspaceFileCount.value > 0);
const normalizedActiveWorkspacePath = computed(() =>
  normalizeWindowsPath(filePath.value)
);
const shouldShowSidebar = computed(
  () => showToc.value && (hasWorkspaceFiles.value || tocItems.value.length > 0)
);
const {
  looksLikeHtmlDocument,
  getHtmlPreviewBaseHref,
  buildHtmlFragmentDocument,
  buildHtmlPreviewDocument,
} = useHtmlPreviewDocument({
  filePath,
  documentTypeProbeMaxChars: DOCUMENT_TYPE_PROBE_MAX_CHARS,
  escapeAttribute,
});
const documentTypeProbeContent = computed(() =>
  String(editedContent.value || markdownContent.value || "").slice(
    0,
    DOCUMENT_TYPE_PROBE_MAX_CHARS
  )
);
const isHtmlDocument = computed(() => {
  const extension = getFileExtension(filePath.value || fileName.value);
  if (HTML_EXTENSIONS.has(extension)) {
    return true;
  }
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return false;
  }
  return looksLikeHtmlDocument(documentTypeProbeContent.value);
});
const isMarkdownDocument = computed(() => {
  const extension = getFileExtension(filePath.value || fileName.value);
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return true;
  }
  if (HTML_EXTENSIONS.has(extension)) {
    return false;
  }
  if (!filePath.value && fileName.value === "未打开文件") {
    return !looksLikeHtmlDocument(documentTypeProbeContent.value);
  }
  return false;
});
function preloadLiveEditor() {
  if (!isMarkdownDocument.value) {
    return;
  }
  preloadLiveEditorResources();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob)) {
      reject(new Error("无效的文件对象"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function closeSplitInsertMenu() {
  splitInsertMenuState.value = null;
  splitInsertSubmenuState.value = null;
  splitInsertNestedSubmenuState.value = null;
}

function closeSplitInsertNestedSubmenu() {
  splitInsertNestedSubmenuState.value = null;
}

function closeSplitInsertDialog() {
  splitInsertDialogState.value = null;
}

const splitInsertMenuSections = computed(() =>
  buildMarkdownContextMenuSections({
    headingContext: splitInsertMenuState.value?.headingContext
      ? {
          ...splitInsertMenuState.value.headingContext,
          currentLevel: splitInsertMenuState.value.headingContext.level,
        }
      : null,
  })
);

const splitInsertDialogTitle = computed(() =>
  splitInsertDialogState.value?.item?.label
    ? `插入${splitInsertDialogState.value.item.label}`
    : ""
);

const splitInsertDialogDescription = computed(
  () => splitInsertDialogState.value?.item?.description || ""
);

function isSplitInsertMenuEventInside(event) {
  const panels = [
    splitInsertMenuRef.value,
    splitInsertSubmenuRef.value,
    splitInsertNestedSubmenuRef.value,
  ].filter(Boolean);
  if (panels.length === 0) {
    return false;
  }

  const target = event?.target;
  if (target instanceof Node && panels.some((panel) => panel.contains(target))) {
    return true;
  }

  if (typeof event?.composedPath === "function") {
    const eventPath = event.composedPath();
    return panels.some((panel) => eventPath.includes(panel));
  }

  return false;
}

function syncSplitInsertMenuPosition() {
  const currentState = splitInsertMenuState.value;
  const menuElement = splitInsertMenuRef.value;
  if (!currentState || !menuElement) {
    return;
  }

  const nextPosition = resolveFloatingMenuPosition({
    anchorX: currentState.anchorX,
    anchorY: currentState.anchorY,
    menuWidth: menuElement.offsetWidth,
    menuHeight: menuElement.offsetHeight,
  });

  if (nextPosition.x === currentState.x && nextPosition.y === currentState.y) {
    return;
  }

  splitInsertMenuState.value = {
    ...currentState,
    ...nextPosition,
  };
}

function syncSplitInsertSubmenuPosition() {
  const currentState = splitInsertSubmenuState.value;
  const menuElement = splitInsertSubmenuRef.value;
  if (!currentState || !menuElement) {
    return;
  }

  const nextPosition = resolveAdjacentMenuPosition(
    currentState.anchorRect,
    menuElement.offsetWidth,
    menuElement.offsetHeight
  );

  if (nextPosition.x === currentState.x && nextPosition.y === currentState.y) {
    return;
  }

  splitInsertSubmenuState.value = {
    ...currentState,
    ...nextPosition,
  };
}

function syncSplitInsertNestedSubmenuPosition() {
  const currentState = splitInsertNestedSubmenuState.value;
  const menuElement = splitInsertNestedSubmenuRef.value;
  if (!currentState || !menuElement) {
    return;
  }

  const nextPosition = resolveAdjacentMenuPosition(
    currentState.anchorRect,
    menuElement.offsetWidth,
    menuElement.offsetHeight
  );

  if (nextPosition.x === currentState.x && nextPosition.y === currentState.y) {
    return;
  }

  splitInsertNestedSubmenuState.value = {
    ...currentState,
    ...nextPosition,
  };
}

function handleSplitEditorContextMenu(event) {
  if (!isMarkdownDocument.value || event.shiftKey) {
    return;
  }

  const textarea = event.currentTarget;
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }

  event.preventDefault();
  textarea.focus({ preventScroll: true });

  const nextPosition = resolveFloatingMenuPosition({
    anchorX: event.clientX,
    anchorY: event.clientY,
  });

  splitInsertMenuState.value = {
    anchorX: event.clientX,
    anchorY: event.clientY,
    x: nextPosition.x,
    y: nextPosition.y,
    target: textarea,
    headingContext: getHashHeadingContext(
      editedContent.value,
      Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : 0
    ),
    selectionStart: Number.isFinite(textarea.selectionStart)
      ? textarea.selectionStart
      : String(editedContent.value || "").length,
    selectionEnd: Number.isFinite(textarea.selectionEnd)
      ? textarea.selectionEnd
      : Number.isFinite(textarea.selectionStart)
        ? textarea.selectionStart
        : String(editedContent.value || "").length,
  };

  void nextTick(() => {
    syncSplitInsertMenuPosition();
  });
}

function openSplitInsertSubmenu(item, event) {
  if (!item?.children?.length) {
    splitInsertSubmenuState.value = null;
    closeSplitInsertNestedSubmenu();
    return;
  }

  const anchorElement = event?.currentTarget;
  if (!(anchorElement instanceof Element)) {
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const nextPosition = resolveAdjacentMenuPosition(anchorRect, 280, 320);
  splitInsertSubmenuState.value = {
    parentId: item.id,
    items: item.children,
    anchorRect: {
      left: anchorRect.left,
      right: anchorRect.right,
      top: anchorRect.top,
      bottom: anchorRect.bottom,
    },
    x: nextPosition.x,
    y: nextPosition.y,
  };
  closeSplitInsertNestedSubmenu();

  void nextTick(() => {
    syncSplitInsertSubmenuPosition();
  });
}

function openSplitInsertNestedSubmenu(item, event) {
  if (!item?.children?.length) {
    closeSplitInsertNestedSubmenu();
    return;
  }

  const anchorElement = event?.currentTarget;
  if (!(anchorElement instanceof Element)) {
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const nextPosition = resolveAdjacentMenuPosition(anchorRect, 280, 320);
  splitInsertNestedSubmenuState.value = {
    parentId: item.id,
    items: item.children,
    anchorRect: {
      left: anchorRect.left,
      right: anchorRect.right,
      top: anchorRect.top,
      bottom: anchorRect.bottom,
    },
    x: nextPosition.x,
    y: nextPosition.y,
  };

  void nextTick(() => {
    syncSplitInsertNestedSubmenuPosition();
  });
}

function insertSplitEditorSnippet(snippet, contextState = splitInsertMenuState.value) {
  const textarea =
    contextState?.target instanceof HTMLTextAreaElement
      ? contextState.target
      : editorRef.value instanceof HTMLTextAreaElement
        ? editorRef.value
        : null;
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return false;
  }

  const currentValue = String(editedContent.value ?? "");
  const start = Number.isFinite(contextState?.selectionStart)
    ? contextState.selectionStart
    : Number.isFinite(textarea.selectionStart)
      ? textarea.selectionStart
      : currentValue.length;
  const end = Number.isFinite(contextState?.selectionEnd)
    ? contextState.selectionEnd
    : Number.isFinite(textarea.selectionEnd)
      ? textarea.selectionEnd
      : start;
  const nextValue = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;
  const nextCaretPosition = start + snippet.length;

  editedContent.value = nextValue;

  void nextTick(() => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
    handlePlainTextEditorInput({ target: textarea });
  });

  return true;
}

function buildSplitInsertContext(item) {
  const currentState = splitInsertMenuState.value;
  const textarea =
    currentState?.target instanceof HTMLTextAreaElement
      ? currentState.target
      : editorRef.value instanceof HTMLTextAreaElement
        ? editorRef.value
        : null;
  const currentLength = String(editedContent.value || "").length;

  return {
    item,
    target: textarea,
    selectionStart: Number.isFinite(currentState?.selectionStart)
      ? currentState.selectionStart
      : Number.isFinite(textarea?.selectionStart)
        ? textarea.selectionStart
        : currentLength,
    selectionEnd: Number.isFinite(currentState?.selectionEnd)
      ? currentState.selectionEnd
      : Number.isFinite(textarea?.selectionEnd)
        ? textarea.selectionEnd
        : Number.isFinite(textarea?.selectionStart)
          ? textarea.selectionStart
          : currentLength,
  };
}

function openSplitInsertDialog(item) {
  splitInsertDialogState.value = {
    ...buildSplitInsertContext(item),
    draft: createInsertDraft(item, "split"),
    error: "",
  };
  closeSplitInsertMenu();
}

function requestSplitImageInsertForItem(item) {
  splitPendingImageInsertState.value = buildSplitInsertContext(item);
  closeSplitInsertMenu();
  void nextTick(() => {
    splitImageInputRef.value?.click?.();
  });
}

async function requestSplitAiGenerationForItem(item, insertContext = buildSplitInsertContext(item)) {
  const generatedContent = await requestAiInsertContentWithPrompt(
    createAiGenerationRequest(item, "split")
  );
  if (!String(generatedContent || "").trim()) {
    return;
  }

  const snippet = createGeneratedInsertSnippet(item, generatedContent, "split");
  const inserted = insertSplitEditorSnippet(snippet, insertContext);
  if (inserted) {
    closeSplitInsertMenu();
  }
}

function handleSplitInsertMenuItem(item) {
  if (item?.action === MENU_ITEM_ACTIONS.adjustHeadingLevel) {
    const currentState = splitInsertMenuState.value;
    const headingContext = currentState?.headingContext;
    if (!headingContext) {
      closeSplitInsertMenu();
      return;
    }

    const explicitTargetLevel = Number(item?.targetLevel);
    const nextLevel = normalizeHeadingLevel(
      Number.isFinite(explicitTargetLevel)
        ? explicitTargetLevel
        : headingContext.level + (Number(item.levelDelta) || 0)
    );
    const nextContent = replaceHashHeadingLevel(editedContent.value, headingContext, nextLevel);
    const replacementLine = nextContent.slice(headingContext.lineStart, headingContext.lineStart + (
      `${"#".repeat(nextLevel)} ${headingContext.content || ""}`.length
    ));
    const inserted = insertSplitEditorSnippet(replacementLine, {
      target: currentState?.target,
      selectionStart: headingContext.lineStart,
      selectionEnd: headingContext.lineEnd,
    });
    if (inserted) {
      closeSplitInsertMenu();
    } else {
      editedContent.value = nextContent;
      closeSplitInsertMenu();
    }
    return;
  }

  if (item?.action === MENU_ITEM_ACTIONS.aiGenerate) {
    const insertContext = buildSplitInsertContext(item);
    closeSplitInsertMenu();
    void requestSplitAiGenerationForItem(item, insertContext);
    return;
  }

  if (item?.type === INSERT_ITEM_TYPES.image) {
    requestSplitImageInsertForItem(item);
    return;
  }

  if (shouldOpenInsertDialog(item, "split")) {
    openSplitInsertDialog(item);
    return;
  }

  const inserted = insertSplitEditorSnippet(createDirectInsertSnippet(item, "split"));
  if (inserted) {
    closeSplitInsertMenu();
  } else {
    closeSplitInsertMenu();
  }
}

function confirmSplitInsertDialog() {
  const currentState = splitInsertDialogState.value;
  if (!currentState?.item) {
    return;
  }

  if (
    currentState.item.type === INSERT_ITEM_TYPES.image &&
    !String(currentState.draft?.source || "").trim()
  ) {
    currentState.error = "请先选择一张图片";
    return;
  }

  const snippet = buildInsertSnippet(currentState.item, currentState.draft, "split");
  const inserted = insertSplitEditorSnippet(snippet, currentState);
  if (inserted) {
    closeSplitInsertDialog();
  }
}

function addSplitTaskItem() {
  if (!splitInsertDialogState.value?.draft?.items) {
    return;
  }
  splitInsertDialogState.value.draft.items.push({
    text: "待办事项",
    checked: false,
  });
}

function removeSplitTaskItem(index) {
  const items = splitInsertDialogState.value?.draft?.items;
  if (!Array.isArray(items)) {
    return;
  }
  items.splice(index, 1);
  if (items.length === 0) {
    items.push({
      text: "",
      checked: false,
    });
  }
}

function addSplitTableRow() {
  const draft = splitInsertDialogState.value?.draft;
  if (!draft || !Array.isArray(draft.headers) || !Array.isArray(draft.rows)) {
    return;
  }
  draft.rows.push(Array.from({ length: draft.headers.length }, () => ""));
}

function removeSplitTableRow(rowIndex) {
  const draft = splitInsertDialogState.value?.draft;
  if (!draft || !Array.isArray(draft.rows)) {
    return;
  }
  draft.rows.splice(rowIndex, 1);
  if (draft.rows.length === 0) {
    draft.rows.push(Array.from({ length: draft.headers.length || 1 }, () => ""));
  }
}

function addSplitTableColumn() {
  const draft = splitInsertDialogState.value?.draft;
  if (!draft || !Array.isArray(draft.headers) || !Array.isArray(draft.rows)) {
    return;
  }
  draft.headers.push(`列${draft.headers.length + 1}`);
  draft.rows.forEach((row) => row.push(""));
}

function removeSplitTableColumn(columnIndex) {
  const draft = splitInsertDialogState.value?.draft;
  if (!draft || !Array.isArray(draft.headers) || draft.headers.length <= 1) {
    return;
  }
  draft.headers.splice(columnIndex, 1);
  draft.rows.forEach((row) => {
    row.splice(columnIndex, 1);
    if (row.length === 0) {
      row.push("");
    }
  });
}

async function handleSplitImageFileChange(event) {
  const file = event?.target?.files?.[0];
  const pendingInsert = splitPendingImageInsertState.value;
  if (!file || !pendingInsert?.item) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const storedImage = await saveImageToDocumentDirectory({
      documentPath: filePath.value,
      originalFileName: file.name || "",
      dataUrl,
    });
    const snippet = buildInsertSnippet(
      pendingInsert.item,
      {
        alt: file.name?.replace(/\.[^.]+$/, "") || "图片描述",
        source: storedImage.source,
        fileName: storedImage.fileName,
      },
      "split"
    );
    insertSplitEditorSnippet(snippet, pendingInsert);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "读取图片失败", "error");
  } finally {
    splitPendingImageInsertState.value = null;
    if (event?.target) {
      event.target.value = "";
    }
  }
}

function isSplitInsertDialogEventInside(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(".md-insert-dialog") !== null;
}

function handleViewModeTabIntent(mode) {
  if (mode === "live") {
    preloadLiveEditor();
  }
}

function handleDesignButtonIntent() {
  void preloadDesignPage();
}

const editorPlaceholder = computed(() => {
  if (isMarkdownDocument.value) {
    return "在此输入 Markdown 内容...";
  }
  return isHtmlDocument.value ? "在此编辑 HTML 内容..." : "在此编辑文本内容...";
});

const {
  styleConfig,
  panelState: stylePanelState,
  effectiveMetrics: styleConfigMetrics,
  styleConfigVars,
  hasCustomStyleConfig,
  resetStyleConfig,
} = useStyleConfigPlugin(currentTheme, zoomLevel);
const htmlPreviewSource = computed(() => String(markdownContent.value || ""));
const htmlPreviewDocument = computed(() => {
  if (!isHtmlDocument.value) {
    return "";
  }

  void currentTheme.value;
  void styleConfigVars.value;
  return buildHtmlPreviewDocument(htmlPreviewSource.value);
});
const designSmartFormatOriginalPreviewDocument = computed(() =>
  buildHtmlPreviewDocument(designSmartFormatOriginalHtml.value)
);
const designSmartFormatCandidatePreviewDocument = computed(() =>
  buildHtmlPreviewDocument(designSmartFormatCandidateHtml.value)
);
const { processImagePaths, cancelPendingPreviewImages } = usePreviewImageResolver({
  renderedHtml,
  previewRef,
  imageBridge: imageResolverBindings,
});
const { toastMessage, toastType, showToast, cleanupToast } = useToast();
const { applyWindowThemeAppearance, refreshExternalFonts: refreshExternalFontsFromShell } =
  useRuntimeFlows({
    appearance: {
      isLoading,
      loadingText,
      setExternalFontOptions,
      registerExternalFontFaces,
      resolveSmartThemeBackground: getSmartThemeWindowColor,
    },
  });
const { scrollToHeading } = useHeadingNavigation({
  activeTocId,
  viewMode,
  previewRef,
  liveEditorRef,
  tocItems,
});

function getBrowserViewportWidth() {
  if (typeof window === "undefined") {
    return 1280;
  }

  return Math.max(window.innerWidth || document.documentElement.clientWidth || 0, 1);
}

function getBrowserViewportHeight() {
  if (typeof window === "undefined") {
    return 800;
  }

  return Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 1);
}

function getDocumentPerformanceProfile(length) {
  const contentLength = Number(length) || 0;
  if (contentLength >= HUGE_DOC_THRESHOLD) {
    return {
      splitRenderDelay: HUGE_DOC_SPLIT_RENDER_DELAY,
      tocSyncDelay: HUGE_DOC_TOC_SYNC_DELAY,
    };
  }

  if (contentLength >= LARGE_DOC_THRESHOLD) {
    return {
      splitRenderDelay: LARGE_DOC_SPLIT_RENDER_DELAY,
      tocSyncDelay: LARGE_DOC_TOC_SYNC_DELAY,
    };
  }

  return {
    splitRenderDelay: SPLIT_RENDER_DELAY,
    tocSyncDelay: LIVE_TOC_SYNC_DELAY,
  };
}

const appContainerStyle = computed(() => {
  const scale = browserZoomLevel.value / 100;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const usesBrowserZoomTransform = Math.abs(safeScale - 1) > 0.0001;
  const viewportWidth = Math.max(browserViewportWidth.value, 1);
  const viewportHeight = Math.max(browserViewportHeight.value, 1);
  const contentHeight = Math.max(viewportHeight - TOOLBAR_HEIGHT, 0);

  return {
    ...styleConfigVars.value,
    "--browser-zoom-scale": String(safeScale),
    "--browser-zoom-transform": usesBrowserZoomTransform ? `scale(${safeScale})` : "none",
    "--browser-zoom-will-change": usesBrowserZoomTransform ? "transform" : "auto",
    "--browser-zoom-viewport-width": `${viewportWidth / safeScale}px`,
    "--browser-zoom-viewport-height": `${viewportHeight / safeScale}px`,
    "--browser-zoom-content-height": `${contentHeight / safeScale}px`,
  };
});

function persistPreference(key, value) {
  if (appSettings.value.persistence[key]) {
    appSettings.value[key] = value;
  }
}

function syncEnabledPreferences() {
  const preferenceValues = {
    theme: currentTheme.value,
    zoom: zoomLevel.value,
    viewMode: viewMode.value,
    showToc: showToc.value,
    tocWidth: tocWidth.value,
    splitWidth: splitEditorWidth.value,
  };

  for (const [key, value] of Object.entries(preferenceValues)) {
    if (appSettings.value.persistence[key]) {
      appSettings.value[key] = value;
    } else {
      appSettings.value[key] = DEFAULT_APP_SETTINGS[key];
    }
  }
}

watch(
  () => appSettings.value.persistence,
  () => {
    syncEnabledPreferences();
  },
  { deep: true }
);

watch(currentTheme, (value) => persistPreference("theme", value));
watch(zoomLevel, (value) => persistPreference("zoom", value));
watch(viewMode, (value) => persistPreference("viewMode", value));
watch(showToc, (value) => persistPreference("showToc", value));
watch(tocWidth, (value) => persistPreference("tocWidth", value));
watch(splitEditorWidth, (value) => persistPreference("splitWidth", value));
// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 自定义 renderer
const renderer = new marked.Renderer();
let currentCodeBlockRenderer = renderHighlightedCodeBlock;

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : "";
  return `<img src="${href}" alt="${text}"${titleAttr} style="max-width:100%;" loading="lazy" />`;
};

// 处理代码块 - 支持多种图表
renderer.code = function ({ text, lang }) {
  const normalizedLang = String(lang || "")
    .trim()
    .toLowerCase();
  // Mermaid 图表
  if (normalizedLang === "mermaid") {
    const id = `mermaid-${mermaidIdCounter.value++}`;
    return `<div class="mermaid-wrapper" data-mermaid-id="${id}"><pre class="mermaid">${escapeCodeHtml(
      text
    )}</pre></div>`;
  }
  // Flowchart.js
  if (normalizedLang === "flowchart" || normalizedLang === "flow") {
    return `<div class="flowchart-wrapper"><pre class="flowchart">${escapeCodeHtml(
      text
    )}</pre></div>`;
  }
  // Chart.js 数据
  if (normalizedLang === "chart") {
    return `<div class="chart-wrapper"><pre class="chart-data">${escapeCodeHtml(
      text
    )}</pre></div>`;
  }
  // PlantUML (需要服务端渲染，这里显示为代码)
  if (normalizedLang === "plantuml" || normalizedLang === "puml") {
    return `<div class="plantuml-wrapper"><pre class="plantuml">${escapeCodeHtml(
      text
    )}</pre></div>`;
  }
  return currentCodeBlockRenderer(text, normalizedLang);
};

const markdownTableController = createMarkdownTableController({
  filePath,
  fileName,
  styleConfig,
});

const { startResizeTableColumn, cleanupTableColumnResize } = useTableColumnResize({
  markdownTableController,
  styleConfig,
});

// 表格包裹 - 智能列宽分配，并为预览层提供拖拽列宽手柄。
renderer.table = function ({ header, rows }) {
  return markdownTableController.renderTable({
    parser: this.parser,
    header,
    rows,
  });
};

// TOC 提取
const renderedHeadingCollector = createRenderedHeadingCollector();
const tocExtractor = createTocExtractor({
  marked,
  fastThreshold: FAST_TOC_EXTRACTION_THRESHOLD,
});

renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const item = renderedHeadingCollector.captureHeading(text, depth);
  return `<h${depth} id="${item.id}">${text}</h${depth}>`;
};

// 渲染 Markdown
let markdownRenderToken = 0;
let queuedMarkdownRenderRafId = 0;
let queuedMarkdownRenderTimer = 0;
let queuedPreviewEnhancementRafId = 0;
let queuedPreviewEnhancementPass = 0;
let queuedMermaidRenderTimer = 0;
let queuedMermaidRenderRafId = 0;
let queuedMermaidRenderIdleId = 0;
let queuedMermaidRenderPass = 0;
let pendingFileOpenScrollResetTimer = 0;
let lastRenderedMarkdownSource = "";
let hasRenderedMarkdownSnapshot = false;

function cancelScheduledMarkdownRender() {
  if (queuedMarkdownRenderTimer) {
    clearTimeout(queuedMarkdownRenderTimer);
    queuedMarkdownRenderTimer = 0;
  }
  if (queuedMarkdownRenderRafId) {
    cancelAnimationFrame(queuedMarkdownRenderRafId);
    queuedMarkdownRenderRafId = 0;
  }
}

function cancelQueuedMermaidRender() {
  queuedMermaidRenderPass += 1;
  if (queuedMermaidRenderTimer) {
    clearTimeout(queuedMermaidRenderTimer);
    queuedMermaidRenderTimer = 0;
  }
  if (queuedMermaidRenderRafId) {
    cancelAnimationFrame(queuedMermaidRenderRafId);
    queuedMermaidRenderRafId = 0;
  }
  if (!queuedMermaidRenderIdleId) {
    return;
  }
  if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(queuedMermaidRenderIdleId);
  } else {
    clearTimeout(queuedMermaidRenderIdleId);
  }
  queuedMermaidRenderIdleId = 0;
}

function scheduleMermaidRender(options = {}) {
  const {
    immediate = false,
    renderToken = markdownRenderToken,
    reason = "unknown",
    sourceTraceId = 0,
  } = options;

  if (
    typeof window === "undefined" ||
    viewMode.value === "live" ||
    !isMarkdownDocument.value
  ) {
    return;
  }

  cancelQueuedMermaidRender();
  const currentPass = queuedMermaidRenderPass;

  const runRender = () => {
    queuedMermaidRenderIdleId = 0;
    queuedMermaidRenderTimer = 0;
    if (
      currentPass !== queuedMermaidRenderPass ||
      renderToken !== markdownRenderToken ||
      viewMode.value === "live"
    ) {
      return;
    }
    void renderMermaidCharts(renderToken, {
      reason,
      sourceTraceId,
      queuedPass: currentPass,
    });
  };

  const scheduleIdleRun = () => {
    if (typeof window.requestIdleCallback === "function") {
      queuedMermaidRenderIdleId = window.requestIdleCallback(runRender, {
        timeout: MERMAID_RENDER_IDLE_TIMEOUT,
      });
      return;
    }
    queuedMermaidRenderTimer = window.setTimeout(runRender, MERMAID_RENDER_DELAY);
  };

  if (immediate) {
    queuedMermaidRenderRafId = window.requestAnimationFrame(() => {
      queuedMermaidRenderRafId = 0;
      scheduleIdleRun();
    });
    return;
  }

  queuedMermaidRenderTimer = window.setTimeout(() => {
    queuedMermaidRenderTimer = 0;
    scheduleIdleRun();
  }, MERMAID_RENDER_DELAY);
}

const {
  syncTocFromMarkdown,
  shouldSyncTocInLiveMode,
  scheduleTocSync,
  cancelScheduledTocSync,
} = createTocSyncController({
  markdownContent,
  tocItems,
  isMarkdownDocument,
  showToc,
  sidebarSection,
  getDocumentPerformanceProfile,
  extractTocItemsFromMarkdown: tocExtractor.extract,
});

async function yieldMermaidRenderFrame() {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function cancelPreviewEnhancements() {
  queuedPreviewEnhancementPass += 1;
  cancelPendingPreviewImages();
  if (queuedPreviewEnhancementRafId) {
    cancelAnimationFrame(queuedPreviewEnhancementRafId);
    queuedPreviewEnhancementRafId = 0;
  }
  cancelQueuedMermaidRender();
}

function needsMarkdownPreviewRender() {
  if (!isMarkdownDocument.value) {
    return renderedHtml.value !== "";
  }

  return (
    !hasRenderedMarkdownSnapshot || lastRenderedMarkdownSource !== markdownContent.value
  );
}

function schedulePreviewEnhancements(options = {}) {
  const {
    immediate = false,
    renderToken = markdownRenderToken,
    reason = "unknown",
  } = options;
  const trace = createPerfTrace("preview-enhancements", {
    immediate,
    renderToken,
    reason,
    viewMode: viewMode.value,
    backendCalls: false,
  });

  if (
    typeof window === "undefined" ||
    viewMode.value === "live" ||
    !isMarkdownDocument.value
  ) {
    trace.end({
      skipped: true,
      isMarkdownDocument: isMarkdownDocument.value,
      viewMode: viewMode.value,
    });
    return;
  }

  const htmlSnapshot = renderedHtml.value;
  if (!htmlSnapshot.includes("<img") && !htmlSnapshot.includes("mermaid-wrapper")) {
    trace.end({
      skipped: true,
      reason,
      branch: "no-image-or-mermaid",
    });
    return;
  }

  cancelPreviewEnhancements();
  const currentPass = queuedPreviewEnhancementPass;

  const run = () => {
    nextTick(() => {
      if (
        currentPass !== queuedPreviewEnhancementPass ||
        renderToken !== markdownRenderToken ||
        viewMode.value === "live"
      ) {
        trace.end({
          aborted: true,
          stage: "nextTick",
          renderToken,
          currentRenderToken: markdownRenderToken,
          viewMode: viewMode.value,
        });
        return;
      }

      const imageStartedAt = perfNow();
      processImagePaths();
      const imageElapsedMs = perfRound(perfNow() - imageStartedAt);
      perfLog("preview-enhancements:image-paths", {
        id: trace.id,
        renderToken,
        reason,
        imageElapsedMs,
      });
      queuedPreviewEnhancementRafId = window.requestAnimationFrame(() => {
        queuedPreviewEnhancementRafId = 0;
        if (
          currentPass !== queuedPreviewEnhancementPass ||
          renderToken !== markdownRenderToken ||
          viewMode.value === "live"
        ) {
          trace.end({
            aborted: true,
            stage: "before-mermaid",
            renderToken,
            currentRenderToken: markdownRenderToken,
            viewMode: viewMode.value,
            imageElapsedMs,
          });
          return;
        }

        trace.end({
          renderToken,
          reason,
          imageElapsedMs,
        });
        schedulePerfPaintMarks("preview-enhancements", trace.startedAt, {
          id: trace.id,
          renderToken,
          reason,
        });
        scheduleMermaidRender({
          immediate,
          renderToken,
          reason,
          sourceTraceId: trace.id,
        });
      });
    });
  };

  if (immediate) {
    run();
    return;
  }

  queuedPreviewEnhancementRafId = window.requestAnimationFrame(() => {
    queuedPreviewEnhancementRafId = 0;
    run();
  });
}

function scheduleRenderMarkdown(options = {}) {
  const { immediate = false, reason = "unknown" } = options;
  const profile = getDocumentPerformanceProfile(markdownContent.value.length);
  const trace = createPerfTrace("schedule-render-markdown", {
    immediate,
    reason,
    viewMode: viewMode.value,
    splitRenderDelay: profile.splitRenderDelay,
    backendCalls: false,
  });

  if (queuedMarkdownRenderTimer) {
    clearTimeout(queuedMarkdownRenderTimer);
    queuedMarkdownRenderTimer = 0;
  }

  if (typeof window === "undefined") {
    if (viewMode.value === "live") {
      if (shouldSyncTocInLiveMode()) {
        syncTocFromMarkdown();
      }
      trace.end({
        skipped: true,
        environment: "no-window-live",
      });
      return;
    }
    trace.end({
      environment: "no-window",
    });
    void renderMarkdown({ reason, scheduleTraceId: trace.id });
    return;
  }

  if (queuedMarkdownRenderRafId) {
    cancelAnimationFrame(queuedMarkdownRenderRafId);
  }

  if (viewMode.value === "live") {
    scheduleTocSync({ immediate });
    return;
  }

  cancelScheduledTocSync();

  const runRender = () => {
    const queuedAt = perfNow();
    queuedMarkdownRenderRafId = window.requestAnimationFrame(() => {
      queuedMarkdownRenderRafId = 0;
      trace.end({
        queueDelayMs: perfRound(perfNow() - queuedAt),
        reason,
      });
      void renderMarkdown({ reason, scheduleTraceId: trace.id });
    });
  };

  if (immediate || viewMode.value !== "split") {
    runRender();
    return;
  }

  queuedMarkdownRenderTimer = window.setTimeout(() => {
    queuedMarkdownRenderTimer = 0;
    runRender();
  }, profile.splitRenderDelay);
}

async function renderMarkdown(options = {}) {
  const { reason = "unknown", scheduleTraceId = 0 } = options;
  const trace = createPerfTrace("render-markdown", {
    reason,
    scheduleTraceId,
    sourceLength: markdownContent.value.length,
    viewMode: viewMode.value,
    backendCalls: false,
  });
  const renderToken = ++markdownRenderToken;
  renderedHeadingCollector.reset();
  mermaidIdCounter.value = 0;
  markdownTableController.resetRenderCounter();
  currentCodeBlockRenderer = createCodeBlockRenderer({
    documentLength: markdownContent.value.length,
  });

  if (!isMarkdownDocument.value) {
    if (renderToken !== markdownRenderToken) {
      trace.end({
        aborted: true,
        stage: "non-markdown-token-mismatch",
      });
      return;
    }
    cancelPreviewEnhancements();
    hasRenderedMarkdownSnapshot = false;
    lastRenderedMarkdownSource = "";
    renderedHtml.value = "";
    tocItems.value = [];
    trace.end({
      renderToken,
      htmlLength: 0,
      tocCount: 0,
      isMarkdownDocument: false,
    });
    return;
  }

  const markedStartedAt = perfNow();
  const html = marked(markdownContent.value, { renderer });
  const markedElapsedMs = perfRound(perfNow() - markedStartedAt);
  if (renderToken !== markdownRenderToken) {
    trace.end({
      aborted: true,
      stage: "post-marked-token-mismatch",
      markedElapsedMs,
    });
    return;
  }
  hasRenderedMarkdownSnapshot = true;
  lastRenderedMarkdownSource = markdownContent.value;
  renderedHtml.value = postProcessMarkdownHtml(html);
  tocItems.value = renderedHeadingCollector.getItems();
  tocExtractor.rememberRendered(markdownContent.value, tocItems.value);
  trace.end({
    renderToken,
    markedElapsedMs,
    htmlLength: renderedHtml.value.length,
    tocCount: tocItems.value.length,
  });
  schedulePerfPaintMarks("render-markdown", trace.startedAt, {
    id: trace.id,
    renderToken,
    reason,
  });
}

// 渲染 Mermaid 图表
async function renderMermaidCharts(renderToken = markdownRenderToken, perfMeta = {}) {
  const trace = createPerfTrace("render-mermaid", {
    renderToken,
    reason: perfMeta.reason || "unknown",
    sourceTraceId: perfMeta.sourceTraceId || 0,
    backendCalls: false,
  });
  const previewRoot = previewRef.value;
  const mermaidElements = previewRoot
    ? previewRoot.querySelectorAll(".mermaid-wrapper pre.mermaid")
    : [];
  if (!mermaidElements.length) {
    trace.end({
      renderToken,
      renderedCount: 0,
      skipped: true,
    });
    return;
  }

  const mermaid = await loadMermaid(resolveMermaidThemeFromDocument());
  let renderedCount = 0;
  for (let index = 0; index < mermaidElements.length; index += 1) {
    const el = mermaidElements[index];
    if (
      renderToken !== markdownRenderToken ||
      perfMeta.queuedPass !== queuedMermaidRenderPass ||
      viewMode.value === "live"
    ) {
      trace.end({
        aborted: true,
        renderedCount,
        stage: "token-mismatch",
      });
      return;
    }
    try {
      const id = el.parentElement.getAttribute("data-mermaid-id");
      const graphDefinition = el.textContent;
      const { svg } = await mermaid.render(id, graphDefinition);
      if (
        renderToken !== markdownRenderToken ||
        perfMeta.queuedPass !== queuedMermaidRenderPass ||
        viewMode.value === "live"
      ) {
        trace.end({
          aborted: true,
          renderedCount,
          stage: "post-await-token-mismatch",
        });
        return;
      }
      el.parentElement.innerHTML = svg;
      renderedCount += 1;
    } catch (e) {
      if (
        renderToken !== markdownRenderToken ||
        perfMeta.queuedPass !== queuedMermaidRenderPass ||
        viewMode.value === "live"
      ) {
        trace.end({
          aborted: true,
          renderedCount,
          stage: "error-token-mismatch",
        });
        return;
      }
      console.warn("Mermaid 渲染失败:", e);
      el.parentElement.innerHTML = `<pre class="mermaid-error">图表渲染失败: ${e.message}</pre>`;
    }
    if (index < mermaidElements.length - 1) {
      await yieldMermaidRenderFrame();
    }
  }
  trace.end({
    renderToken,
    renderedCount,
  });
  schedulePerfPaintMarks("render-mermaid", trace.startedAt, {
    id: trace.id,
    renderToken,
    renderedCount,
  });
}

// 监听内容变化
watch(markdownContent, () => {
  perfLog("markdown-content:changed", {
    viewMode: viewMode.value,
    contentLength: markdownContent.value.length,
    backendCalls: false,
  });
  scheduleRenderMarkdown({ reason: "markdown-content-watch" });
});

watch(isMarkdownDocument, () => {
  scheduleRenderMarkdown({
    immediate: true,
    reason: "markdown-document-type-watch",
  });
});

watch(
  () => styleConfig.value.themeRoundedCorners,
  (value) => {
    if (typeof document !== "undefined") {
      document.body?.classList.toggle("theme-radius-flat", value === false);
      document.documentElement?.classList.toggle("theme-radius-flat", value === false);
    }
    if (showDesignExportModal.value || isDesignExportWindow.value) {
      applyDesignFrameUiThemeOnly();
    }
  },
  { immediate: true }
);

watch(currentTheme, () => {
  if (showDesignExportModal.value || isDesignExportWindow.value) {
    applyDesignFrameUiThemeOnly();
  }
});

watch([showToc, sidebarSection, viewMode], ([visible, section, mode]) => {
  if (mode === "live" && visible && section === "outline" && isMarkdownDocument.value) {
    scheduleTocSync({ immediate: true });
  }
});

watch([() => tocItems.value.length, hasWorkspaceFiles], ([outlineCount, hasFiles]) => {
  if (sidebarSection.value === "outline" && !outlineCount && hasFiles) {
    sidebarSection.value = "files";
  } else if (sidebarSection.value === "files" && !hasFiles && outlineCount) {
    sidebarSection.value = "outline";
  }
});

watch(filePath, async (nextPath, previousPath) => {
  if (!nextPath || nextPath === previousPath) {
    return;
  }

  if (pendingFileOpenScrollResetTimer) {
    clearTimeout(pendingFileOpenScrollResetTimer);
    pendingFileOpenScrollResetTimer = 0;
  }

  await nextTick();
  scrollDocumentToTop("auto");

  requestAnimationFrame(() => {
    scrollDocumentToTop("auto");
  });

  pendingFileOpenScrollResetTimer = window.setTimeout(() => {
    pendingFileOpenScrollResetTimer = 0;
    scrollDocumentToTop("auto");
  }, 90);
});

// 判断是否有未保存的修改
const hasChanges = computed(() => {
  return editedContent.value !== originalContent.value;
});

const hasFileConflict = computed(() => externalConflictContent.value !== null);
const hasDocumentContent = computed(() =>
  Boolean((editedContent.value || markdownContent.value || "").trim())
);

const {
  addToHistory,
  clearPendingHistorySnapshot,
  flushPendingHistorySnapshot,
  clearEditorInteractionRelief,
  clearPendingEditedContentSync,
  flushPendingEditedContentSync,
  undo,
  redo,
  resetEditedContent,
  handlePlainTextEditorInput,
  setLastEditedContent,
  replaceContentFromDisk,
} = useEditedContentFlow({
  editedContent,
  markdownContent,
  originalContent,
  editHistory,
  historyIndex,
  isExternalChange,
  isEditorInteractionReliefActive,
  viewMode,
  hasChanges,
  fileName,
  showToast,
  clearFileConflict: () => clearFileConflict(),
  createPerfTrace,
  schedulePerfPaintMarks,
  maxHistory: MAX_HISTORY,
  historySnapshotDelay: HISTORY_SNAPSHOT_DELAY,
  largeEditorOptimizationThreshold: LARGE_EDITOR_OPTIMIZATION_THRESHOLD,
  largeEditorSideEffectDelay: LARGE_EDITOR_SIDE_EFFECT_DELAY,
  hugeDocThreshold: HUGE_DOC_THRESHOLD,
  hugeEditorSideEffectDelay: HUGE_EDITOR_SIDE_EFFECT_DELAY,
  editorInteractionReliefMs: EDITOR_INTERACTION_RELIEF_MS,
});

const {
  handleEditorScroll,
  handlePreviewScroll,
  cleanupSplitScrollSync,
} = useSplitScrollSync({
  isHtmlDocument,
  editorRef,
  previewRef,
  htmlPreviewFrameRef,
});

const {
  cleanupHtmlPreviewScrollListener,
  flushLiveEditorContent,
  handleHtmlPreviewLoad,
  handleLiveEditorReady,
  scrollDocumentToTop,
  switchViewMode,
} = useViewModeController({
  viewMode,
  markdownContent,
  editedContent,
  editHistory,
  historyIndex,
  isHtmlDocument,
  isMarkdownDocument,
  editorRef,
  previewRef,
  liveEditorRef,
  liveEditSurfaceRef,
  htmlPreviewFrameRef,
  setLastEditedContent,
  clearPendingEditedContentSync,
  flushPendingEditedContentSync,
  flushPendingHistorySnapshot,
  handlePreviewScroll,
  perfNow,
  perfRound,
  perfLog,
  createPerfTrace,
  schedulePerfPaintMarks,
  cancelPreviewEnhancements,
  needsMarkdownPreviewRender,
  scheduleRenderMarkdown,
  schedulePreviewEnhancements,
  preloadLiveEditor,
});

const {
  readCurrentFileContentForDesign,
  clearFileConflict,
  markFileConflict,
  openFileConflictResolution,
  refreshCurrentFile,
  resolveFileConflictWithCurrent,
  resolveFileConflictWithExternal,
  handleFileChanged,
  startFilePolling,
  cleanupFileWatchFlow,
  isSaving,
  saveFile,
  setFileWorkspace,
  openWorkspaceFile,
  openFile,
  openDirectory,
  loadStartupFile,
  cancelDragState,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleNativeFileDrop,
} = useFileFlows({
  designSource: {
    filePath,
  },
  fileWatch: {
    externalConflictContent,
    showFileConflictModal,
    isResolvingFileConflict,
    filePath,
    fileName,
    originalContent,
    editedContent,
    hasFileConflict,
    replaceContentFromDisk,
    showToast,
  },
  fileSave: {
    viewMode,
    filePath,
    hasChanges,
    editedContent,
    originalContent,
    showToast,
    showFileConflictModal,
    flushLiveEditorContent,
    flushPendingHistorySnapshot,
    flushPendingEditedContentSync,
  },
  workspace: {
    appSettings,
    fileName,
    filePath,
    workspaceRoots,
    workspaceFileCount,
    expandedTreePaths,
    sidebarSection,
    tocItems,
    hasWorkspaceFiles,
    isLoading,
    loadingText,
    hasChanges,
    viewMode,
    replaceContentFromDisk,
    readPreference,
    scheduleTocSync,
    cancelScheduledMarkdownRender,
    renderMarkdown,
    showToast,
  },
  fileEntry: {
    isDragging,
    isLoading,
    loadingText,
    fileName,
    filePath,
    replaceContentFromDisk,
    showToast,
  },
});

function toggleTreePath(path) {
  const nextPaths = new Set(expandedTreePaths.value);
  if (nextPaths.has(path)) {
    nextPaths.delete(path);
  } else {
    nextPaths.add(path);
  }
  expandedTreePaths.value = nextPaths;
}

// 主题切换
const builtInThemes = [
  {
    id: "default",
    name: "白昼",
    description: "经典明亮阅读界面，干净、直接、对比清晰。",
    mode: "light",
    style: "minimal",
    builtIn: true,
    locked: true,
    palette: {
      background: "#ffffff",
      surface: "#f6f8fa",
      accent: "#0969da",
      text: "#24292f",
    },
  },
  {
    id: "dark",
    name: "暗夜",
    description: "深色护眼界面，适合夜间阅读和长时间编辑。",
    mode: "dark",
    style: "professional",
    builtIn: true,
    locked: true,
    palette: {
      background: "#0d1117",
      surface: "#161b22",
      accent: "#58a6ff",
      text: "#c9d1d9",
    },
  },
  {
    id: "elegant",
    name: "雅致",
    description: "仿纸质阅读质感，强调温和留白和中文阅读舒适度。",
    mode: "light",
    style: "paper",
    builtIn: true,
    locked: true,
    palette: {
      background: "#f6f1e8",
      surface: "#fffaf0",
      accent: "#8b5e34",
      text: "#2f2a24",
    },
  },
];

const {
  aiProvidersById,
  enabledSmartFormatModels,
  activeSmartFormatModel,
  stripOuterMarkdownFence,
  applySmartFormattedContent,
  isSmartFormatting,
  showSmartFormatFailure,
  showSmartFormatPrompt,
  showSmartFormatPreview,
  showSmartThemePrompt,
  isGeneratingSmartTheme,
  smartFormatRequestId,
  designSmartFormatRequestId,
  smartThemeRequestId,
  showDesignSmartFormatPrompt,
  showDesignSmartFormatPreview,
  isDesignSmartFormatting,
  designSmartFormatOriginalHtml,
  designSmartFormatCandidateHtml,
  designSmartFormatInstruction,
  smartFormatError,
  smartFormatErrorDetail,
  smartFormatRetryModelId,
  smartFormatOriginalContent,
  smartFormatCandidateContent,
  smartFormatInstruction,
  smartFormatProgressDetail,
  smartFormatProgressSteps,
  smartThemePrompt,
  smartThemes,
  smartThemePromptHistory,
  isDetailedAiLoading,
  activeAiLoadingKind,
  canCloseAiLoading,
  resetSmartFormatProgress,
  setSmartFormatProgress,
  buildSmartFormatDebugDetail,
  handleAIFormatProgress,
  closeActiveAiLoading,
  openSmartFormatPreview,
  closeSmartFormatPreview,
  confirmSmartFormatPreview,
  openSmartFormatPrompt,
  confirmSmartFormatPrompt,
  smartFormatMarkdown,
  retrySmartFormat,
  openSettingsFromSmartFormatFailure,
  openDesignSmartFormatPrompt,
  closeDesignSmartFormatPrompt,
  closeDesignSmartFormatPreview,
  confirmDesignSmartFormatPrompt,
  confirmDesignSmartFormatPreview,
  applySmartTheme,
  deleteSmartTheme,
  openSmartThemePrompt,
  confirmSmartThemePrompt,
  deleteSmartThemePromptHistoryItem,
  generateInsertContent,
} = useAiFlows({
  appSettings,
  loading: {
    isLoading,
    loadingText,
  },
  content: {
    isMarkdownDocument,
    editedContent,
    markdownContent,
    currentTheme,
  },
  design: {
    showDesignExportModal,
    isDesignExportWindow,
    readDesignFrameCurrentHtml,
    applyDesignFrameUiThemeOnly,
    applyDesignExportHtml,
  },
  theme: {
    builtInThemes,
    syncSmartThemeStyles,
    setTheme,
  },
  helpers: {
    openSettings,
    showToast,
  },
  state: {
    maxSmartFormatProgressSteps: MAX_SMART_FORMAT_PROGRESS_STEPS,
  },
  smartFormatContent: {
    clearPendingEditedContentSync,
    editedContent,
    markdownContent,
    setLastEditedContent,
    editHistory,
    addToHistory,
  },
});

function buildAiInsertPromptPresentation(request = {}) {
  const isMermaid = request.kind === "mermaid";
  const targetLabel = isMermaid ? "Mermaid 图表" : request.language ? `${request.language} 代码` : "代码块";
  return {
    eyebrow: "AI GENERATE",
    title: `生成${targetLabel}`,
    description: isMermaid
      ? "描述你想表达的流程、角色、关系或结构。AI 只生成可直接插入 Markdown 的 Mermaid 内容，不额外附带解释。"
      : "描述你要的功能、输入输出、约束或调用方式。AI 只生成可直接插入 Markdown 代码块的内容，不额外附带解释。",
    inputLabel: `${targetLabel}需求`,
    placeholder: isMermaid
      ? "例如：画一个用户提交申请、经理审批、财务付款的流程图；需要包含开始、驳回和完成节点。"
      : "例如：生成一个带错误处理的 fetch 请求函数，接收 url 和 payload，返回统一结果对象。",
    metaHint: "建议写清目标、结构、字段、步骤、输入输出或约束；生成结果会直接插入当前光标位置。",
    confirmText: "开始AI生成",
    recommendationLabel: "常用推荐",
    recommendations: isMermaid
      ? AI_INSERT_MERMAID_RECOMMENDATIONS
      : AI_INSERT_CODE_RECOMMENDATIONS,
    maxLength: AI_INSERT_PROMPT_MAX_LENGTH,
  };
}

function closeAiInsertPrompt() {
  const resolver = aiInsertPromptResolver;
  aiInsertPromptResolver = null;
  aiInsertPromptState.value = createAiInsertPromptState();
  resolver?.("");
}

async function confirmAiInsertPrompt(instruction) {
  const request = aiInsertPromptState.value.request;
  const resolver = aiInsertPromptResolver;
  aiInsertPromptResolver = null;
  aiInsertPromptState.value = createAiInsertPromptState();

  if (!request) {
    resolver?.("");
    return;
  }

  const normalizedPrompt = String(instruction || "").trim();
  console.info("[AI插入] 已确认生成需求", {
    kind: request.kind || "",
    language: request.language || "",
    promptLength: normalizedPrompt.length,
  });

  try {
    const generatedContent = await generateInsertContent({
      ...request,
      prompt: instruction,
    });
    console.info("[AI插入] 生成流程结束", {
      kind: request.kind || "",
      language: request.language || "",
      resultLength: String(generatedContent || "").length,
    });
    resolver?.(generatedContent || "");
  } catch (error) {
    console.error("[AI插入] 生成流程失败", error);
    resolver?.("");
  }
}

function requestAiInsertContentWithPrompt(request = {}) {
  if (aiInsertPromptResolver) {
    aiInsertPromptResolver("");
  }

  console.info("[AI插入] 打开生成需求弹窗", {
    kind: request.kind || "",
    language: request.language || "",
  });

  return new Promise((resolve) => {
    aiInsertPromptResolver = resolve;
    aiInsertPromptState.value = {
      ...createAiInsertPromptState(),
      ...buildAiInsertPromptPresentation(request),
      visible: true,
      request,
    };
  });
}

const themes = computed(() => [
  ...smartThemes.value.map((theme) => ({
    id: theme.id,
    name: theme.name,
  })),
  ...builtInThemes.map((theme) => ({
    id: theme.id,
    name: theme.name,
  })),
]);

const themeList = computed(() => [...smartThemes.value, ...builtInThemes]);

let smartThemeStyleElement = null;

function getSmartTheme(themeId) {
  return smartThemes.value.find((theme) => theme.id === themeId) || null;
}

function syncSmartThemeStyles() {
  if (typeof document === "undefined") {
    return;
  }

  if (!smartThemeStyleElement) {
    smartThemeStyleElement = document.getElementById("smart-theme-style");
    if (!smartThemeStyleElement) {
      smartThemeStyleElement = document.createElement("style");
      smartThemeStyleElement.id = "smart-theme-style";
      document.head.appendChild(smartThemeStyleElement);
    }
  }

  smartThemeStyleElement.textContent = createSmartThemeStyleSheet(smartThemes.value);
}

function setTheme(themeId) {
  const nextThemeId = themes.value.some((theme) => theme.id === themeId)
    ? themeId
    : "elegant";
  const smartTheme = getSmartTheme(nextThemeId);

  currentTheme.value = nextThemeId;
  isDark.value = smartTheme ? smartTheme.mode === "dark" : nextThemeId === "dark";
  document.documentElement.setAttribute("data-theme", nextThemeId);

  if (smartTheme) {
    document.documentElement.setAttribute("data-ai-theme", "true");
  } else {
    document.documentElement.removeAttribute("data-ai-theme");
  }
  applyWindowThemeAppearance({
    themeId: nextThemeId,
    smartTheme,
  });
}

watch(
  smartThemes,
  (value) => {
    saveSmartThemes(value);
    syncSmartThemeStyles();
    if (
      isSmartThemeId(currentTheme.value) &&
      !value.some((theme) => theme.id === currentTheme.value)
    ) {
      setTheme("elegant");
    }
  },
  { deep: true }
);

watch(
  smartThemePromptHistory,
  (value) => {
    saveSmartThemePromptHistory(value);
  },
  { deep: true }
);

watch(
  splitInsertMenuState,
  (state, _previousState, onCleanup) => {
    if (!state || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event) => {
      if (isSplitInsertMenuEventInside(event)) {
        return;
      }
      closeSplitInsertMenu();
    };

    const handleScroll = (event) => {
      if (isSplitInsertMenuEventInside(event)) {
        return;
      }
      closeSplitInsertMenu();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        closeSplitInsertMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", closeSplitInsertMenu);
    window.addEventListener("blur", closeSplitInsertMenu);
    window.addEventListener("keydown", handleKeydown, true);

    onCleanup(() => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", closeSplitInsertMenu);
      window.removeEventListener("blur", closeSplitInsertMenu);
      window.removeEventListener("keydown", handleKeydown, true);
    });
  },
  { flush: "post" }
);

watch(
  splitInsertMenuState,
  (state) => {
    if (!state) {
      return;
    }
    void nextTick(() => {
      syncSplitInsertMenuPosition();
    });
  },
  { flush: "post" }
);

watch(
  splitInsertSubmenuState,
  (state) => {
    if (!state) {
      return;
    }
    void nextTick(() => {
      syncSplitInsertSubmenuPosition();
    });
  },
  { flush: "post" }
);

watch(
  splitInsertNestedSubmenuState,
  (state) => {
    if (!state) {
      return;
    }
    void nextTick(() => {
      syncSplitInsertNestedSubmenuPosition();
    });
  },
  { flush: "post" }
);

watch(
  splitInsertDialogState,
  (state, _previousState, onCleanup) => {
    if (!state || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event) => {
      if (isSplitInsertDialogEventInside(event)) {
        return;
      }
      closeSplitInsertDialog();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        closeSplitInsertDialog();
      }
    };

    window.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", closeSplitInsertDialog);
    window.addEventListener("blur", closeSplitInsertDialog);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeydown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", closeSplitInsertDialog);
      window.removeEventListener("blur", closeSplitInsertDialog);
    });
  },
  { flush: "post" }
);

watch([viewMode, isMarkdownDocument], ([mode, markdownMode]) => {
  if (mode !== "split" || !markdownMode) {
    closeSplitInsertMenu();
    closeSplitInsertDialog();
  }
});

function cycleTheme() {
  const currentIndex = themes.value.findIndex((t) => t.id === currentTheme.value);
  const nextIndex = (currentIndex + 1) % themes.value.length;
  setTheme(themes.value[nextIndex].id);
}

function openSettings(section = "general") {
  settingsInitialSection.value = section === "models" ? "models" : "general";
  showSettingsModal.value = true;
}

async function refreshExternalFonts({ showLoading = false } = {}) {
  return refreshExternalFontsFromShell({ showLoading });
}

function toggleStylePanel() {
  const nextVisible = !stylePanelState.value.visible;
  stylePanelState.value.visible = nextVisible;
  stylePanelState.value.visibilityTouched = true;
  if (nextVisible) {
    refreshExternalFonts({ showLoading: true });
  }
}

function resetPluginStyles() {
  resetStyleConfig();
  showToast("样式配置已恢复为主题默认值", "success");
}

const {
  preloadDesignPage,
  releaseDesignPageResources,
  loadDesignPage,
  loadDesignExportPayload,
  getExportBaseName,
  getExportCssVars,
  collectExportStyleText,
  createExportSurface,
  createCurrentPreviewExportSurface,
  buildDesignDocumentHtml,
  clearDesignFrameSyncRetry,
  resetDesignFrameSyncState,
  syncDesignHeaderStatusFromBridgeState,
  syncDesignHeaderStatusFromFrame,
  syncDesignFrameContent,
  handleDesignFrameLoad,
  triggerDesignReset,
  setLockedDesignExportHtml,
  clearLockedDesignExportHtml,
  dismissDesignDraftPrompt,
  continueDesignDraftEditing,
  overwriteDesignDraftWithCurrentDocument,
  openDesignExportHtml,
  closeDesignExportModal,
  attachDesignWindowMessageListeners,
  detachDesignWindowMessageListeners,
  initializeDesignExportWindowStartup,
} = useDesignFlows({
  resource: {
    designPage: {
      designFrameRef,
      designFrameLoadVersion,
      designHtml,
      designLoadError,
      designExportDocumentHtml,
      designExportWindowFileName,
      releaseDesignFrameBridgeResources,
    },
    exportSurface: {
      fileName,
      previewRef,
      styleConfigVars,
      zoomLevel,
      currentTheme,
      isSmartThemeId,
      isMarkdownDocument,
      renderedHtml,
      markdownContent,
      marked,
      renderer,
      renderMarkdown,
      createCodeBlockRenderer,
      setCurrentCodeBlockRenderer(nextRenderer) {
        currentCodeBlockRenderer = nextRenderer;
      },
      postProcessMarkdownHtml,
      renderedHeadingCollector,
      mermaidIdCounter,
      markdownTableController,
      loadMermaid,
      resolveMermaidThemeFromDocument,
    },
  },
  document: {
    isDark,
    registeredFontOptions,
    editedContent,
    markdownContent,
    isHtmlDocument,
    fileName,
    currentTheme,
    styleConfig,
    isSmartThemeId,
    buildHtmlFragmentDocument,
    getHtmlPreviewBaseHref,
    looksLikeHtmlDocument,
    escapeAttribute,
    escapeHtml,
  },
  frameBridge: {
    designFrameRef,
    showDesignExportModal,
    isDesignExportWindow,
    designExportError,
    designExportDocumentHtml,
    designExportWindowFileName,
    designExportStatusText,
    designExportStatusDirty,
    isDesignSmartFormatting,
    styleConfig,
  },
  session: {
    hasDocumentContent,
    hasChanges,
    filePath,
    fileName,
    editedContent,
    markdownContent,
    isExporting,
    showDesignExportModal,
    showDesignDraftPrompt,
    showDesignHelpModal,
    showDesignSmartFormatPrompt,
    showDesignSmartFormatPreview,
    isPreparingDesignExport,
    isClosingDesignExport,
    designLoadError,
    designExportError,
    designExportDocumentHtml,
    designExportSourcePath,
    designExportBaselineHtml,
    designExportWindowFileName,
    designExportStatusText,
    designExportStatusDirty,
    designDraftPromptState,
    designSmartFormatOriginalHtml,
    designSmartFormatCandidateHtml,
    readCurrentFileContent: readCurrentFileContentForDesign,
    showToast,
  },
  windowMessaging: {
    designFrameRef,
    showDesignExportModal,
    isPreparingDesignExport,
    startupContextReady,
    designLoadError,
    designExportError,
    openDesignSmartFormatPrompt,
  },
});

const { startResizeSplit, startResizeToc, cleanupPaneResize } = usePaneResizeController({
  viewMode,
  splitContainerRef,
  splitEditorWidth,
  isResizingSplit,
  splitMinPercent,
  splitMaxPercent,
  tocWidth,
  isResizingToc,
  tocMinWidth,
  tocMaxWidth,
  browserZoomLevel,
  perfNow,
  perfRound,
  perfLog,
  schedulePerfPaintMarks,
});

const {
  syncBrowserZoomViewport,
  syncWindowMaximizedState,
  handleWindowFocus,
  handleWindowResize,
  minimizeWindow,
  toggleWindowMaximize,
  closeWindow,
  applyZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  resetBrowserZoom,
  handleBrowserZoomWheel,
  handleKeyDown,
  initializeDesktopSession,
  detachDesktopSessionListeners,
} = useRuntimeFlows({
  controls: {
    window: {
      filePath,
      zoomLevel,
      browserZoomLevel,
      browserViewportWidth,
      browserViewportHeight,
      isWindowMaximized,
      getBrowserViewportWidth,
      getBrowserViewportHeight,
      refreshCurrentFile,
      showToast,
    },
    keyboard: {
      showDesignDraftPrompt,
      dismissDesignDraftPrompt,
      showDesignHelpModal,
      showDesignExportModal,
      closeDesignExportModal,
      isDragging,
      cancelDragState,
      openFile,
      hasChanges,
      saveFile,
      viewMode,
      undo,
      redo,
    },
  },
  session: {
    startupMode,
    startupContextReady,
    isDesignExportWindow,
    initializeDesignExportWindowStartup,
    loadStartupFile,
    showWelcome,
    startFilePolling,
    handleFileChanged,
    handleNativeFileDrop,
    handleAIFormatProgress,
  },
});
// 显示欢迎内容
function showWelcome() {
  const welcomeContent = `# MD 查看器

欢迎使用 MD 查看器！

## 功能特性

- **编辑/预览**：右上角切换编辑、预览、分屏模式
- **实时同步**：分屏模式下编辑与预览同步滚动
- **图表支持**：Mermaid、Flowchart 等图表渲染
- **主题切换**：默认、暗色、雅致三种主题

## 计划任务
- [ ] 整理需求
- [ ] 联调接口
- [x] 修复目录高度问题
- [x] 补一轮自测

## 图表示例

### Mermaid 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{条件判断}
    B -->|是| C[执行操作]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
\`\`\`

### Mermaid 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 系统
    用户->>系统: 发送请求
    系统->>系统: 处理数据
    系统->>用户: 返回结果
\`\`\`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 打开文件 |
| Ctrl+S | 保存文件 |
| Ctrl+Z | 撤销 |

`;

  replaceContentFromDisk(welcomeContent);
}

function tocIndent(level) {
  return { paddingLeft: `${(level - 1) * 16 + 8}px` };
}

watch(renderedHtml, () => {
  if (viewMode.value !== "live" && isMarkdownDocument.value) {
    schedulePreviewEnhancements({
      immediate: true,
      reason: "rendered-html-watch",
    });
  }
  if (showDesignExportModal.value) {
    if (!designExportDocumentHtml.value) {
      syncDesignFrameContent();
    }
  }
});

onMounted(async () => {
  setupPerfObservers();
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousedown", startResizeTableColumn);
  document.addEventListener("dragend", cancelDragState);
  window.addEventListener("wheel", handleBrowserZoomWheel, { passive: false });
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", cancelDragState);
  window.addEventListener("drop", cancelDragState);
  window.addEventListener("resize", handleWindowResize);
  attachDesignWindowMessageListeners();
  syncBrowserZoomViewport();
  syncSmartThemeStyles();
  setTheme(currentTheme.value);
  applyZoom();
  await initializeDesktopSession();
  if (!isDesignExportWindow.value) {
    viewMode.value = DEFAULT_APP_SETTINGS.viewMode;
  }
});

onUnmounted(() => {
  teardownPerfObservers();
  releaseDesignPageResources();
  cleanupToast();
  cancelPendingPreviewImages();
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousedown", startResizeTableColumn);
  document.removeEventListener("dragend", cancelDragState);
  window.removeEventListener("wheel", handleBrowserZoomWheel);
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("blur", cancelDragState);
  window.removeEventListener("drop", cancelDragState);
  window.removeEventListener("resize", handleWindowResize);
  detachDesignWindowMessageListeners();
  cleanupPaneResize();
  cleanupTableColumnResize();
  cleanupHtmlPreviewScrollListener();
  cleanupSplitScrollSync();
  if (queuedMarkdownRenderRafId) {
    cancelAnimationFrame(queuedMarkdownRenderRafId);
    queuedMarkdownRenderRafId = 0;
  }
  if (queuedMarkdownRenderTimer) {
    clearTimeout(queuedMarkdownRenderTimer);
    queuedMarkdownRenderTimer = 0;
  }
  if (pendingFileOpenScrollResetTimer) {
    clearTimeout(pendingFileOpenScrollResetTimer);
    pendingFileOpenScrollResetTimer = 0;
  }
  cancelScheduledTocSync();
  cancelPreviewEnhancements();
  clearPendingHistorySnapshot();
  if (splitResizeRafId) {
    cancelAnimationFrame(splitResizeRafId);
    splitResizeRafId = 0;
  }
  if (tocResizeRafId) {
    cancelAnimationFrame(tocResizeRafId);
    tocResizeRafId = 0;
  }
  tableResizeState = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.body.classList.remove("theme-radius-flat");
  document.documentElement.classList.remove("theme-radius-flat");
  cleanupFileWatchFlow();
  detachDesktopSessionListeners();
});
</script>

<style>
@import "@do-md/core-react/style.css";
@import "./app.css";
</style>
