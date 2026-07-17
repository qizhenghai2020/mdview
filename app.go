package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
)

// App struct
type App struct {
	ctx             context.Context
	filePath        string
	fileEncoding    string
	startupArg      string
	lastModTime     time.Time
	lastFileSize    int64
	lastFileHash    [sha256.Size]byte
	watchCancel     context.CancelFunc
	watchGeneration uint64
	mu              sync.Mutex
}

type AIModelConfig struct {
	Name          string            `json:"name"`
	BaseURL       string            `json:"baseUrl"`
	APIKey        string            `json:"apiKey"`
	Model         string            `json:"model"`
	Timeout       int               `json:"timeout"`
	FormatTimeout int               `json:"formatTimeout"`
	Headers       []AIRequestHeader `json:"headers"`
}

type AIRequestHeader struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type AIFormatRequest struct {
	Markdown    string        `json:"markdown"`
	Instruction string        `json:"instruction"`
	Model       AIModelConfig `json:"model"`
}

type AIThemeRequest struct {
	Preference   string        `json:"preference"`
	CurrentTheme string        `json:"currentTheme"`
	Model        AIModelConfig `json:"model"`
}

type chatCompletionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionRequest struct {
	Model       string                  `json:"model"`
	Messages    []chatCompletionMessage `json:"messages"`
	Temperature float64                 `json:"temperature"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message chatCompletionMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// FileTreeNode is a text file or directory shown in the frontend explorer.
type FileTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"isDir"`
	Children []FileTreeNode `json:"children"`
}

// FileWorkspace is a bounded tree built from selected files and directories.
type FileWorkspace struct {
	Roots        []FileTreeNode `json:"roots"`
	FileCount    int            `json:"fileCount"`
	SkippedCount int            `json:"skippedCount"`
	Truncated    bool           `json:"truncated"`
}

const maxWorkspaceFiles = 10000
const maxAIFormatResponseBytes int64 = 8 * 1024 * 1024
const maxAIThemeResponseBytes int64 = 256 * 1024
const maxAITestResponseBytes int64 = 128 * 1024
const maxInlineImageBytes int64 = 3 * 1024 * 1024

var textFileExtensions = map[string]struct{}{
	".adoc": {}, ".asc": {}, ".asm": {}, ".astro": {}, ".bat": {}, ".bash": {},
	".c": {}, ".cc": {}, ".cfg": {}, ".clj": {}, ".cljs": {}, ".cmd": {}, ".conf": {},
	".cpp": {}, ".cs": {}, ".css": {}, ".csv": {}, ".cxx": {}, ".dart": {}, ".diff": {},
	".editorconfig": {}, ".env": {}, ".fish": {}, ".fs": {}, ".fsx": {}, ".go": {},
	".gql": {}, ".graphql": {}, ".groovy": {}, ".h": {}, ".hpp": {}, ".htm": {}, ".html": {},
	".ini": {}, ".java": {}, ".jl": {}, ".js": {}, ".json": {}, ".jsonl": {}, ".jsx": {},
	".kt": {}, ".kts": {}, ".less": {}, ".log": {}, ".lua": {}, ".md": {}, ".markdown": {},
	".mdown": {}, ".mkd": {}, ".mkdn": {}, ".mdwn": {}, ".mjs": {}, ".mm": {}, ".org": {},
	".patch": {}, ".php": {}, ".pl": {}, ".properties": {}, ".ps1": {}, ".py": {}, ".r": {},
	".rb": {}, ".rs": {}, ".rst": {}, ".sass": {}, ".scala": {}, ".scss": {}, ".sh": {},
	".sql": {}, ".svelte": {}, ".svg": {}, ".swift": {}, ".tex": {}, ".toml": {}, ".ts": {},
	".tsv": {}, ".tsx": {}, ".txt": {}, ".vue": {}, ".xml": {}, ".yaml": {}, ".yml": {},
	".zsh": {},
}

var binaryFileExtensions = map[string]struct{}{
	".7z": {}, ".avi": {}, ".bin": {}, ".bmp": {}, ".class": {}, ".db": {}, ".dll": {},
	".doc": {}, ".docx": {}, ".dylib": {}, ".eot": {}, ".exe": {}, ".gif": {}, ".gz": {},
	".ico": {}, ".jar": {}, ".jpeg": {}, ".jpg": {}, ".lockb": {}, ".mov": {}, ".mp3": {},
	".mp4": {}, ".o": {}, ".obj": {}, ".otf": {}, ".pdf": {}, ".png": {}, ".ppt": {},
	".pptx": {}, ".rar": {}, ".so": {}, ".sqlite": {}, ".tar": {}, ".tif": {}, ".tiff": {},
	".ttf": {}, ".wav": {}, ".webm": {}, ".webp": {}, ".woff": {}, ".woff2": {}, ".xls": {},
	".xlsx": {}, ".xz": {}, ".zip": {},
}

