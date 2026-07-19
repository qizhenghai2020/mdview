const TABLE_LAYOUT_STORAGE_KEY = "md-viewer.table-layouts.v1";
const MAX_STORED_TABLE_LAYOUT_DOCS = 80;

function getPlainTextLength(html) {
  return String(html || "").replace(/<[^>]*>/g, "").length;
}

function normalizeTableSignatureText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function hashTableSignature(value) {
  let hash = 5381;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function loadTableLayoutStore() {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = JSON.parse(localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (error) {
    console.warn("加载表格列宽记录失败:", error);
    return {};
  }
}

function parseTableCellContent(parser, cell) {
  const html = parser.parseInline(cell.tokens);
  return {
    alignStyle: cell.align ? `text-align:${cell.align};` : "",
    html,
    signature: normalizeTableSignatureText(html),
    textLength: getPlainTextLength(html),
  };
}

function parseTableRowsContent(parser, rows, colCount) {
  return rows.map((row) =>
    row.slice(0, colCount).map((cell) => parseTableCellContent(parser, cell))
  );
}

function normalizeTableColumnPercents(widths) {
  const safeWidths = (Array.isArray(widths) ? widths : []).map((value) =>
    Math.max(0, Number(value) || 0)
  );
  const total = safeWidths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return [];
  }

  let consumed = 0;
  return safeWidths.map((value, index) => {
    if (index === safeWidths.length - 1) {
      return Number(Math.max(0, 100 - consumed).toFixed(4));
    }
    const percent = Number(((value / total) * 100).toFixed(4));
    consumed += percent;
    return percent;
  });
}

function getResizableTableColumns(table) {
  if (!table) {
    return [];
  }

  let colgroup = table.querySelector("colgroup");
  const firstRow = table.tHead?.rows?.[0] || table.rows?.[0];
  const columnCount = firstRow?.cells?.length || 0;
  if (!colgroup && columnCount > 0) {
    colgroup = document.createElement("colgroup");
    for (let i = 0; i < columnCount; i += 1) {
      colgroup.appendChild(document.createElement("col"));
    }
    table.insertBefore(colgroup, table.firstChild);
  }

  return Array.from(colgroup?.querySelectorAll?.("col") || []);
}

export function createMarkdownTableController({ filePath, fileName, styleConfig }) {
  let tableLayoutStoreCache = loadTableLayoutStore();
  let markdownTableRenderCounter = 0;

  function saveTableLayoutStore() {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const docEntries = Object.entries(tableLayoutStoreCache || {});
      if (docEntries.length > MAX_STORED_TABLE_LAYOUT_DOCS) {
        docEntries
          .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
          .slice(MAX_STORED_TABLE_LAYOUT_DOCS)
          .forEach(([key]) => {
            delete tableLayoutStoreCache[key];
          });
      }

      localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(tableLayoutStoreCache));
    } catch (error) {
      console.warn("保存表格列宽记录失败:", error);
    }
  }

  function getCurrentTableLayoutDocumentKey() {
    const normalizedPath = String(filePath.value || "")
      .trim()
      .replace(/\\/g, "/")
      .toLowerCase();
    if (normalizedPath) {
      return `path:${normalizedPath}`;
    }

    const normalizedName = String(fileName.value || "").trim();
    if (normalizedName && normalizedName !== "未打开文件") {
      return `name:${normalizedName}`;
    }

    return "";
  }

  function getStoredTableLayout(tableKey) {
    const documentKey = getCurrentTableLayoutDocumentKey();
    if (!documentKey || !tableKey) {
      return null;
    }

    const layout = tableLayoutStoreCache?.[documentKey]?.tables?.[tableKey];
    if (!layout || !Array.isArray(layout.columnPercents) || !layout.columnPercents.length) {
      return null;
    }

    return layout;
  }

  function saveCurrentTableLayout(table, { keepTableWidth = false } = {}) {
    const documentKey = getCurrentTableLayoutDocumentKey();
    const tableKey = String(table?.dataset?.tableKey || "");
    if (!documentKey || !tableKey || !table) {
      return;
    }

    const columns = getResizableTableColumns(table);
    const headerCells = Array.from(table.tHead?.rows?.[0]?.cells || []);
    const widths = headerCells.map((cell, index) => {
      const columnWidth = columns[index]?.getBoundingClientRect?.().width || 0;
      return Math.max(1, columnWidth || cell.getBoundingClientRect().width || 0);
    });
    const columnPercents = normalizeTableColumnPercents(widths);
    if (!columnPercents.length) {
      return;
    }

    const tableWidth = Math.max(table.getBoundingClientRect().width || 0, table.scrollWidth || 0);
    tableLayoutStoreCache = {
      ...(tableLayoutStoreCache || {}),
      [documentKey]: {
        updatedAt: Date.now(),
        tables: {
          ...(tableLayoutStoreCache?.[documentKey]?.tables || {}),
          [tableKey]: {
            columnPercents,
            tableWidthPx:
              keepTableWidth && Number.isFinite(tableWidth) && tableWidth > 0
                ? Math.round(tableWidth)
                : null,
          },
        },
      },
    };
    saveTableLayoutStore();
  }

  function renderTable({ parser, header, rows }) {
    const colCount = header.length;
    if (colCount === 0) {
      return "";
    }

    const parsedHeader = header.map((cell) => parseTableCellContent(parser, cell));
    const parsedRows = parseTableRowsContent(parser, rows, colCount);
    const colMaxLengths = parsedHeader.map((cell) => cell.textLength);

    parsedRows.forEach((row) => {
      row.forEach((cell, index) => {
        if (index < colCount) {
          colMaxLengths[index] = Math.max(colMaxLengths[index], cell.textLength);
        }
      });
    });

    const totalLength = colMaxLengths.reduce((sum, value) => sum + value, 0) || colCount;
    const minWidthPercent = 8;
    const remainingPercent = 100 - minWidthPercent * colCount;

    let colWidths;
    if (remainingPercent <= 0) {
      colWidths = colMaxLengths.map(() => 100 / colCount);
    } else {
      colWidths = colMaxLengths.map((length) => {
        const ratio = length / totalLength;
        return minWidthPercent + ratio * remainingPercent;
      });
    }

    const tableIndex = markdownTableRenderCounter++;
    const headerSignature = parsedHeader.map((cell) => cell.signature).join("|");
    const rowSignature = parsedRows
      .slice(0, 3)
      .map((row) => row.map((cell) => cell.signature).join("|"))
      .join("||");
    const tableKey = `t${tableIndex}-${hashTableSignature(
      `${colCount}::${rows.length}::${headerSignature}::${rowSignature}`
    )}`;
    const storedLayout = getStoredTableLayout(tableKey);
    if (storedLayout?.columnPercents?.length === colCount) {
      colWidths = storedLayout.columnPercents;
    }

    const headerCells = parsedHeader
      .map((cell, index) => {
        const width = `width:${colWidths[index].toFixed(1)}%;`;
        return `<th style="${width}${cell.alignStyle}">${cell.html}<span class="table-resize-handle" data-col-index="${index}" title="拖动调整列宽"></span></th>`;
      })
      .join("");

    const colGroup = colWidths
      .map((width) => `<col style="width:${width.toFixed(1)}%;" />`)
      .join("");

    const bodyHtml = parsedRows
      .map((row) => {
        const cells = row
          .map((cell) => `<td style="${cell.alignStyle}">${cell.html}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const tableStyles = [];
    if (storedLayout) {
      tableStyles.push("table-layout:fixed");
      if (
        storedLayout.tableWidthPx &&
        Number.isFinite(storedLayout.tableWidthPx) &&
        !styleConfig.value.tableFullWidth
      ) {
        tableStyles.push(`width:${storedLayout.tableWidthPx}px`);
      }
    }

    return `<div class="table-border"><div class="table-scroll"><table data-resizable-table="true" data-table-key="${tableKey}"${
      storedLayout ? ' data-table-layout="persisted"' : ""
    }${
      tableStyles.length ? ` style="${tableStyles.join(";")};"` : ""
    }><colgroup>${colGroup}</colgroup><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table></div></div>`;
  }

  function lockTableColumnWidths(table, minWidth = 48) {
    const columns = getResizableTableColumns(table);
    const headerCells = Array.from(table?.tHead?.rows?.[0]?.cells || []);

    headerCells.forEach((cell, index) => {
      if (columns[index]) {
        columns[index].style.width = `${Math.max(
          minWidth,
          cell.getBoundingClientRect().width
        )}px`;
      }
    });

    return columns;
  }

  function getRenderCounter() {
    return markdownTableRenderCounter;
  }

  function resetRenderCounter() {
    markdownTableRenderCounter = 0;
  }

  function restoreRenderCounter(value) {
    markdownTableRenderCounter = Number.isFinite(value) ? value : 0;
  }

  return {
    renderTable,
    lockTableColumnWidths,
    saveCurrentTableLayout,
    getRenderCounter,
    resetRenderCounter,
    restoreRenderCounter,
  };
}
