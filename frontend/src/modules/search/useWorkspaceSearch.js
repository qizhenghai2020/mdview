import { computed, onUnmounted, ref, watch } from "vue";

const MAX_SEARCH_RESULTS = 500;
const SEARCH_DEBOUNCE_MS = 180;
const FILE_READ_CONCURRENCY = 6;
const PREVIEW_CONTEXT_CHARS = 78;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

function normalizePath(path) {
  return String(path || "").replaceAll("/", "\\").toLowerCase();
}

function getFileName(path) {
  const normalizedPath = String(path || "").replaceAll("\\", "/");
  return normalizedPath.split("/").pop() || normalizedPath;
}

function collectWorkspaceFiles(nodes, files = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.isDir) {
      collectWorkspaceFiles(node.children, files);
      continue;
    }

    if (node?.path) {
      files.push({
        path: node.path,
        name: node.name || getFileName(node.path),
      });
    }
  }

  return files;
}

function createPreviewParts(lineText, matchIndex, matchLength) {
  const contextStart = Math.max(0, matchIndex - PREVIEW_CONTEXT_CHARS);
  const contextEnd = Math.min(
    lineText.length,
    matchIndex + matchLength + PREVIEW_CONTEXT_CHARS
  );
  const prefix = contextStart > 0 ? "..." : "";
  const suffix = contextEnd < lineText.length ? "..." : "";
  const preview = `${prefix}${lineText.slice(contextStart, contextEnd)}${suffix}`;
  const previewMatchStart = prefix.length + matchIndex - contextStart;

  return {
    preview,
    parts: [
      {
        text: preview.slice(0, previewMatchStart),
        matched: false,
      },
      {
        text: preview.slice(previewMatchStart, previewMatchStart + matchLength),
        matched: true,
      },
      {
        text: preview.slice(previewMatchStart + matchLength),
        matched: false,
      },
    ],
  };
}

function isWordCharacter(value) {
  return Boolean(value) && WORD_CHARACTER_PATTERN.test(value);
}

function isWholeWordMatch(lineText, matchIndex, matchLength) {
  return (
    !isWordCharacter(lineText[matchIndex - 1]) &&
    !isWordCharacter(lineText[matchIndex + matchLength])
  );
}

function findFileMatches(content, file, searchTerm, { matchCase, wholeWord }) {
  const lines = String(content || "").split(/\r\n|\n|\r/);
  const comparisonTerm = matchCase ? searchTerm : searchTerm.toLowerCase();
  const matches = [];
  let truncated = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    const comparisonLine = matchCase ? lineText : lineText.toLowerCase();
    let matchIndex = comparisonLine.indexOf(comparisonTerm);

    while (matchIndex !== -1) {
      if (wholeWord && !isWholeWordMatch(lineText, matchIndex, searchTerm.length)) {
        matchIndex = comparisonLine.indexOf(comparisonTerm, matchIndex + 1);
        continue;
      }

      if (matches.length >= MAX_SEARCH_RESULTS) {
        truncated = true;
        return { matches, truncated };
      }

      const preview = createPreviewParts(lineText, matchIndex, searchTerm.length);
      matches.push({
        id: `${normalizePath(file.path)}:${lineIndex + 1}:${matchIndex + 1}:${matches.length}`,
        filePath: file.path,
        fileName: file.name,
        line: lineIndex + 1,
        column: matchIndex + 1,
        matchText: lineText.slice(matchIndex, matchIndex + searchTerm.length),
        matchLength: searchTerm.length,
        matchOrdinal: matches.length,
        ...preview,
      });

      matchIndex = comparisonLine.indexOf(
        comparisonTerm,
        matchIndex + Math.max(searchTerm.length, 1)
      );
    }
  }

  return { matches, truncated };
}