var ignoredWorkspaceDirectories = map[string]struct{}{
	".git": {}, ".idea": {}, ".svn": {}, ".vs": {}, ".vscode": {}, "build": {},
	"coverage": {}, "dist": {}, "node_modules": {}, "target": {}, "vendor": {},
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// SetStartupArg sets the file path passed from command line
func (a *App) SetStartupArg(arg string) {
	a.startupArg = arg
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	runtime.WindowCenter(ctx)
	runtime.WindowShow(ctx)
}

// GetStartupFile returns the file path passed at startup
func (a *App) GetStartupFile() string {
	return a.startupArg
}

// OpenFileDialog opens a file dialog and returns the selected file path
func (a *App) OpenFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "打开文本文件",
		Filters: textFileDialogFilters(),
	})
	if err != nil {
		return ""
	}
	return path
}

// OpenFilesDialog opens a file dialog that allows selecting multiple text files.
func (a *App) OpenFilesDialog() []string {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "打开一个或多个文本文件",
		Filters: textFileDialogFilters(),
	})
	if err != nil {
		return nil
	}
	return paths
}

// OpenDirectoryDialog lets the user select a directory for the file explorer.
func (a *App) OpenDirectoryDialog() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开文本目录",
	})
	if err != nil {
		return ""
	}
	return path
}

func textFileDialogFilters() []runtime.FileFilter {
	return []runtime.FileFilter{
		{
			DisplayName: "文本与代码文件",
			Pattern:     "*.md;*.markdown;*.txt;*.log;*.json;*.jsonl;*.yaml;*.yml;*.toml;*.ini;*.cfg;*.conf;*.csv;*.tsv;*.xml;*.html;*.css;*.js;*.jsx;*.ts;*.tsx;*.vue;*.go;*.py;*.java;*.c;*.h;*.cpp;*.hpp;*.cs;*.rs;*.sql;*.sh;*.bat;*.cmd;*.ps1",
		},
		{
			DisplayName: "Markdown 文件",
			Pattern:     "*.md;*.markdown;*.mdown;*.mkdn;*.mkd;*.mdwn",
		},
		{
			DisplayName: "所有文件（自动检测文本）",
			Pattern:     "*.*",
		},
	}
}

// BuildFileWorkspace creates a sorted, bounded tree containing text files only.
func (a *App) BuildFileWorkspace(paths []string) (FileWorkspace, error) {
	workspace := FileWorkspace{Roots: []FileTreeNode{}}
	seen := make(map[string]struct{})

	for _, selectedPath := range paths {
		if workspace.Truncated {
			break
		}

		cleanPath, err := filepath.Abs(strings.TrimSpace(selectedPath))
		if err != nil || cleanPath == "" {
			workspace.SkippedCount++
			continue
		}

		key := strings.ToLower(filepath.Clean(cleanPath))
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		info, err := os.Stat(cleanPath)
		if err != nil {
			workspace.SkippedCount++
			continue
		}

		node, containsText := buildFileTreeNode(cleanPath, info, &workspace)
		if containsText || info.IsDir() {
			workspace.Roots = append(workspace.Roots, node)
		}
	}

	if len(workspace.Roots) == 0 && workspace.SkippedCount > 0 {
		return workspace, fmt.Errorf("所选内容中没有可打开的文本文件")
	}

	sortFileTreeNodes(workspace.Roots)
	return workspace, nil
}

func buildFileTreeNode(path string, info os.FileInfo, workspace *FileWorkspace) (FileTreeNode, bool) {
	node := FileTreeNode{
		Name:     info.Name(),
		Path:     path,
		IsDir:    info.IsDir(),
		Children: []FileTreeNode{},
	}

	if !info.IsDir() {
		if workspace.FileCount >= maxWorkspaceFiles {
			workspace.Truncated = true
			return node, false
		}
		if !isTextFile(path) {
			workspace.SkippedCount++
			return node, false
		}
		workspace.FileCount++
		return node, true
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		workspace.SkippedCount++
		return node, false
	}

	containsText := false
	for _, entry := range entries {
		if workspace.Truncated {
			break
		}
		if entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		if entry.IsDir() {
			if _, ignored := ignoredWorkspaceDirectories[strings.ToLower(entry.Name())]; ignored {
				continue
			}
		}

		childInfo, err := entry.Info()
		if err != nil {
			workspace.SkippedCount++
			continue
		}
		childPath := filepath.Join(path, entry.Name())
		child, childContainsText := buildFileTreeNode(childPath, childInfo, workspace)
		if childContainsText {
			node.Children = append(node.Children, child)
			containsText = true
		}
	}

	sortFileTreeNodes(node.Children)
	return node, containsText
}

func sortFileTreeNodes(nodes []FileTreeNode) {
	sort.SliceStable(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})
}

func isTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	if _, binary := binaryFileExtensions[ext]; binary {
		return false
	}

	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	sample := make([]byte, 8192)
	count, err := file.Read(sample)
	if err != nil && !errors.Is(err, io.EOF) {
		return false
	}
	if count == 0 {
		return true
	}

	_, _, decodeErr := decodeTextData(sample[:count])
	if decodeErr == nil {
		return true
	}
	_, knownText := textFileExtensions[ext]
	return knownText && !bytes.Contains(sample[:count], []byte{0})
}

// ReadFile reads the content of a file
func (a *App) ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	content, encoding, err := decodeTextData(data)
	if err != nil {
		return "", fmt.Errorf("不支持的二进制或文本编码: %w", err)
	}

	a.mu.Lock()
	a.filePath = path
	a.fileEncoding = encoding
	a.mu.Unlock()
	return content, nil
}

// GetFileName returns the base name of the current file
func (a *App) GetFileName() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.filePath == "" {
		return "未打开文件"
	}
	return filepath.Base(a.filePath)
}

// GetFilePath returns the full path of the current file
func (a *App) GetFilePath() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.filePath
}

// SaveFileDialog opens a save dialog and returns the selected path
func (a *App) SaveFileDialog(defaultName string) string {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存文件",
		DefaultFilename: defaultName,
	})
	if err != nil {
		return ""
	}
	return path
}

// WriteFile writes content to a file
func (a *App) WriteFile(path string, content string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	encoding := "utf-8"
	if strings.EqualFold(a.filePath, path) && a.fileEncoding != "" {
		encoding = a.fileEncoding
	}
	data, err := encodeTextData(content, encoding)
	if err != nil {
		return fmt.Errorf("按原编码保存失败: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}

	if info, err := os.Stat(path); err == nil {
		if strings.EqualFold(a.filePath, path) {
			a.lastModTime = info.ModTime()
			a.lastFileSize = info.Size()
			a.lastFileHash = sha256.Sum256(data)
		}
	}

	return nil
}

// ReadImageAsBase64 reads an image file and returns it as a base64 data URI
func (a *App) ReadImageAsBase64(imagePath string) string {
	info, err := os.Stat(imagePath)
	if err != nil || info.Size() > maxInlineImageBytes {
		return ""
	}

	data, err := os.ReadFile(imagePath)
	if err != nil {
		return ""
	}

	ext := strings.ToLower(filepath.Ext(imagePath))
	mimeType := "image/png"
	switch ext {
	case ".jpg", ".jpeg":
		mimeType = "image/jpeg"
	case ".gif":
		mimeType = "image/gif"
	case ".svg":
		mimeType = "image/svg+xml"
	case ".webp":
		mimeType = "image/webp"
	case ".bmp":
		mimeType = "image/bmp"
	case ".ico":
		mimeType = "image/x-icon"
	}

	return fmt.Sprintf("data:%s;base64,%s", mimeType, encodeBase64(data))
}

// ResolveImagePath resolves a relative image path against the current markdown file's directory
func (a *App) ResolveImagePath(imagePath string) string {
	a.mu.Lock()
	currentFilePath := a.filePath
	a.mu.Unlock()

	if currentFilePath == "" {
		return imagePath
	}

	// If it's already a data URI or absolute URL, return as-is
	if strings.HasPrefix(imagePath, "data:") || strings.HasPrefix(imagePath, "http://") || strings.HasPrefix(imagePath, "https://") {
		return imagePath
	}

	// If it's an absolute path, return as-is
	if filepath.IsAbs(imagePath) {
		return imagePath
	}

	// Resolve relative to the markdown file's directory
	dir := filepath.Dir(currentFilePath)
	resolved := filepath.Join(dir, imagePath)
	return resolved
}

// GetAppVersion returns the application version
func (a *App) GetAppVersion() string {
	return "1.0.0"
}

// StartFileWatch starts watching the current file for changes
func (a *App) StartFileWatch() {
	a.mu.Lock()
	a.stopFileWatchLocked()

	path := a.filePath
	appCtx := a.ctx
	if path == "" {
		a.mu.Unlock()
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		a.mu.Unlock()
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		a.mu.Unlock()
		return
	}
	a.lastModTime = info.ModTime()
	a.lastFileSize = info.Size()
	a.lastFileHash = sha256.Sum256(data)

	watchCtx, cancel := context.WithCancel(context.Background())
	a.watchCancel = cancel
	generation := a.watchGeneration
	a.mu.Unlock()

	go func(watchedPath string, watchedGeneration uint64) {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		var candidateHash [sha256.Size]byte
		candidateSeen := false

		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				data, err := os.ReadFile(watchedPath)
				if err != nil {
					continue
				}
				info, err := os.Stat(watchedPath)
				if err != nil {
					continue
				}
				currentHash := sha256.Sum256(data)

				a.mu.Lock()
				if a.watchGeneration != watchedGeneration || a.filePath != watchedPath {
					a.mu.Unlock()
					return
				}

				if currentHash == a.lastFileHash {
					a.lastModTime = info.ModTime()
					a.lastFileSize = info.Size()
					candidateSeen = false
					a.mu.Unlock()
					continue
				}

				// Wait for the same content twice so an editor's in-progress write is not loaded.
				if !candidateSeen || currentHash != candidateHash {
					candidateHash = currentHash
					candidateSeen = true
					a.mu.Unlock()
					continue
				}

				if currentHash != a.lastFileHash {
					a.lastModTime = info.ModTime()
					a.lastFileSize = info.Size()
					a.lastFileHash = currentHash
					candidateSeen = false
					a.mu.Unlock()

					if appCtx != nil {
						runtime.EventsEmit(appCtx, "file-changed", watchedPath)
					}
					continue
				}

				a.mu.Unlock()
			}
		}
	}(path, generation)
}

