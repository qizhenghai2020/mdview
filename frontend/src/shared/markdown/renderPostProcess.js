const TASK_CHECKBOX_PATTERN = /type=(?:"|')checkbox(?:"|')/i;
const RESIZABLE_TABLE_PATTERN = /data-resizable-table=(?:"|')true(?:"|')/i;

function trimLeadingTextNode(content) {
  const firstNode = content.firstChild;
  if (firstNode?.nodeType === Node.TEXT_NODE) {
    firstNode.textContent = firstNode.textContent.replace(/^\s+/, "");
  }
}

function enhanceTaskListItems(root, doc) {
  root.querySelectorAll("li").forEach((item) => {
    const checkbox = Array.from(item.children).find(
      (child) => child.tagName === "INPUT" && child.getAttribute("type") === "checkbox"
    );
    if (!checkbox) {
      return;
    }

    const isComplete = checkbox.hasAttribute("checked");
    item.classList.add("task-list-item", isComplete ? "is-complete" : "is-pending");
    item.setAttribute("data-task-state", isComplete ? "complete" : "pending");
    checkbox.classList.add("task-list-checkbox");
    checkbox.setAttribute("aria-hidden", "true");

    if (item.parentElement && /^(?:UL|OL)$/.test(item.parentElement.tagName)) {
      item.parentElement.classList.add("task-list");
    }

    const statusBadge = doc.createElement("span");
    statusBadge.className = "task-status-badge";
    statusBadge.textContent = isComplete ? "已完成" : "待执行";

    const content = doc.createElement("div");
    content.className = "task-list-content";
    Array.from(item.childNodes)
      .filter((node) => node !== checkbox)
      .forEach((node) => content.appendChild(node));

    trimLeadingTextNode(content);
    item.appendChild(statusBadge);
    item.appendChild(content);
  });
}

function cleanupResizableTables(root) {
  root.querySelectorAll("table[data-resizable-table='true']").forEach((table) => {
    if (table.getAttribute("data-table-layout") === "persisted") {
      return;
    }

    table.querySelector("colgroup")?.remove();
    table.querySelectorAll("th[style]").forEach((cell) => {
      const nextStyle = String(cell.getAttribute("style") || "")
        .replace(/(?:^|;)\s*width\s*:\s*[^;]+;?/gi, "")
        .trim();

      if (nextStyle) {
        cell.setAttribute("style", nextStyle);
      } else {
        cell.removeAttribute("style");
      }
    });
  });
}

export function postProcessMarkdownHtml(html) {
  const normalizedHtml = String(html || "");
  if (!normalizedHtml || typeof DOMParser === "undefined") {
    return normalizedHtml;
  }

  const hasTaskList = TASK_CHECKBOX_PATTERN.test(normalizedHtml);
  const hasResizableTables = RESIZABLE_TABLE_PATTERN.test(normalizedHtml);
  if (!hasTaskList && !hasResizableTables) {
    return normalizedHtml;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div class="markdown-root">${normalizedHtml}</div>`,
    "text/html"
  );
  const root = doc.body.firstElementChild;
  if (!root) {
    return normalizedHtml;
  }

  if (hasResizableTables) {
    cleanupResizableTables(root);
  }
  if (hasTaskList) {
    enhanceTaskListItems(root, doc);
  }

  return root.innerHTML;
}

export async function resolveMarkdownImagesInContainer({
  container,
  resolveImagePath,
  readImageAsBase64,
  cache = null,
  maxValueLength = Infinity,
  maxCacheEntries = 0,
  shouldContinue = null,
}) {
  if (!container || typeof resolveImagePath !== "function" || typeof readImageAsBase64 !== "function") {
    return;
  }

  const images = Array.from(container.querySelectorAll("img"));
  for (const image of images) {
    if (typeof shouldContinue === "function" && shouldContinue() === false) {
      return;
    }

    const src = image.getAttribute("src");
    if (!src || /^(?:data:|https?:\/\/)/i.test(src)) {
      continue;
    }

    try {
      const resolvedPath = await resolveImagePath(src);
      if (typeof shouldContinue === "function" && shouldContinue() === false) {
        return;
      }

      const cacheKey = String(resolvedPath || src);
      let base64 = cache?.get(cacheKey) || "";

      if (!base64) {
        base64 = (await readImageAsBase64(resolvedPath)) || "";
        if (
          cache &&
          base64 &&
          Number.isFinite(maxValueLength) &&
          base64.length <= maxValueLength &&
          maxCacheEntries > 0
        ) {
          cache.set(cacheKey, base64);
          while (cache.size > maxCacheEntries) {
            cache.delete(cache.keys().next().value);
          }
        }
      }

      if (
        base64 &&
        image.isConnected &&
        image.getAttribute("src") === src &&
        (typeof shouldContinue !== "function" || shouldContinue() !== false)
      ) {
        image.setAttribute("src", base64);
      }
    } catch (error) {
      console.warn("图片加载失败:", src, error);
    }
  }
}
