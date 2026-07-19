function buildResizePerfState(perfNow) {
  const startedAt = perfNow()
  return {
    startedAt,
    moveCount: 0,
    flushCount: 0,
    lastMoveAt: 0,
    lastRafScheduledAt: startedAt,
    maxEventGapMs: 0,
    maxFlushMs: 0,
    maxRafDelayMs: 0,
  }
}

export function usePaneResizeController({
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
}) {
  let splitResizeContainerLeft = 0
  let splitResizeContainerWidth = 0
  let splitResizeRafId = 0
  let splitPendingWidth = splitEditorWidth.value
  let splitLastAppliedWidth = splitEditorWidth.value
  let splitResizePerf = null

  let tocSidebarEl = null
  let tocResizeLeft = 0
  let tocResizeRafId = 0
  let tocPendingWidth = tocWidth.value
  let tocLastAppliedWidth = tocWidth.value
  let tocResizePerf = null

  function setResizeCursor(active) {
    if (typeof document === "undefined") {
      return
    }
    document.body.style.cursor = active ? "col-resize" : ""
    document.body.style.userSelect = active ? "none" : ""
  }

  function clearSplitResizeListeners() {
    if (typeof document === "undefined") {
      return
    }
    document.removeEventListener("mousemove", handleResizeSplit)
    document.removeEventListener("mouseup", stopResizeSplit)
  }

  function clearTocResizeListeners() {
    if (typeof document === "undefined") {
      return
    }
    document.removeEventListener("mousemove", handleResizeToc)
    document.removeEventListener("mouseup", stopResizeToc)
  }

  function clampSplitEditorWidth(value) {
    return Math.min(splitMaxPercent, Math.max(splitMinPercent, value))
  }

  function flushPendingSplitWidth() {
    const flushStartedAt = perfNow()
    splitResizeRafId = 0
    if (!splitContainerRef.value) {
      return
    }

    splitContainerRef.value.style.setProperty("--split-editor-width", `${splitPendingWidth}%`)
    splitLastAppliedWidth = splitPendingWidth
    if (!splitResizePerf) {
      return
    }

    splitResizePerf.flushCount += 1
    const flushElapsedMs = perfRound(perfNow() - flushStartedAt)
    const rafDelayMs = perfRound(flushStartedAt - splitResizePerf.lastRafScheduledAt)
    splitResizePerf.maxFlushMs = Math.max(splitResizePerf.maxFlushMs, flushElapsedMs)
    splitResizePerf.maxRafDelayMs = Math.max(splitResizePerf.maxRafDelayMs, rafDelayMs)
    if (flushElapsedMs >= 4 || rafDelayMs >= 24) {
      perfLog("split-resize:flush", {
        flushElapsedMs,
        rafDelayMs,
        pendingWidth: splitPendingWidth,
      })
    }
  }

  function startResizeSplit(event) {
    event.preventDefault()

    if (viewMode.value !== "split" || !splitContainerRef.value) {
      return
    }

    const rect = splitContainerRef.value.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }

    isResizingSplit.value = true
    splitResizeContainerLeft = rect.left
    splitResizeContainerWidth = rect.width
    splitPendingWidth = splitEditorWidth.value
    splitLastAppliedWidth = splitEditorWidth.value
    splitResizePerf = buildResizePerfState(perfNow)
    perfLog("split-resize:start", {
      startWidthPercent: splitEditorWidth.value,
      containerWidthPx: perfRound(rect.width),
      backendCalls: false,
    })
    document.addEventListener("mousemove", handleResizeSplit)
    document.addEventListener("mouseup", stopResizeSplit)
    setResizeCursor(true)
  }

  function handleResizeSplit(event) {
    if (!isResizingSplit.value || !splitContainerRef.value || splitResizeContainerWidth <= 0) {
      return
    }

    if (splitResizePerf) {
      const now = perfNow()
      splitResizePerf.moveCount += 1
      if (splitResizePerf.lastMoveAt) {
        splitResizePerf.maxEventGapMs = Math.max(
          splitResizePerf.maxEventGapMs,
          perfRound(now - splitResizePerf.lastMoveAt)
        )
      }
      splitResizePerf.lastMoveAt = now
    }

    const nextWidth = Number(
      clampSplitEditorWidth(
        ((event.clientX - splitResizeContainerLeft) / splitResizeContainerWidth) * 100
      ).toFixed(2)
    )
    if (nextWidth === splitPendingWidth) {
      return
    }

    splitPendingWidth = nextWidth
    if (!splitResizeRafId) {
      if (splitResizePerf) {
        splitResizePerf.lastRafScheduledAt = perfNow()
      }
      splitResizeRafId = requestAnimationFrame(flushPendingSplitWidth)
    }
  }

  function stopResizeSplit() {
    if (!isResizingSplit.value) {
      clearSplitResizeListeners()
      return
    }

    isResizingSplit.value = false
    if (splitResizeRafId) {
      cancelAnimationFrame(splitResizeRafId)
      flushPendingSplitWidth()
    }
    clearSplitResizeListeners()
    if (!isResizingToc.value) {
      setResizeCursor(false)
    }
    splitEditorWidth.value = splitLastAppliedWidth
    if (splitResizePerf) {
      perfLog("split-resize:end", {
        durationMs: perfRound(perfNow() - splitResizePerf.startedAt),
        moveCount: splitResizePerf.moveCount,
        flushCount: splitResizePerf.flushCount,
        maxEventGapMs: splitResizePerf.maxEventGapMs,
        maxFlushMs: splitResizePerf.maxFlushMs,
        maxRafDelayMs: splitResizePerf.maxRafDelayMs,
        finalWidthPercent: splitLastAppliedWidth,
        backendCalls: false,
      })
      schedulePerfPaintMarks("split-resize", splitResizePerf.startedAt, {
        finalWidthPercent: splitLastAppliedWidth,
      })
      splitResizePerf = null
    }
    splitResizeContainerLeft = 0
    splitResizeContainerWidth = 0
  }

  function flushPendingTocWidth() {
    const flushStartedAt = perfNow()
    tocResizeRafId = 0
    if (!tocSidebarEl) {
      return
    }

    tocSidebarEl.style.width = `${tocPendingWidth}px`
    tocLastAppliedWidth = tocPendingWidth
    if (!tocResizePerf) {
      return
    }

    tocResizePerf.flushCount += 1
    const flushElapsedMs = perfRound(perfNow() - flushStartedAt)
    const rafDelayMs = perfRound(flushStartedAt - tocResizePerf.lastRafScheduledAt)
    tocResizePerf.maxFlushMs = Math.max(tocResizePerf.maxFlushMs, flushElapsedMs)
    tocResizePerf.maxRafDelayMs = Math.max(tocResizePerf.maxRafDelayMs, rafDelayMs)
    if (flushElapsedMs >= 4 || rafDelayMs >= 24) {
      perfLog("toc-resize:flush", {
        flushElapsedMs,
        rafDelayMs,
        pendingWidthPx: tocPendingWidth,
      })
    }
  }

  function startResizeToc(event) {
    event.preventDefault()
    tocSidebarEl = document.querySelector(".toc-sidebar")
    if (!tocSidebarEl) {
      return
    }

    const rect = tocSidebarEl.getBoundingClientRect()
    isResizingToc.value = true
    tocResizeLeft = rect.left
    tocPendingWidth = tocWidth.value
    tocLastAppliedWidth = tocWidth.value
    tocResizePerf = buildResizePerfState(perfNow)
    perfLog("toc-resize:start", {
      startWidthPx: tocWidth.value,
      sidebarWidthPx: perfRound(rect.width),
      backendCalls: false,
    })
    document.addEventListener("mousemove", handleResizeToc)
    document.addEventListener("mouseup", stopResizeToc)
    setResizeCursor(true)
  }

  function handleResizeToc(event) {
    if (!isResizingToc.value || !tocSidebarEl) {
      return
    }

    if (tocResizePerf) {
      const now = perfNow()
      tocResizePerf.moveCount += 1
      if (tocResizePerf.lastMoveAt) {
        tocResizePerf.maxEventGapMs = Math.max(
          tocResizePerf.maxEventGapMs,
          perfRound(now - tocResizePerf.lastMoveAt)
        )
      }
      tocResizePerf.lastMoveAt = now
    }

    const scale = browserZoomLevel.value / 100 || 1
    const nextWidth = Math.round((event.clientX - tocResizeLeft) / scale)
    if (nextWidth < tocMinWidth || nextWidth > tocMaxWidth || nextWidth === tocPendingWidth) {
      return
    }

    tocPendingWidth = nextWidth
    if (!tocResizeRafId) {
      if (tocResizePerf) {
        tocResizePerf.lastRafScheduledAt = perfNow()
      }
      tocResizeRafId = requestAnimationFrame(flushPendingTocWidth)
    }
  }

  function stopResizeToc() {
    if (!isResizingToc.value) {
      clearTocResizeListeners()
      return
    }

    isResizingToc.value = false
    if (tocResizeRafId) {
      cancelAnimationFrame(tocResizeRafId)
      flushPendingTocWidth()
    }
    clearTocResizeListeners()
    if (!isResizingSplit.value) {
      setResizeCursor(false)
    }
    if (tocSidebarEl) {
      tocWidth.value = tocLastAppliedWidth
    }
    tocSidebarEl = null
    tocResizeLeft = 0
    if (tocResizePerf) {
      perfLog("toc-resize:end", {
        durationMs: perfRound(perfNow() - tocResizePerf.startedAt),
        moveCount: tocResizePerf.moveCount,
        flushCount: tocResizePerf.flushCount,
        maxEventGapMs: tocResizePerf.maxEventGapMs,
        maxFlushMs: tocResizePerf.maxFlushMs,
        maxRafDelayMs: tocResizePerf.maxRafDelayMs,
        finalWidthPx: tocLastAppliedWidth,
        backendCalls: false,
      })
      schedulePerfPaintMarks("toc-resize", tocResizePerf.startedAt, {
        finalWidthPx: tocLastAppliedWidth,
      })
      tocResizePerf = null
    }
  }

  function cleanupPaneResize() {
    stopResizeSplit()
    stopResizeToc()
    if (splitResizeRafId) {
      cancelAnimationFrame(splitResizeRafId)
      splitResizeRafId = 0
    }
    if (tocResizeRafId) {
      cancelAnimationFrame(tocResizeRafId)
      tocResizeRafId = 0
    }
    clearSplitResizeListeners()
    clearTocResizeListeners()
    setResizeCursor(false)
    isResizingSplit.value = false
    isResizingToc.value = false
    splitResizeContainerLeft = 0
    splitResizeContainerWidth = 0
    tocSidebarEl = null
    tocResizeLeft = 0
    splitResizePerf = null
    tocResizePerf = null
  }

  return {
    startResizeSplit,
    stopResizeSplit,
    startResizeToc,
    stopResizeToc,
    cleanupPaneResize,
  }
}