// StopFileWatch stops watching the current file
func (a *App) StopFileWatch() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopFileWatchLocked()
}

func (a *App) stopFileWatchLocked() {
	a.watchGeneration++
	if a.watchCancel != nil {
		a.watchCancel()
		a.watchCancel = nil
	}
}

// ReadFileAndUpdateWatch reads file and starts watching it
func (a *App) ReadFileAndUpdateWatch(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	content, encoding, err := decodeTextData(data)
	if err != nil {
		return "", fmt.Errorf("不支持的二进制或文本编码: %w", err)
	}

	var modTime time.Time
	if info, err := os.Stat(path); err == nil {
		modTime = info.ModTime()
	}

	// 只有读取成功后才替换 watcher，避免外部编辑器原子写入期间丢失监听。
	a.StopFileWatch()

	a.mu.Lock()
	a.filePath = path
	a.fileEncoding = encoding
	if !modTime.IsZero() {
		a.lastModTime = modTime
	}
	a.lastFileSize = int64(len(data))
	a.lastFileHash = sha256.Sum256(data)
	a.mu.Unlock()

	// 开始监听
	a.StartFileWatch()

	return content, nil
}

func decodeTextData(data []byte) (string, string, error) {
	if len(data) == 0 {
		return "", "utf-8", nil
	}
	if bytes.HasPrefix(data, []byte{0xef, 0xbb, 0xbf}) {
		return string(data[3:]), "utf-8-bom", nil
	}
	if bytes.HasPrefix(data, []byte{0xff, 0xfe}) {
		decoded, err := textunicode.UTF16(textunicode.LittleEndian, textunicode.ExpectBOM).NewDecoder().Bytes(data)
		return string(decoded), "utf-16le", err
	}
	if bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
		decoded, err := textunicode.UTF16(textunicode.BigEndian, textunicode.ExpectBOM).NewDecoder().Bytes(data)
		return string(decoded), "utf-16be", err
	}
	if utf8.Valid(data) && looksLikeDecodedText(string(data)) {
		return string(data), "utf-8", nil
	}

	if looksLikeUTF16(data, true) {
		decoded, err := textunicode.UTF16(textunicode.LittleEndian, textunicode.IgnoreBOM).NewDecoder().Bytes(data)
		if err == nil && looksLikeDecodedText(string(decoded)) {
			return string(decoded), "utf-16le-no-bom", nil
		}
	}
	if looksLikeUTF16(data, false) {
		decoded, err := textunicode.UTF16(textunicode.BigEndian, textunicode.IgnoreBOM).NewDecoder().Bytes(data)
		if err == nil && looksLikeDecodedText(string(decoded)) {
			return string(decoded), "utf-16be-no-bom", nil
		}
	}

	decoded, err := simplifiedchinese.GB18030.NewDecoder().Bytes(data)
	if err == nil && looksLikeDecodedText(string(decoded)) {
		return string(decoded), "gb18030", nil
	}
	return "", "", fmt.Errorf("文件包含无法识别的二进制内容")
}

