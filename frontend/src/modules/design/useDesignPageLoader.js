import designPageAssetUrl from "./html-designer.html?url";

const DEFAULT_DESIGN_EXPORT_FILE_NAME = "markdown-preview.html";
const DESIGN_PAGE_FALLBACK_PATH = "D:/www/htmltool2/index.html";
let bundledDesignPageHtmlPromise = null;

async function readBundledDesignPageHtml() {
  if (!bundledDesignPageHtmlPromise) {
    bundledDesignPageHtmlPromise = fetch(designPageAssetUrl, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      })
      .then((html) => String(html || ""))
      .catch((error) => {
        bundledDesignPageHtmlPromise = null;
        throw error;
      });
  }

  return await bundledDesignPageHtmlPromise;
}

export function useDesignPageLoader({
  designFrameRef,
  designFrameLoadVersion,
  designHtml,
  designLoadError,
  designExportDocumentHtml,
  designExportWindowFileName,
  releaseDesignFrameBridgeResources,
  resourceShell,
}) {
  function releaseDesignPageResources() {
    releaseDesignFrameBridgeResources();
    designFrameRef.value = null;
    designHtml.value = "";
    designLoadError.value = "";
    designFrameLoadVersion.value = 0;
  }

  async function preloadDesignPage() {
    try {
      await readBundledDesignPageHtml();
    } catch (error) {
      console.warn("预热内置 HTML 设计器模板失败:", error);
    }
  }

  async function loadDesignPage(force = false) {
    if (!force && (designHtml.value || designLoadError.value)) {
      return;
    }

    try {
      designLoadError.value = "";
      let templateHtml = "";
      try {
        templateHtml = await readBundledDesignPageHtml();
      } catch (error) {
        console.warn("加载内置 HTML 设计器模板失败，尝试回退到磁盘文件:", error);
      }

      if (!templateHtml.trim() && resourceShell?.available) {
        templateHtml = await resourceShell.readTextFileContent(DESIGN_PAGE_FALLBACK_PATH);
      }
      if (!templateHtml.trim()) {
        throw new Error("内置 HTML 设计器模板为空");
      }

      designHtml.value = String(templateHtml || "");
      designFrameLoadVersion.value += 1;
    } catch (error) {
      designHtml.value = "";
      designLoadError.value = `设计页面读取失败：${error?.message || error}`;
      console.warn("设计页面读取失败:", error);
    }
  }

  async function loadDesignExportPayload() {
    if (!resourceShell?.available) {
      throw new Error("当前环境不支持读取设计导出载荷");
    }

    const payloadPath = await resourceShell.getDesignExportPayloadPath();
    if (!payloadPath) {
      throw new Error("未找到设计导出载荷");
    }

    const payloadText = await resourceShell.readTextFileContent(payloadPath);
    let payload = null;
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      throw new Error(`设计导出载荷解析失败：${error?.message || error}`);
    }

    const html = String(payload?.html || "");
    if (!html.trim()) {
      throw new Error("设计导出内容为空");
    }

    designExportDocumentHtml.value = html;
    designExportWindowFileName.value = String(
      payload?.fileName || DEFAULT_DESIGN_EXPORT_FILE_NAME
    );
  }

  return {
    preloadDesignPage,
    releaseDesignPageResources,
    loadDesignPage,
    loadDesignExportPayload,
  };
}
