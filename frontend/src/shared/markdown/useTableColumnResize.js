export function useTableColumnResize({
  markdownTableController,
  styleConfig,
}) {
  let tableResizeState = null

  function clearTableResizeListeners() {
    if (typeof document === "undefined") {
      return
    }
    document.removeEventListener("mousemove", handleResizeTableColumn)
    document.removeEventListener("mouseup", stopResizeTableColumn)
  }

  function setTableResizeCursor(active) {
    if (typeof document === "undefined") {
      return
    }
    document.body.style.cursor = active ? "col-resize" : ""
    document.body.style.userSelect = active ? "none" : ""
  }

  function startResizeTableColumn(event) {
    const handle = event.target?.closest?.(".table-resize-handle")
    if (!handle) {
      return
    }

    const table = handle.closest("table[data-resizable-table='true']")
    if (!table) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const minWidth = 48
    const colIndex = Number(handle.dataset.colIndex)
    const columns = markdownTableController.lockTableColumnWidths(table, minWidth)
    if (!columns[colIndex]) {
      return
    }

    const currentCell = table.tHead?.rows?.[0]?.cells?.[colIndex]
    const nextCell = table.tHead?.rows?.[0]?.cells?.[colIndex + 1]
    const tableWidth = Math.max(table.getBoundingClientRect().width, table.scrollWidth)

    table.style.tableLayout = "fixed"
    if (!styleConfig.value.tableFullWidth) {
      table.style.width = `${Math.ceil(tableWidth)}px`
    }

    tableResizeState = {
      table,
      columns,
      colIndex,
      nextIndex: nextCell ? colIndex + 1 : -1,
      startX: event.clientX,
      startWidth: Math.max(minWidth, currentCell?.getBoundingClientRect().width || minWidth),
      nextStartWidth: Math.max(minWidth, nextCell?.getBoundingClientRect().width || minWidth),
      tableWidth,
      minWidth,
      keepTableWidth: !styleConfig.value.tableFullWidth || !nextCell,
    }

    document.addEventListener("mousemove", handleResizeTableColumn)
    document.addEventListener("mouseup", stopResizeTableColumn)
    setTableResizeCursor(true)
  }

  function handleResizeTableColumn(event) {
    if (!tableResizeState) {
      return
    }

    const state = tableResizeState
    let delta = event.clientX - state.startX

    if (state.nextIndex >= 0) {
      delta = Math.max(
        state.minWidth - state.startWidth,
        Math.min(state.nextStartWidth - state.minWidth, delta)
      )
      state.columns[state.colIndex].style.width = `${state.startWidth + delta}px`
      state.columns[state.nextIndex].style.width = `${state.nextStartWidth - delta}px`
      return
    }

    const nextWidth = Math.max(state.minWidth, state.startWidth + delta)
    state.columns[state.colIndex].style.width = `${nextWidth}px`
    state.table.style.width = `${Math.max(
      state.tableWidth,
      state.tableWidth + nextWidth - state.startWidth
    )}px`
  }

  function stopResizeTableColumn() {
    if (!tableResizeState) {
      clearTableResizeListeners()
      return
    }

    markdownTableController.saveCurrentTableLayout(tableResizeState.table, {
      keepTableWidth: tableResizeState.keepTableWidth,
    })
    tableResizeState = null
    clearTableResizeListeners()
    setTableResizeCursor(false)
  }

  function cleanupTableColumnResize() {
    stopResizeTableColumn()
    clearTableResizeListeners()
    setTableResizeCursor(false)
    tableResizeState = null
  }

  return {
    startResizeTableColumn,
    cleanupTableColumnResize,
  }
}