func encodeTextData(content, encoding string) ([]byte, error) {
	switch encoding {
	case "utf-8-bom":
		return append([]byte{0xef, 0xbb, 0xbf}, []byte(content)...), nil
	case "utf-16le":
		return textunicode.UTF16(textunicode.LittleEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16be":
		return textunicode.UTF16(textunicode.BigEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16le-no-bom":
		return textunicode.UTF16(textunicode.LittleEndian, textunicode.IgnoreBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16be-no-bom":
		return textunicode.UTF16(textunicode.BigEndian, textunicode.IgnoreBOM).NewEncoder().Bytes([]byte(content))
	case "gb18030":
		return simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(content))
	default:
		return []byte(content), nil
	}
}

func looksLikeUTF16(data []byte, littleEndian bool) bool {
	if len(data) < 4 {
		return false
	}
	limit := len(data) - len(data)%2
	zeroCount := 0
	for i := 0; i < limit; i += 2 {
		index := i + 1
		if !littleEndian {
			index = i
		}
		if data[index] == 0 {
			zeroCount++
		}
	}
	return zeroCount*2 >= limit/2
}

func looksLikeDecodedText(content string) bool {
	if content == "" {
		return true
	}
	controlCount := 0
	runeCount := 0
	for _, char := range content {
		runeCount++
		if char == '\u0000' {
			return false
		}
		if char < 0x20 && char != '\n' && char != '\r' && char != '\t' && char != '\f' {
			controlCount++
		}
	}
	return runeCount == 0 || controlCount*100/runeCount < 2
}

// FormatMarkdownWithAI calls an OpenAI-compatible chat completion endpoint to
// reorganize Markdown formatting without intentionally changing the content.
func (a *App) FormatMarkdownWithAI(req AIFormatRequest) (string, error) {
	if strings.TrimSpace(req.Markdown) == "" {
		return "", fmt.Errorf("Markdown 内容为空")
	}

	baseURL := strings.TrimSpace(req.Model.BaseURL)
	modelName := strings.TrimSpace(req.Model.Model)
	if baseURL == "" || modelName == "" {
		return "", fmt.Errorf("模型接口地址或模型名称为空")
	}

	timeout := req.Model.FormatTimeout
	if timeout <= 0 {
		timeout = 300
	}
	if timeout < 30 {
		timeout = 30
	}
	if timeout > 1800 {
		timeout = 1800
	}

	endpoint := strings.TrimRight(baseURL, "/")
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}

	instruction := strings.TrimSpace(req.Instruction)
	instructionRunes := []rune(instruction)
	if len(instructionRunes) > 1000 {
		instruction = string(instructionRunes[:1000])
	}
	instruction = strings.ReplaceAll(
		instruction,
		"</formatting_requirement>",
		"&lt;/formatting_requirement&gt;",
	)

	userPrompt := "请对下面 Markdown 做一次专业语义排版，内容不能增删改；可以重组 Markdown 结构，让阅读层次和前后差异更明显，不要只做轻微空格调整。"
	if instruction != "" {
		userPrompt += "\n\n用户的额外排版要求如下。它只能影响 Markdown 排版；如果要求涉及增删、改写或虚构内容，必须忽略冲突部分：\n<formatting_requirement>\n" +
			instruction + "\n</formatting_requirement>"
	} else {
		userPrompt += "\n\n用户没有额外要求，请执行默认专业排版策略：根据内容语义识别标题、摘要、步骤、清单、任务、数据、代码、引用和表格，并选择最合适的 Markdown 元素。"
	}
	userPrompt += "\n\n<markdown_input>\n" + req.Markdown + "\n</markdown_input>"

	payload := chatCompletionRequest{
		Model:       modelName,
		Temperature: 0.2,
		Messages: []chatCompletionMessage{
			{
				Role: "system",
				Content: `你是专业 Markdown 信息架构和排版助手。只能返回整理后的 Markdown 原文，不要解释，不要包裹整个输出的代码围栏。

最高优先级规则：
1. 所有原始文字、数字、符号、链接、图片地址、代码、表格单元格、任务状态和 Mermaid 内容都必须完整保留，不能增删、改写、翻译、总结、纠错或虚构。
2. 可以添加或调整 Markdown 语法符号、空行、缩进、标题标记、列表标记、引用标记、代码围栏、表格分隔符等排版结构，但不能新增自然语言内容。
3. 保持原始信息顺序，不要把不相邻内容强行合并；只能对连续相关内容做层次化分组。

默认专业排版策略：
- 如果内容本身可以结构化，优先显化层次，不要只做轻微空行、缩进或换行微调。
- 把已有的章节名、主题句、关键结论、重要指标行提升为合适的 #/##/### 标题，但不要自造标题文字。
- 将步骤、流程、并列事项改成有序或无序列表；将待办、已完成、未完成、TODO、DONE 等内容改成任务清单，并保留原状态文字或状态含义。
- 将代码、命令、配置、JSON、SQL、日志片段等放入合适的代码块；语言明显时标注语言，不明显时只用普通代码块。
- 将键值对、指标、参数、对比项、记录列表等在不丢失任何单元内容时整理为 Markdown 表格；否则使用列表。
- 将提示、注意、风险、引用性内容改成 blockquote；将长段落按语义断行并保留完整句子。
- 保留已有链接、图片、脚注、HTML、Mermaid、表格和代码块的内容，只优化外围空行、缩进和对齐。

用户的额外要求优先级低于内容保留规则，任何要求都不能导致内容增删、改写或虚构。`,
			},
			{
				Role:    "user",
				Content: userPrompt,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("生成请求失败: %w", err)
	}

	requestCtx := a.ctx
	if requestCtx == nil {
		requestCtx = context.Background()
	}

	httpReq, err := http.NewRequestWithContext(
		requestCtx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(req.Model.APIKey) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.Model.APIKey))
	}
	if err := applyAIRequestHeaders(httpReq, req.Model.Headers); err != nil {
		return "", err
	}

	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		if isTimeoutError(err) {
			return "", formatAITimeoutError(timeout)
		}
		return "", fmt.Errorf("请求模型失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := readLimitedAIResponse(resp.Body, maxAIFormatResponseBytes)
	if err != nil {
		if isTimeoutError(err) {
			return "", formatAITimeoutError(timeout)
		}
		return "", fmt.Errorf("读取模型响应失败: %w", err)
	}

	var completion chatCompletionResponse
	if err := json.Unmarshal(respBody, &completion); err != nil {
		return "", fmt.Errorf("解析模型响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
			return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
		}
		return "", fmt.Errorf("模型请求失败，HTTP %d", resp.StatusCode)
	}

	if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
		return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
	}

	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("模型没有返回可用内容")
	}

	content := stripOuterMarkdownFence(completion.Choices[0].Message.Content)
	if strings.TrimSpace(content) == "" {
		return "", fmt.Errorf("模型返回内容为空")
	}

	return content, nil
}

