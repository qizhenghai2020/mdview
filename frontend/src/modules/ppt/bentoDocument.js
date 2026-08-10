const BENTO_DOC_PATTERN = /(<script\s+type=["']application\/bento\+json["']\s+id=["']bento-doc["']\s*>)[\s\S]*?(<\/script>)/i;
const BENTO_EDITOR_SKIN_ID = "md-ppt-editor-skin";
const BENTO_EDITOR_ACCORDION_ID = "md-ppt-editor-accordion";
const BENTO_EDITOR_RUNTIME_ID = "md-ppt-editor-runtime";
const BENTO_EDITOR_AI_REGENERATE_ID = "md-ppt-editor-ai-regenerate";

// The embedded Bento runtime owns the editor DOM. Injecting a narrow visual
// layer lets generated and previously saved decks share the app's property-panel
// language without forking the bundled runtime.
const BENTO_EDITOR_SKIN = `
  :root {
    --md-ppt-panel-bg: #f6f8fb;
    --md-ppt-panel-surface: #ffffff;
    --md-ppt-panel-line: #dfe5ee;
    --md-ppt-panel-muted: #667085;
    --md-ppt-panel-ink: #1f2937;
    --md-ppt-panel-accent: #2f6feb;
    --md-ppt-panel-accent-soft: #edf4ff;
  }

  .ed-props {
    --md-ppt-control-width: 128px;
    width: clamp(286px, var(--panew, 300px), 520px);
    min-width: 286px;
    padding: 10px;
    background: var(--md-ppt-panel-bg);
    border-inline-start: 1px solid var(--md-ppt-panel-line);
    box-shadow: -8px 0 20px rgba(31, 41, 55, 0.035);
    scrollbar-color: #cbd5e1 transparent;
    scrollbar-width: thin;
  }

  .ed-props::-webkit-scrollbar { width: 8px; }
  .ed-props::-webkit-scrollbar-track { background: transparent; }
  .ed-props::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border: 2px solid var(--md-ppt-panel-bg);
    border-radius: 999px;
  }
  .ed-props::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

  .ed-props .ed-section {
    display: flex;
    align-items: center;
    min-height: 36px;
    margin: 10px 0 0;
    padding: 0 11px 0 13px;
    border: 1px solid var(--md-ppt-panel-line);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: #eef2f7;
    color: #344054;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
  }

  .ed-props .ed-section:first-child { margin-top: 0; }
  .ed-props .ed-section.closed {
    border-bottom: 1px solid var(--md-ppt-panel-line);
    border-radius: 8px;
  }
  .ed-props .ed-sec-toggle { padding-inline-start: 22px; }
  .ed-props .ed-sec-toggle::before {
    inset-inline-start: 10px;
    border-left-color: #64748b;
    opacity: 0.9;
  }
  .ed-props .ed-sec-toggle:hover { color: #1d4ed8; }

  .ed-props .ed-section-body {
    gap: 6px;
    margin: 0;
    padding: 10px;
    border: 1px solid var(--md-ppt-panel-line);
    border-top: 0;
    border-radius: 0 0 8px 8px;
    background: var(--md-ppt-panel-surface);
  }

  .ed-props .ed-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--md-ppt-control-width);
    align-items: center;
    column-gap: 8px;
    min-height: 32px;
    margin: 0;
    padding: 1px 0;
    color: var(--md-ppt-panel-ink);
    font-size: 12px;
  }
  .ed-props .ed-row > span {
    grid-column: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--md-ppt-panel-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ed-props .ed-row > :not(span) {
    grid-column: 2;
    min-width: 0;
    max-width: 100%;
  }

  .ed-props .ed-row input[type='number'],
  .ed-props .ed-row input[type='text'],
  .ed-props .ed-row select,
  .ed-props .ed-mini input,
  .ed-props .ed-series-row input[type='text'],
  .ed-props .ed-series-row select,
  .ed-props .ed-axis-range input,
  .ed-props .ed-chart-grid input {
    min-height: 30px;
    border: 1px solid #d7dee9;
    border-radius: 6px;
    background: #f8fafc;
    color: var(--md-ppt-panel-ink);
    box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
  }
  .ed-props .ed-row input[type='number'],
  .ed-props .ed-row input[type='text'],
  .ed-props .ed-row select {
    grid-column: 2;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .ed-props .ed-row input[type='color'] {
    grid-column: 2;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    height: 30px;
    padding: 2px 3px;
    border: 1px solid #d7dee9;
    border-radius: 6px;
    background: #f8fafc;
  }
  .ed-props input:focus,
  .ed-props select:focus,
  .ed-props textarea:focus {
    border-color: var(--md-ppt-panel-accent) !important;
    outline: 2px solid rgba(47, 111, 235, 0.13);
    outline-offset: 0;
    background: #ffffff !important;
  }

  .ed-props .ed-grid2 {
    grid-template-columns: 1fr;
    gap: 8px;
    margin: 2px 0 4px;
  }
  .ed-props .ed-mini {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--md-ppt-control-width);
    align-items: center;
    gap: 6px;
    width: 100%;
    color: var(--md-ppt-panel-muted);
    font-size: 11px;
  }
  .ed-props .ed-mini > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ed-props .ed-mini input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .ed-props .ed-row > .ed-coloralpha {
    grid-column: 2;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .ed-props .ed-row > input.ed-toggle {
    grid-column: 2;
    justify-self: end;
  }

  .ed-props .ed-btn {
    min-height: 28px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #475467;
    background: transparent;
    font-size: 12px;
  }
  .ed-props .ed-btn:hover {
    border-color: #cbdaf6;
    background: var(--md-ppt-panel-accent-soft);
    color: #1d4ed8;
  }
  .ed-props .ed-btn-icon {
    width: 28px;
    height: 28px;
    padding: 4px;
    border-color: #d7dee9;
    background: #ffffff;
  }
  .ed-props .ed-btn-primary {
    border-color: #2f6feb;
    background: #2f6feb;
    color: #ffffff;
  }
  .ed-props .ed-btn-primary:hover {
    border-color: #1f5fce;
    background: #1f5fce;
    color: #ffffff;
  }

  .ed-props .ed-ops {
    gap: 6px;
    margin: 2px 0 4px;
    padding-bottom: 7px;
    border-bottom: 1px solid #edf0f4;
  }
  .ed-props .ed-hint {
    margin-top: 2px;
    padding: 8px 10px;
    border: 1px solid #e1e8f5;
    border-inline-start: 3px solid #8fb4ee;
    border-radius: 6px;
    background: #f5f8fd;
    color: #5b687a;
    font-size: 11px;
  }
  .ed-props .ed-notes,
  .ed-props .ed-chart-json {
    min-height: 108px;
    border: 1px solid #d7dee9;
    border-radius: 6px;
    background: #f8fafc;
    color: var(--md-ppt-panel-ink);
  }
  .ed-props .ed-coloralpha {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px;
    gap: 6px;
    width: var(--md-ppt-control-width);
  }
  .ed-props .ed-coloralpha input[type='color'],
  .ed-props .ed-coloralpha input[type='number'] {
    width: 100%;
    height: 30px;
    min-height: 30px;
    border: 1px solid #d7dee9;
    border-radius: 6px;
    background: #f8fafc;
  }
  .ed-props input.ed-toggle { accent-color: var(--md-ppt-panel-accent); }
  .ed-props .ed-arrange-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    margin: 4px 0 8px;
  }
  .ed-props .ed-arrange-row .ed-arrange-cap {
    grid-column: 1 / -1;
    width: auto;
    color: #667085;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
  }
  .ed-props .ed-arrange-row .ed-arrange-btn {
    min-width: 0;
    min-height: 29px;
    padding: 4px 3px;
    border-color: #d7dee9;
    background: #ffffff;
    color: #475467;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }
  .ed-props .ed-arrange-row .ed-arrange-btn:hover {
    border-color: #8fb4ee;
    background: var(--md-ppt-panel-accent-soft);
    color: #1d4ed8;
  }

  @media (max-width: 720px) {
    .ed-props {
      width: min(92vw, 320px);
      min-width: 0;
      padding: 9px;
      box-shadow: -10px 0 28px rgba(15, 23, 42, 0.14);
    }
  }
`;

const BENTO_EDITOR_ACCORDION = `
  (() => {
    const STORAGE_KEY = "bento-panel-open";

    function readOpenState() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch {
        return {};
      }
    }

    function persistOpenState(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // A blocked storage area should not prevent property editing.
      }
    }

    function collapseOtherSections(activeSection) {
      const panel = activeSection.closest(".ed-props");
      if (!panel) return;

      const state = readOpenState();
      for (const section of panel.querySelectorAll(".ed-section.ed-sec-toggle")) {
        const key = String(section.textContent || "").trim();
        if (section === activeSection) {
          if (key) state[key] = true;
          continue;
        }
        section.classList.add("closed");
        const body = section.nextElementSibling;
        if (body?.classList.contains("ed-section-body")) {
          body.style.display = "none";
        }
        if (key) state[key] = false;
      }
      persistOpenState(state);
    }

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const section = event.target.closest(".ed-props .ed-section.ed-sec-toggle");
      if (!section) return;

      // Bento toggles the selected header in its own click handler. Run after
      // that handler so clicking an already-open section still simply closes it.
      queueMicrotask(() => {
        if (!section.classList.contains("closed")) {
          collapseOtherSections(section);
        }
      });
    });
  })();
`;

const BENTO_EDITOR_AI_REGENERATE = `
  (() => {
    const BUTTON_SELECTOR = "[data-md-ppt-ai-regenerate]";
    const REFRESH_KEY = "__mdPptRefreshAiRegenerate";
    const CLICK_HANDLER_KEY = "__mdPptAiRegenerateClickBound";
    let requestSequence = 0;

    function requestPayload() {
      const activeThumb = document.querySelector(".ed-thumb.active");
      const slideIndex = Number(activeThumb?.dataset.index ?? -1);
      const slide = window.bento?.doc?.slides?.[slideIndex];
      if (!slide || !Number.isInteger(slideIndex) || slideIndex < 0) return null;
      return {
        type: "md-ppt-regenerate-slide",
        requestId: "ppt-slide-" + Date.now().toString(36) + "-" + (++requestSequence).toString(36),
        slideIndex,
        slide: JSON.parse(JSON.stringify(slide)),
      };
    }

    function requestRegeneration() {
      const payload = requestPayload();
      if (payload) window.parent?.postMessage(payload, "*");
    }

    function installClickHandler() {
      if (window[CLICK_HANDLER_KEY]) return;
      window[CLICK_HANDLER_KEY] = true;
      // Bento may replace its top bar after a document update. Delegating from
      // document keeps the current visible button functional on every reopen.
      document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest(BUTTON_SELECTOR);
        if (!button || !document.documentElement.contains(button)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        requestRegeneration();
      }, true);
    }

    function installAiRegenerateButton() {
      if (!document.body) return;
      const buttons = Array.from(document.querySelectorAll(".ed-topbar .ed-btn"));
      const commentButton = buttons.find((button) => /评论|comment/i.test(String(button.textContent || "") + " " + String(button.title || "")));
      if (!commentButton) return;

      let button = document.querySelector(".ed-topbar " + BUTTON_SELECTOR);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "ed-btn md-ppt-ai-regenerate";
        button.dataset.mdPptAiRegenerate = "true";
        button.innerHTML = "<span>AI 重新生成</span>";
      }
      button.title = "AI 重新生成当前页";
      button.setAttribute("aria-label", "AI 重新生成当前页");
      const label = button.querySelector("span");
      if (label) label.textContent = "AI 重新生成";
      if (button.previousElementSibling !== commentButton) commentButton.after(button);
    }

    window[REFRESH_KEY] = () => {
      installClickHandler();
      installAiRegenerateButton();
    };
    window.addEventListener("load", window[REFRESH_KEY]);
    window.setTimeout(window[REFRESH_KEY], 100);
  })();
`;

// Kept outside the Bento bundle so it also repairs presentations generated by
// earlier app versions. It only touches editor/presenter chrome, never slide
// content authored by the user.
const BENTO_EDITOR_RUNTIME = `
  (() => {
    const READY_EVENT = "md-ppt-editor-ready";
    const REVEAL_HELP_TEXT = {
      "Keyboard Shortcuts": "快捷键说明",
      "KEY": "按键",
      "ACTION": "功能",
      "Next slide": "下一页",
      "Previous slide": "上一页",
      "Navigate left": "向左切换",
      "Navigate right": "向右切换",
      "Navigate up": "向上切换",
      "Navigate down": "向下切换",
      "Navigate without fragments": "跳过动画切换",
      "Jump to first/last slide": "跳转到首页或末页",
      "Pause": "暂停",
      "Fullscreen": "全屏",
      "Jump to slide": "跳转至指定页",
      "Slide overview": "幻灯片概览"
    };
    const ARRANGE_GROUPS = [
      { keys: ["Align", "对齐"], label: "对齐", buttons: ["左对齐", "水平居中", "右对齐", "顶端对齐", "垂直居中", "底端对齐"] },
      { keys: ["Space", "间距"], label: "间距", buttons: ["横向等距", "纵向等距", "统一宽度", "统一高度"] },
      { keys: ["Order", "层级"], label: "层级", buttons: ["置于顶层", "上移一层", "下移一层", "置于底层"] }
    ];
    let bridgePublished = false;
    let refreshQueued = false;
    let presentFullscreenActive = false;

    function syncPresentFullscreen() {
      const active = Boolean(document.querySelector(".bento-present-overlay"));
      if (active === presentFullscreenActive) return;
      presentFullscreenActive = active;
      window.parent?.postMessage({
        type: active
          ? "md-ppt-enter-present-fullscreen"
          : "md-ppt-exit-present-fullscreen",
      }, "*");
    }

    function thumbnailDeleteTarget(target) {
      if (!(target instanceof Element)) return null;
      const button = target.closest(".ed-thumb-tools .ed-btn");
      const tools = button?.parentElement;
      if (!button || !tools?.classList.contains("ed-thumb-tools")) return null;

      // Bento renders duplicate first and delete second in each thumbnail.
      // Keep this detection structural so it works with both its English and
      // Chinese locale labels.
      const buttons = Array.from(tools.querySelectorAll(".ed-btn"));
      if (buttons[1] !== button) return null;

      const thumb = tools.closest(".ed-thumb");
      const index = Number(thumb?.dataset.index);
      const slide = window.bento?.doc?.slides?.[index];
      if (!slide || !Number.isInteger(index) || index < 0) return null;
      return { id: String(slide.id || ""), index };
    }

    function stripRuntimeCollaboration(document) {
      if (document && typeof document === "object") {
        delete document.collab;
      }
      return document;
    }

    function showRuntimeToast(message) {
      document.querySelector(".ed-toast")?.remove();
      const toast = document.createElement("div");
      toast.className = "ed-toast";
      toast.textContent = message;
      document.body.appendChild(toast);
      window.setTimeout(() => toast.classList.add("show"), 0);
      window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 300);
      }, 2200);
    }

    function canDeleteThumbnail(document, slideID) {
      const slides = Array.isArray(document?.slides) ? document.slides : [];
      const target = slides.find((slide) => slide?.id === slideID);
      if (!target) return false;

      return slides.some((slide) => !slide?.stateOf && slide?.id !== slideID);
    }

    function deleteThumbnail(target) {
      const bridge = window.bento;
      const currentDocument = bridge?.doc;
      const slides = Array.isArray(currentDocument?.slides) ? currentDocument.slides : [];
      const index = slides[target.index]?.id === target.id
        ? target.index
        : slides.findIndex((slide) => slide?.id === target.id);
      if (!bridge?.loadDoc || index < 0) return false;

      if (!canDeleteThumbnail(currentDocument, target.id)) {
        showRuntimeToast("至少需要保留一页幻灯片");
        return true;
      }

      const targetSlide = slides[index];
      const dependentStates = slides.filter((slide) => slide?.stateOf === target.id);
      const removedIDs = new Set([target.id, ...dependentStates.map((slide) => slide.id)]);
      let linkedElements = 0;
      for (const slide of slides) {
        if (!slide || removedIDs.has(slide.id) || !Array.isArray(slide.elements)) continue;
        for (const element of slide.elements) {
          if (element?.link && removedIDs.has(element.link)) linkedElements += 1;
        }
      }
      if (dependentStates.length || linkedElements) {
        const parts = [
          dependentStates.length ? String(dependentStates.length) + " 个交互状态会一起删除" : "",
          linkedElements ? String(linkedElements) + " 个元素链接会被清除" : "",
        ].filter(Boolean).join("；");
        const title = targetSlide?.name || "当前幻灯片";
        if (!window.confirm("删除“" + title + "”？" + (parts ? "\\n" + parts : ""))) return true;
      }

      const nextDocument = stripRuntimeCollaboration(JSON.parse(JSON.stringify(currentDocument)));
      nextDocument.slides = nextDocument.slides.filter((slide) => !removedIDs.has(slide?.id));
      for (const slide of nextDocument.slides) {
        if (!Array.isArray(slide?.elements)) continue;
        for (const element of slide.elements) {
          if (element?.link && removedIDs.has(element.link)) delete element.link;
        }
      }
      if (!bridge.loadDoc(JSON.stringify(nextDocument))) return false;

      // loadDoc intentionally resets Bento's active page. Restore the same
      // post-delete selection that its native delete command uses.
      const nextIndex = Math.min(index, nextDocument.slides.length - 1);
      window.setTimeout(() => {
        document.querySelector('.ed-thumb[data-index="' + nextIndex + '"]')?.click();
      }, 0);
      return true;
    }

    function handleThumbnailDelete(event) {
      const target = thumbnailDeleteTarget(event.target);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      deleteThumbnail(target);
      scheduleRefresh();
    }

    try {
      localStorage.setItem("bento-lang", "zh-Hans");
      localStorage.setItem("bento-offline", "on");
    } catch {
      // The bundled editor still falls back to its own Chinese catalog.
    }

    function setText(node, value) {
      if (node && node.textContent !== value) node.textContent = value;
    }

    function localizeExportButton() {
      const buttons = Array.from(document.querySelectorAll(".ed-topbar .ed-group-right .ed-btn"));
      const button = buttons.find((candidate) => candidate.querySelector(".ed-dirty")) || buttons.find((candidate) => {
        const text = String(candidate.textContent || "") + " " + String(candidate.title || "");
        return /(?:^|\s)(?:Save|Export)(?:\s|$)|保存|导出/i.test(text);
      });
      const label = button?.querySelector("span");
      if (!button) return;
      if (label) setText(label, "导出");
      button.title = "导出当前演示文稿";
      button.setAttribute("aria-label", "导出");
      button.hidden = false;
      button.removeAttribute("aria-hidden");
    }

    function localizeArrangeRows() {
      for (const row of document.querySelectorAll(".ed-props .ed-arrange-row")) {
        const caption = row.querySelector(".ed-arrange-cap");
        const group = ARRANGE_GROUPS.find((item) => item.keys.includes(String(caption?.textContent || "").trim()));
        if (!caption || !group) continue;
        setText(caption, group.label);
        const buttons = Array.from(row.querySelectorAll(".ed-arrange-btn"));
        buttons.forEach((button, index) => {
          const label = group.buttons[index];
          if (!label) return;
          setText(button, label);
          button.title = label;
          button.setAttribute("aria-label", label);
        });
      }
    }

    function localizeRevealHelp() {
      for (const overlay of document.querySelectorAll(".r-overlay-help")) {
        const walker = document.createTreeWalker(overlay, NodeFilter.SHOW_TEXT);
        const changes = [];
        let node;
        while ((node = walker.nextNode())) {
          const key = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
          const translated = REVEAL_HELP_TEXT[key];
          if (translated) changes.push([node, translated]);
        }
        changes.forEach(([textNode, translated]) => { textNode.nodeValue = translated; });
      }
    }

    function installSlideReplacement(bridge) {
      if (bridge.replaceCurrentSlide || typeof bridge.mergeGeneratedDoc !== "function") return;
      bridge.replaceCurrentSlide = (slide, index) => {
        const document = bridge.doc;
        const slideIndex = Number(index);
        const target = document?.slides?.[slideIndex];
        if (!target || !slide || typeof slide !== "object") return false;
        const replacement = JSON.parse(JSON.stringify(slide));
        replacement.id = target.id;
        const nextDocument = JSON.parse(JSON.stringify(document));
        nextDocument.slides[slideIndex] = replacement;
        return bridge.mergeGeneratedDoc(JSON.stringify(nextDocument), [target.id]) !== null;
      };
    }

    function publishBridge() {
      const bridge = window.bento;
      if (!bridge?.serialize) return false;
      installSlideReplacement(bridge);
      window.__mdPptBento = bridge;
      if (!bridgePublished) {
        bridgePublished = true;
        window.dispatchEvent(new Event(READY_EVENT));
      }
      return true;
    }

    function refreshChrome() {
      refreshQueued = false;
      publishBridge();
      window.__mdPptRefreshAiRegenerate?.();
      localizeExportButton();
      localizeArrangeRows();
      localizeRevealHelp();
      syncPresentFullscreen();
    }

    function scheduleRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      // Run after Bento's own event handlers have updated the toolbar or
      // presentation overlay. A mutation observer here can continuously
      // retrigger itself when the AI button is inserted or moved.
      window.setTimeout(refreshChrome, 0);
    }

    function publishWhenReady(attempt = 0) {
      if (publishBridge() || attempt >= 240) return;
      window.setTimeout(() => publishWhenReady(attempt + 1), 50);
    }

    function startChrome() {
      refreshChrome();
      publishWhenReady();
    }

    document.addEventListener("click", scheduleRefresh, true);
    document.addEventListener("click", handleThumbnailDelete, true);
    document.addEventListener("pointerup", scheduleRefresh, true);
    document.addEventListener("change", scheduleRefresh, true);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startChrome, { once: true });
    } else {
      startChrome();
    }
    window.addEventListener("load", scheduleRefresh, { once: true });
  })();
`;

function upsertBentoHeadBlock(source, tagName, id, content) {
  const block = `<${tagName} id="${id}">${content}</${tagName}>`;
  const pattern = new RegExp(`<${tagName}\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/${tagName}>`, "i");
  return pattern.test(source)
    ? source.replace(pattern, block)
    : source.replace(/<\/head>/i, `${block}</head>`);
}

function applyBentoEditorSkin(html) {
  let source = String(html || "");
  source = upsertBentoHeadBlock(source, "style", BENTO_EDITOR_SKIN_ID, BENTO_EDITOR_SKIN);
  source = upsertBentoHeadBlock(source, "script", BENTO_EDITOR_ACCORDION_ID, BENTO_EDITOR_ACCORDION);
  source = upsertBentoHeadBlock(source, "script", BENTO_EDITOR_AI_REGENERATE_ID, BENTO_EDITOR_AI_REGENERATE);
  source = upsertBentoHeadBlock(source, "script", BENTO_EDITOR_RUNTIME_ID, BENTO_EDITOR_RUNTIME);
  return source;
}

function canonicalizeTextElements(document) {
  for (const slide of Array.isArray(document?.slides) ? document.slides : []) {
    for (const element of Array.isArray(slide?.elements) ? slide.elements : []) {
      if (!element || element.type !== "text") continue;
      let html = typeof element.html === "string" ? element.html : "";
      if (!html.trim()) {
        for (const key of ["content", "text", "value", "label"]) {
          if (typeof element[key] === "string" && element[key].trim()) {
            html = element[key];
            break;
          }
        }
      }
      element.html = html;
      delete element.content;
      delete element.text;
      delete element.value;
      delete element.label;
    }
  }
  return document;
}

function stripBentoRuntimeState(document) {
  if (document && typeof document === "object") {
    delete document.collab;
  }
  return document;
}

export function normalizeBentoJson(jsonText) {
  const parsed = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
  return JSON.stringify(stripBentoRuntimeState(canonicalizeTextElements(parsed)));
}

export function createBentoHtml(shellHtml, jsonText) {
  const safeJson = normalizeBentoJson(jsonText).replace(/</g, "\\u003c");
  const source = applyBentoEditorSkin(shellHtml);
  if (!BENTO_DOC_PATTERN.test(source)) {
    throw new Error("PPT 编辑器壳缺少 Bento 文档数据块");
  }
  return source.replace(BENTO_DOC_PATTERN, `$1${safeJson}$2`);
}

export function extractBentoJson(html) {
  const match = String(html || "").match(BENTO_DOC_PATTERN);
  if (!match) {
    return "";
  }
  return String(match[0].replace(match[1], "").replace(match[2], "")).trim();
}

export function repairBentoHtml(html, fallbackShell = "") {
  const source = String(html || "");
  const jsonText = extractBentoJson(source);
  if (!jsonText) return source;

  // Keep document data but always use the current static shell. Besides
  // avoiding WebView2's blocked import(blob:) path, this prevents an earlier
  // embedded Bento runtime from reintroducing stale toolbar or bridge logic.
  const shell = fallbackShell && BENTO_DOC_PATTERN.test(fallbackShell)
    ? fallbackShell
    : source;
  return createBentoHtml(shell, jsonText);
}

export function collectMarkdownAssets(markdown) {
  const source = String(markdown || "");
  const assets = [];
  const pattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  for (const match of source.matchAll(pattern)) {
    const url = String(match[1] || "").trim();
    if (url && !assets.includes(url)) {
      assets.push(url);
    }
    if (assets.length >= 80) {
      break;
    }
  }
  return assets;
}

export async function sha256Hex(value) {
  const input = String(value || "");
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}${"0".repeat(56)}`;
}