function groupMatches(files, fileMatches) {
  const groups = [];
  const groupsByPath = new Map();
  let totalMatches = 0;
  let truncated = false;

  for (let index = 0; index < files.length; index += 1) {
    const matches = fileMatches[index]?.matches || [];
    truncated = truncated || Boolean(fileMatches[index]?.truncated);
    if (!matches.length) {
      continue;
    }

    const filePathKey = normalizePath(files[index].path);
    let group = groupsByPath.get(filePathKey);
    if (!group) {
      group = {
        filePath: files[index].path,
        fileName: files[index].name,
        matchCount: 0,
        matches: [],
      };
      groupsByPath.set(filePathKey, group);
      groups.push(group);
    }

    const remaining = MAX_SEARCH_RESULTS - totalMatches;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const visibleMatches = matches.slice(0, remaining);
    group.matches.push(...visibleMatches);
    group.matchCount += visibleMatches.length;
    totalMatches += visibleMatches.length;
    if (visibleMatches.length < matches.length) {
      truncated = true;
      break;
    }
  }

  return { groups, totalMatches, truncated };
}

export function useWorkspaceSearch({
  workspaceRoots,
  filePath,
  fileName,
  editedContent,
  readTextFileContent,
  matchCase,
  wholeWord,
}) {
  const query = ref("");
  const groups = ref([]);
  const isSearching = ref(false);
  const isTruncated = ref(false);
  let searchTimer = 0;
  let searchRequestId = 0;

  const totalMatches = computed(() =>
    groups.value.reduce((total, group) => total + group.matchCount, 0)
  );

  function getSearchFiles() {
    const workspaceFiles = collectWorkspaceFiles(workspaceRoots.value);
    if (workspaceFiles.length) {
      return workspaceFiles;
    }

    if (!filePath.value) {
      return [];
    }

    return [
      {
        path: filePath.value,
        name: fileName.value || getFileName(filePath.value),
      },
    ];
  }

  async function runSearch() {
    const requestId = ++searchRequestId;
    const searchTerm = String(query.value || "");
    if (!searchTerm.trim()) {
      groups.value = [];
      isTruncated.value = false;
      isSearching.value = false;
      return;
    }

    const files = getSearchFiles();
    isSearching.value = true;
    isTruncated.value = false;

    const fileMatches = new Array(files.length);
    let nextFileIndex = 0;

    async function readAndSearchFile() {
      while (nextFileIndex < files.length) {
        const fileIndex = nextFileIndex;
        nextFileIndex += 1;
        const file = files[fileIndex];
        let content = "";

        try {
          if (normalizePath(file.path) === normalizePath(filePath.value)) {
            content = editedContent.value;
          } else if (typeof readTextFileContent === "function") {
            content = await readTextFileContent(file.path);
          }

          fileMatches[fileIndex] = findFileMatches(content, file, searchTerm, {
            matchCase: matchCase.value,
            wholeWord: wholeWord.value,
          });
        } catch (error) {
          console.warn("搜索文件失败:", file.path, error);
          fileMatches[fileIndex] = { matches: [], truncated: false };
        }

        if (requestId !== searchRequestId) {
          return;
        }
      }
    }

    const workerCount = Math.min(FILE_READ_CONCURRENCY, files.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => readAndSearchFile())
    );

    if (requestId !== searchRequestId) {
      return;
    }

    const result = groupMatches(files, fileMatches);
    groups.value = result.groups;
    isTruncated.value = result.truncated;
    isSearching.value = false;
  }

  function scheduleSearch(delay = SEARCH_DEBOUNCE_MS) {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(() => {
      searchTimer = 0;
      void runSearch();
    }, delay);
  }

  watch([query, matchCase, wholeWord], () => scheduleSearch());
  watch([workspaceRoots, filePath], () => scheduleSearch(), { deep: true });
  watch(editedContent, () => {
    if (String(query.value || "").trim()) {
      scheduleSearch(280);
    }
  });

  onUnmounted(() => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    searchRequestId += 1;
  });

  return {
    query,
    groups,
    isSearching,
    isTruncated,
    totalMatches,
  };
}