// GenerateThemeWithAI asks an OpenAI-compatible model for a UI theme palette.
func (a *App) GenerateThemeWithAI(req AIThemeRequest) (string, error) {
	baseURL := strings.TrimSpace(req.Model.BaseURL)
	modelName := strings.TrimSpace(req.Model.Model)
	if baseURL == "" || modelName == "" {
		return "", fmt.Errorf("模型接口地址或模型名称为空")
	}

	timeout := req.Model.FormatTimeout
	if timeout <= 0 {
		timeout = 300
	}
	if timeout < 30 {
		timeout = 30
	}
	if timeout > 1800 {
		timeout = 1800
	}

	endpoint := strings.TrimRight(baseURL, "/")
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}

	preference := strings.TrimSpace(req.Preference)
	if preference == "" {
		preference = "随机生成一套适合 Markdown 阅读器的高质感完整 UI 主题。需要覆盖站点界面、按钮、滚动条、分割线、面板质感、Markdown 标题/代码/表格/任务列表等；不要只换颜色，也不要生成普通紫色模板。"
	}
	preferenceRunes := []rune(preference)
	if len(preferenceRunes) > 800 {
		preference = string(preferenceRunes[:800])
	}

	currentTheme := strings.TrimSpace(req.CurrentTheme)
	currentThemeRunes := []rune(currentTheme)
	if len(currentThemeRunes) > 80 {
		currentTheme = string(currentThemeRunes[:80])
	}
	if currentTheme == "" {
		currentTheme = "unknown"
	}

	userPrompt := "当前主题 ID: " + currentTheme + "\n用户偏好: " + preference + "\n请生成一套完整、协调、可读性强的 Markdown 阅读器主题。主体结构布局不变，但页面上可见的 UI 质感、按钮、滚动条、分割线、圆角、阴影、半透明效果和 Markdown 组件风格都要统一。"
	payload := chatCompletionRequest{
		Model:       modelName,
		Temperature: 0.85,
		Messages: []chatCompletionMessage{
			{
				Role: "system",
				Content: `你是资深产品 UI 设计师和 Markdown 阅读体验设计师。只返回 JSON，不要 Markdown 代码块，不要解释。
JSON 必须符合这个结构：
{
  "name": "中文短主题名，最多 8 个汉字",
  "description": "一句话说明主题气质",
  "mode": "light 或 dark",
  "style": "glass、crystal、neumorphism、paper、aurora、professional、minimal 之一",
  "palette": {
    "background": "#F7FAFC",
    "surface": "#FFFFFF",
    "elevated": "#F8FBFF",
    "toolbar": "#FFFFFF",
    "sidebar": "#F4F7FB",
    "sidebarHover": "#EAF2FF",
    "sidebarActive": "#DDEAFE",
    "editor": "#FFFFFF",
    "text": "#172033",
    "textSecondary": "#536075",
    "textTertiary": "#8994A8",
    "border": "#D9E1EF",
    "toolbarBorder": "#DDE5F0",
    "accent": "#2563EB",
    "accentHover": "#1D4ED8",
    "codeBackground": "#111827",
    "codeText": "#F8FAFC",
    "codeBorder": "#1F2937",
    "blockquoteBorder": "#93C5FD",
    "blockquoteBackground": "#EFF6FF",
    "tableBorder": "#D9E1EF",
    "tableStripe": "#F6F9FF",
    "scrollbarThumb": "#B8C4D8",
    "buttonHover": "rgba(37, 99, 235, 0.10)",
    "buttonActive": "rgba(37, 99, 235, 0.16)"
  },
  "appearance": {
    "surfaceOpacity": 0.72,
    "chromeOpacity": 0.76,
    "sidebarOpacity": 0.74,
    "editorOpacity": 0.82,
    "blur": 16,
    "radius": 20,
    "controlRadius": 12,
    "cardRadius": 18,
    "borderOpacity": 0.45,
    "shadow": "none、soft、floating、raised、paper、glow 之一",
    "buttonStyle": "plain、solid、subtle、glass、raised、glow 之一"
  },
  "markdown": {
    "surfaceOpacity": 0.82,
    "headingStyle": "clean、accent-line、floating、soft、editorial、glow 之一",
    "codeStyle": "minimal、panel、raised、ink 之一",
    "tableStyle": "minimal、card、paper、raised 之一",
    "taskStyle": "compact、cards 之一",
    "imageStyle": "rounded、floating、paper、raised 之一",
    "headingRadius": 10,
    "blockRadius": 16,
    "tableRadius": 18,
    "taskRadius": 18,
    "imageRadius": 18
  }
}
所有颜色必须是安全 CSS 颜色值，优先使用 #RRGGBB，透明色只允许 rgba(...)。appearance 和 markdown 只能使用上述字段和值；数值要克制，blur 不要超过 28。文字和背景必须有足够对比度。`,
			},
			{
				Role:    "user",
				Content: userPrompt,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("生成主题请求失败: %w", err)
	}

	requestCtx := a.ctx
	if requestCtx == nil {
		requestCtx = context.Background()
	}

	httpReq, err := http.NewRequestWithContext(
		requestCtx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("创建主题请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(req.Model.APIKey) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.Model.APIKey))
	}
	if err := applyAIRequestHeaders(httpReq, req.Model.Headers); err != nil {
		return "", err
	}

	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		if isTimeoutError(err) {
			return "", formatAITimeoutError(timeout)
		}
		return "", fmt.Errorf("请求模型生成主题失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := readLimitedAIResponse(resp.Body, maxAIThemeResponseBytes)
	if err != nil {
		if isTimeoutError(err) {
			return "", formatAITimeoutError(timeout)
		}
		return "", fmt.Errorf("读取主题响应失败: %w", err)
	}

	var completion chatCompletionResponse
	if err := json.Unmarshal(respBody, &completion); err != nil {
		return "", fmt.Errorf("解析主题模型响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
			return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
		}
		return "", fmt.Errorf("主题模型请求失败，HTTP %d", resp.StatusCode)
	}

	if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
		return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
	}

	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("模型没有返回可用主题")
	}

	content := strings.TrimSpace(stripOuterMarkdownFence(completion.Choices[0].Message.Content))
	if !json.Valid([]byte(content)) {
		start := strings.Index(content, "{")
		end := strings.LastIndex(content, "}")
		if start >= 0 && end > start {
			content = strings.TrimSpace(content[start : end+1])
		}
	}

	var themePayload map[string]any
	if err := json.Unmarshal([]byte(content), &themePayload); err != nil {
		return "", fmt.Errorf("模型没有返回合法主题 JSON: %w", err)
	}

	normalized, err := json.Marshal(themePayload)
	if err != nil {
		return "", fmt.Errorf("整理主题 JSON 失败: %w", err)
	}

	return string(normalized), nil
}

// TestAIModel sends a tiny prompt to verify that the configured model can respond.
func (a *App) TestAIModel(model AIModelConfig) (string, error) {
	baseURL := strings.TrimSpace(model.BaseURL)
	modelName := strings.TrimSpace(model.Model)
	if baseURL == "" || modelName == "" {
		return "", fmt.Errorf("模型接口地址或模型名称为空")
	}

	timeout := model.Timeout
	if timeout <= 0 {
		timeout = 30
	}
	if timeout < 5 {
		timeout = 5
	}
	if timeout > 300 {
		timeout = 300
	}

	endpoint := strings.TrimRight(baseURL, "/")
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}

	payload := chatCompletionRequest{
		Model:       modelName,
		Temperature: 0,
		Messages: []chatCompletionMessage{
			{
				Role:    "system",
				Content: "你是模型连通性测试助手。只返回 OK。",
			},
			{
				Role:    "user",
				Content: "请只回复 OK，用于测试模型是否可用。",
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("生成测试请求失败: %w", err)
	}

	requestCtx := a.ctx
	if requestCtx == nil {
		requestCtx = context.Background()
	}

	httpReq, err := http.NewRequestWithContext(
		requestCtx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("创建测试请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(model.APIKey) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(model.APIKey))
	}
	if err := applyAIRequestHeaders(httpReq, model.Headers); err != nil {
		return "", err
	}

	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("测试请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := readLimitedAIResponse(resp.Body, maxAITestResponseBytes)
	if err != nil {
		return "", fmt.Errorf("读取测试响应失败: %w", err)
	}

	var completion chatCompletionResponse
	if err := json.Unmarshal(respBody, &completion); err != nil {
		return "", fmt.Errorf("解析测试响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
			return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
		}
		return "", fmt.Errorf("模型测试失败，HTTP %d", resp.StatusCode)
	}

	if completion.Error != nil && strings.TrimSpace(completion.Error.Message) != "" {
		return "", fmt.Errorf("模型返回错误: %s", completion.Error.Message)
	}

	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("模型没有返回测试内容")
	}

	content := strings.TrimSpace(stripOuterMarkdownFence(completion.Choices[0].Message.Content))
	if content == "" {
		return "", fmt.Errorf("模型返回测试内容为空")
	}

	return content, nil
}

func applyAIRequestHeaders(req *http.Request, headers []AIRequestHeader) error {
	for _, header := range headers {
		if !header.Enabled {
			continue
		}

		name := strings.TrimSpace(header.Name)
		value := strings.TrimSpace(header.Value)
		if name == "" && value == "" {
			continue
		}
		if strings.ContainsAny(header.Name, "\r\n") || strings.ContainsAny(header.Value, "\r\n") {
			return fmt.Errorf("自定义请求头 %q 不能包含换行符", name)
		}
		if !isValidHTTPHeaderName(name) {
			return fmt.Errorf("自定义请求头名称无效: %q", name)
		}

		switch strings.ToLower(name) {
		case "content-length", "transfer-encoding", "connection", "trailer":
			return fmt.Errorf("自定义请求头 %q 由网络层管理，不能手动设置", name)
		case "host":
			req.Host = value
		default:
			req.Header.Set(name, value)
		}
	}

	return nil
}

func isValidHTTPHeaderName(name string) bool {
	if name == "" {
		return false
	}

	for _, char := range name {
		if char > 127 || !(char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || strings.ContainsRune("!#$%&'*+-.^_`|~", char)) {
			return false
		}
	}

	return true
}

func isTimeoutError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func formatAITimeoutError(timeout int) error {
	return fmt.Errorf("智能排版超时（当前 %d 秒），请提高模型的“智能排版超时”或更换响应更快的模型", timeout)
}

func readLimitedAIResponse(body io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("模型响应过大，已超过 %d KB，请缩短输出或检查接口返回内容", limit/1024)
	}
	return data, nil
}

func stripOuterMarkdownFence(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "```") || !strings.HasSuffix(trimmed, "```") {
		return trimmed
	}

	lines := strings.Split(trimmed, "\n")
	if len(lines) < 2 {
		return trimmed
	}

	first := strings.TrimSpace(lines[0])
	last := strings.TrimSpace(lines[len(lines)-1])
	if !strings.HasPrefix(first, "```") || last != "```" {
		return trimmed
	}

	return strings.TrimSpace(strings.Join(lines[1:len(lines)-1], "\n"))
}

// GetExePath returns the path of the current executable
func (a *App) GetExePath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}

