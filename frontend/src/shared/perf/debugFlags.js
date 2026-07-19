const PERF_DEBUG_QUERY_KEY = "mdvPerf";
const PERF_DEBUG_STORAGE_KEY = "md-viewer.perf-debug";

function hasPerfDebugQuery() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URLSearchParams(window.location.search || "").get(PERF_DEBUG_QUERY_KEY) === "1";
  } catch {
    return false;
  }
}

function hasPerfDebugStorageFlag() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage?.getItem(PERF_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isPerfDebugEnabled() {
  if (import.meta.env.DEV) {
    return true;
  }

  return hasPerfDebugQuery() || hasPerfDebugStorageFlag();
}
