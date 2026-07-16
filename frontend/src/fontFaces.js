import alibabaPuHuiRegularUrl from "@fontpkg/alibaba-pu-hui-ti-3-0/AlibabaPuHuiTi-3-55-Regular.ttf";
import alimamaShuHeiUrl from "@fontpkg/alimama-shu-hei-ti/AlimamaShuHeiTi-Bold.woff2";
import alimamaFangYuanUrl from "@fontpkg/alimama-fang-yuan-ti-vf/AlimamaFangYuanTiVF-Thin.woff2";

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
      font-family: "Alimama ShuHeiTi";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${alimamaShuHeiUrl}") format("woff2");
    }

    @font-face {
      font-family: "Alimama FangYuanTi VF";
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url("${alimamaFangYuanUrl}") format("woff2");
    }
  `;

  document.head.appendChild(style);
}