// IsFileAssociationSet checks if .md files are associated with this app
func (a *App) IsFileAssociationSet() bool {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Classes\mdviewer.mdfile\shell\open\command`, registry.READ)
	if err != nil {
		return false
	}
	defer key.Close()
	return true
}

// RegisterFileAssociation registers .md file association with this app
func (a *App) RegisterFileAssociation() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取程序路径: %w", err)
	}

	// 使用管理员权限执行注册
	cmd := exec.Command("powershell", "-Command", fmt.Sprintf(`
		# 注册应用程序
		New-Item -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 注册文件类型
		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Value 'Markdown 文档' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Value '"%s",0' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 关联 .md 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		# 关联 .markdown 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		Write-Host "success"
	`, exePath, exePath, exePath))
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("注册失败: %w, 输出: %s", err, string(output))
	}

	return nil
}

// encodeBase64 encodes bytes to base64 string without importing encoding/base64
// Actually, let's just use the standard library
func encodeBase64(data []byte) string {
	const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

	result := make([]byte, 0, (len(data)+2)/3*4)

	for i := 0; i < len(data); i += 3 {
		var n uint32
		remaining := len(data) - i

		if remaining >= 3 {
			n = uint32(data[i])<<16 | uint32(data[i+1])<<8 | uint32(data[i+2])
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				base64Chars[(n>>6)&0x3F],
				base64Chars[n&0x3F],
			)
		} else if remaining == 2 {
			n = uint32(data[i])<<16 | uint32(data[i+1])<<8
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				base64Chars[(n>>6)&0x3F],
				'=',
			)
		} else {
			n = uint32(data[i]) << 16
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				'=',
				'=',
			)
		}
	}

	return string(result)
}
