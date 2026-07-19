import { isPerfDebugEnabled } from "@/shared/perf/debugFlags";

export function usePerfInstrumentation({
  enabled = isPerfDebugEnabled(),
  longTaskThresholdMs = 60,
  lagThresholdMs = 120,
} = {}) {
  let perfTraceSequence = 0;
  let perfLongTaskObserver = null;
  let perfLagIntervalId = 0;
  let perfLagExpectedAt = 0;

  function perfNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function perfRound(value) {
    return Number((Number.isFinite(value) ? value : 0).toFixed(2));
  }

  function perfLog(label, payload = {}) {
    if (!enabled) {
      return;
    }

    // console.log(PERF_LOG_PREFIX, label, payload);
  }

  function createPerfTrace(label, payload = {}) {
    if (!enabled) {
      return {
        id: 0,
        label,
        startedAt: 0,
        end() {
          return 0;
        },
      };
    }

    const id = ++perfTraceSequence;
    const startedAt = perfNow();
    perfLog(`${label}:start`, { id, ...payload });
    return {
      id,
      label,
      startedAt,
      end(extra = {}) {
        const elapsedMs = perfRound(perfNow() - startedAt);
        perfLog(`${label}:end`, { id, elapsedMs, ...extra });
        return elapsedMs;
      },
    };
  }

  function schedulePerfPaintMarks(label, startedAt, payload = {}) {
    if (
      !enabled ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      perfLog(`${label}:next-frame`, {
        elapsedMs: perfRound(perfNow() - startedAt),
        ...payload,
      });
      window.requestAnimationFrame(() => {
        perfLog(`${label}:settled-frame`, {
          elapsedMs: perfRound(perfNow() - startedAt),
          ...payload,
        });
      });
    });
  }

  function setupPerfObservers() {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    perfLog("session", {
      enabled: true,
      date: new Date().toISOString().slice(0, 10),
    });

    if (typeof PerformanceObserver === "function") {
      try {
        perfLongTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= longTaskThresholdMs) {
              perfLog("main-thread:longtask", {
                durationMs: perfRound(entry.duration),
                name: entry.name || "longtask",
                startTimeMs: perfRound(entry.startTime),
              });
            }
          }
        });
        perfLongTaskObserver.observe({ entryTypes: ["longtask"] });
      } catch (error) {
        perfLog("main-thread:longtask-observer-unavailable", {
          message: String(error?.message || error || ""),
        });
      }
    }

    perfLagExpectedAt = perfNow() + 1000;
    perfLagIntervalId = window.setInterval(() => {
      const now = perfNow();
      const driftMs = now - perfLagExpectedAt;
      perfLagExpectedAt = now + 1000;
      if (driftMs >= lagThresholdMs) {
        perfLog("main-thread:lag", {
          driftMs: perfRound(driftMs),
        });
      }
    }, 1000);
  }

  function teardownPerfObservers() {
    if (perfLagIntervalId) {
      window.clearInterval(perfLagIntervalId);
      perfLagIntervalId = 0;
    }
    perfLagExpectedAt = 0;
    perfLongTaskObserver?.disconnect?.();
    perfLongTaskObserver = null;
  }

  return {
    perfNow,
    perfRound,
    perfLog,
    createPerfTrace,
    schedulePerfPaintMarks,
    setupPerfObservers,
    teardownPerfObservers,
  };
}
