import alibabaPuHuiRegularUrl from "@fontpkg/alibaba-pu-hui-ti-3-0/AlibabaPuHuiTi-3-55-Regular.ttf";
import notoSansScRegularUrl from "@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2";
import notoSansScBoldUrl from "@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff2";
import notoSerifScRegularUrl from "@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2";
import notoSerifScBoldUrl from "@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-700-normal.woff2";

const FONT_STYLE_ELEMENT_ID = "md-viewer-bundled-font-faces";

export function registerBundledFontFaces() {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(FONT_STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = FONT_STYLE_ELEMENT_ID;
  style.textContent = `
    @font-face {
      font-family: "Alibaba PuHuiTi 3.0";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${alibabaPuHuiRegularUrl}") format("truetype");
    }

    @font-face {
      font-family: "Noto Sans SC";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${notoSansScRegularUrl}") format("woff2");
    }

    @font-face {
      font-family: "Noto Sans SC";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${notoSansScBoldUrl}") format("woff2");
    }

    @font-face {
      font-family: "Noto Serif SC";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${notoSerifScRegularUrl}") format("woff2");
    }

    @font-face {
      font-family: "Noto Serif SC";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${notoSerifScBoldUrl}") format("woff2");
    }
  `;

  document.head.appendChild(style);
}
