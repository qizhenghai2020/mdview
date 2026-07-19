function isRemoteOrEmbeddedSource(src) {
  return /^(data:|https?:)/i.test(src || "");
}

export function createLiveEditImageLoader(resolveImagePath, readImageAsBase64) {
  if (typeof resolveImagePath !== "function" || typeof readImageAsBase64 !== "function") {
    return null;
  }

  return async (src) => {
    if (!src || isRemoteOrEmbeddedSource(src)) {
      return src;
    }

    try {
      const resolvedPath = await resolveImagePath(src);
      if (!resolvedPath || isRemoteOrEmbeddedSource(resolvedPath)) {
        return resolvedPath || src;
      }

      const base64 = await readImageAsBase64(resolvedPath);
      return base64 || src;
    } catch (error) {
      console.warn("实时编辑图片加载失败:", src, error);
      return src;
    }
  };
}
