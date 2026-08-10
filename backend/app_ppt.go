package backend

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	pptPromptVersion      = "3"
	pptShellVersion       = "3"
	maxPresentationInput  = 16 * 1024 * 1024
	maxPresentationOutput = 32 * 1024 * 1024
	pptDiagnosticLogName  = "ppt-diagnostic.log"
	pptDiagnosticBuildID  = "reference-parser-v2"
)

var unsafeBentoMarkup = regexp.MustCompile(`(?is)<\s*/?\s*script\b|\bon[a-z0-9_-]+\s*=|javascript\s*:`)
var embeddedBentoJSONPattern = regexp.MustCompile(`(?is)<script\b[^>]*\btype=["']application/bento\+json["'][^>]*\bid=["']bento-doc["'][^>]*>(.*?)</script\s*>`)

func normalizePptSourcePath(value string) string {
	return strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
}

func pptArtifactKey(sourcePath string) string {
	sum := sha256.Sum256([]byte(normalizePptSourcePath(sourcePath)))
	return hex.EncodeToString(sum[:])
}

func (a *App) ensurePptArtifactDir() (string, error) {
	a.mu.Lock()
	if strings.TrimSpace(a.pptArtifactDir) != "" {
		dir := a.pptArtifactDir
		a.mu.Unlock()
		return dir, nil
	}
	a.mu.Unlock()

	candidates := make([]string, 0, 2)
	if exePath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exePath), "data", "ppt-artifacts"))
	}
	if configDir, err := os.UserConfigDir(); err == nil {
		candidates = append(candidates, filepath.Join(configDir, "mdviewer", "ppt-artifacts"))
	}
	if len(candidates) == 0 {
		candidates = append(candidates, filepath.Join(os.TempDir(), "mdviewer", "ppt-artifacts"))
	}

	var lastErr error
	for _, candidate := range candidates {
		if err := os.MkdirAll(candidate, 0o755); err != nil {
			lastErr = err
			continue
		}
		a.mu.Lock()
		if a.pptArtifactDir == "" {
			a.pptArtifactDir = candidate
		}
		dir := a.pptArtifactDir
		a.mu.Unlock()
		return dir, nil
	}
	if lastErr == nil {
		lastErr = errors.New("无法创建 PPT 工件目录")
	}
	return "", lastErr
}

func (a *App) appendPptDiagnostic(format string, args ...any) {
	dir, err := a.ensurePptArtifactDir()
	if err != nil {
		return
	}
	path := filepath.Join(dir, pptDiagnosticLogName)
	line := fmt.Sprintf("%s | %s | %s\n", time.Now().Format(time.RFC3339), pptDiagnosticBuildID, fmt.Sprintf(format, args...))
	if info, statErr := os.Stat(path); statErr == nil && info.Size() >= 256*1024 {
		_ = os.WriteFile(path, []byte(line), 0o644)
		return
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(line)
}

func (a *App) pptArtifactPaths(sourcePath string) (string, string, error) {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" {
		return "", "", errors.New("PPT 来源路径为空")
	}
	dir, err := a.ensurePptArtifactDir()
	if err != nil {
		return "", "", err
	}
	base := filepath.Join(dir, pptArtifactKey(cleanPath))
	return base + ".bento.html", base + ".meta.json", nil
}

// GetPptArtifact returns the latest saved deck for a source document. The
// frontend compares SourceHash with its current Markdown hash to distinguish
// a reusable deck from a stale one.
func (a *App) GetPptArtifact(sourcePath string) (*PptArtifactRecord, error) {
	htmlPath, metaPath, err := a.pptArtifactPaths(sourcePath)
	if err != nil {
		return nil, err
	}
	htmlBytes, err := os.ReadFile(htmlPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取 PPT 文件失败: %w", err)
	}
	jsonText, err := extractBentoJSONFromHTML(string(htmlBytes))
	if err != nil {
		return nil, fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	if _, err := extractAndValidateBentoJSON(jsonText); err != nil {
		return nil, fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	record := &PptArtifactRecord{
		SourcePath: normalizePptSourcePath(sourcePath),
		FileName:   "演示文稿.bento.html",
		HTML:       string(htmlBytes),
	}
	if metaBytes, readErr := os.ReadFile(metaPath); readErr == nil {
		if err := json.Unmarshal(metaBytes, record); err != nil {
			return nil, fmt.Errorf("解析 PPT 元数据失败: %w", err)
		}
		record.HTML = string(htmlBytes)
	} else if !errors.Is(readErr, os.ErrNotExist) {
		return nil, fmt.Errorf("读取 PPT 元数据失败: %w", readErr)
	}
	if len(record.Volumes) == 0 {
		record.Volumes = []PptArtifactVolumeRecord{{
			Index: 0, FileName: record.FileName, HTML: record.HTML, UpdatedAt: record.UpdatedAt,
		}}
	} else {
		base := strings.TrimSuffix(htmlPath, ".bento.html")
		for index := range record.Volumes {
			if record.Volumes[index].UpdatedAt <= 0 {
				record.Volumes[index].HTML = ""
				continue
			}
			volumePath := htmlPath
			if record.Volumes[index].Index > 0 {
				volumePath = fmt.Sprintf("%s.volume-%02d.bento.html", base, record.Volumes[index].Index+1)
			}
			volumeHTML, volumeErr := os.ReadFile(volumePath)
			if volumeErr != nil {
				return nil, fmt.Errorf("读取第 %d 卷 PPT 失败: %w", record.Volumes[index].Index+1, volumeErr)
			}
			record.Volumes[index].HTML = string(volumeHTML)
		}
		if len(record.Volumes) > 0 && record.Volumes[0].HTML != "" {
			record.HTML = record.Volumes[0].HTML
			record.FileName = record.Volumes[0].FileName
		}
	}
	return record, nil
}

func (a *App) SavePptArtifact(sourcePath, sourceHash, fileName, html string) error {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" || strings.TrimSpace(sourceHash) == "" {
		return errors.New("PPT 来源或文档摘要为空")
	}
	if len(html) == 0 || int64(len(html)) > maxPresentationOutput {
		return errors.New("PPT 文件为空或超过大小限制")
	}
	if !strings.HasSuffix(strings.ToLower(strings.TrimSpace(fileName)), ".bento.html") {
		fileName = strings.TrimSpace(fileName) + ".bento.html"
	}
	if strings.TrimSpace(fileName) == ".bento.html" {
		fileName = "演示文稿.bento.html"
	}
	jsonText, err := extractBentoJSONFromHTML(html)
	if err != nil {
		return fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	if _, err := extractAndValidateBentoJSON(jsonText); err != nil {
		return fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	htmlPath, metaPath, err := a.pptArtifactPaths(cleanPath)
	if err != nil {
		return fmt.Errorf("准备 PPT 存储目录失败: %w", err)
	}
	record := PptArtifactRecord{
		SourcePath:    cleanPath,
		SourceHash:    strings.TrimSpace(sourceHash),
		FileName:      fileName,
		UpdatedAt:     time.Now().UnixMilli(),
		ShellVersion:  pptShellVersion,
		PromptVersion: pptPromptVersion,
	}
	metaBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("生成 PPT 元数据失败: %w", err)
	}
	if err := os.WriteFile(htmlPath, []byte(html), 0o644); err != nil {
		return fmt.Errorf("写入 PPT 文件失败: %w", err)
	}
	if err := os.WriteFile(metaPath, metaBytes, 0o644); err != nil {
		return fmt.Errorf("写入 PPT 元数据失败: %w", err)
	}
	return nil
}

func (a *App) SavePptArtifactVolume(sourcePath, sourceHash, fileName string, volumeIndex, volumeCount int, html string) error {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" || strings.TrimSpace(sourceHash) == "" {
		return errors.New("PPT 来源或文档摘要为空")
	}
	if volumeIndex < 0 || volumeCount < 1 || volumeIndex >= volumeCount || volumeCount > 20 {
		return errors.New("PPT 分卷参数无效")
	}
	if len(html) == 0 || int64(len(html)) > maxPresentationOutput {
		return errors.New("PPT 文件为空或超过大小限制")
	}
	jsonText, err := extractBentoJSONFromHTML(html)
	if err != nil {
		return fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	if _, err := extractAndValidateBentoJSON(jsonText); err != nil {
		return fmt.Errorf("PPT 文件校验失败: %w", err)
	}
	if !strings.HasSuffix(strings.ToLower(strings.TrimSpace(fileName)), ".bento.html") {
		fileName = strings.TrimSpace(fileName) + ".bento.html"
	}
	htmlPath, metaPath, err := a.pptArtifactPaths(cleanPath)
	if err != nil {
		return err
	}
	volumePath := htmlPath
	if volumeIndex > 0 {
		volumePath = fmt.Sprintf("%s.volume-%02d.bento.html", strings.TrimSuffix(htmlPath, ".bento.html"), volumeIndex+1)
	}
	if err := os.WriteFile(volumePath, []byte(html), 0o644); err != nil {
		return fmt.Errorf("写入第 %d 卷 PPT 失败: %w", volumeIndex+1, err)
	}

	record := PptArtifactRecord{
		SourcePath: cleanPath, SourceHash: strings.TrimSpace(sourceHash),
		FileName: fileName, UpdatedAt: time.Now().UnixMilli(),
		ShellVersion: pptShellVersion, PromptVersion: pptPromptVersion,
		Volumes: make([]PptArtifactVolumeRecord, volumeCount),
	}
	if metaBytes, readErr := os.ReadFile(metaPath); readErr == nil {
		var previous PptArtifactRecord
		if json.Unmarshal(metaBytes, &previous) == nil && len(previous.Volumes) == volumeCount {
			record.Volumes = previous.Volumes
		}
	}
	for index := 0; index < volumeCount; index++ {
		if record.Volumes[index].FileName == "" {
			name := fileName
			if volumeCount > 1 {
				name = fmt.Sprintf("%s-%02d.bento.html", presentationBaseName(fileName), index+1)
			}
			record.Volumes[index] = PptArtifactVolumeRecord{Index: index, FileName: name}
		}
	}
	record.Volumes[volumeIndex] = PptArtifactVolumeRecord{
		Index: volumeIndex, FileName: fileName, UpdatedAt: record.UpdatedAt,
	}
	record.FileName = record.Volumes[0].FileName
	if err := writeJSONFileSafely(metaPath, record); err != nil {
		return fmt.Errorf("写入 PPT 元数据失败: %w", err)
	}
	return nil
}

func (a *App) DeletePptArtifact(sourcePath string) error {
	htmlPath, metaPath, err := a.pptArtifactPaths(sourcePath)
	if err != nil {
		return err
	}
	paths := []string{htmlPath, metaPath}
	if metaBytes, readErr := os.ReadFile(metaPath); readErr == nil {
		var record PptArtifactRecord
		if json.Unmarshal(metaBytes, &record) == nil {
			base := strings.TrimSuffix(htmlPath, ".bento.html")
			for _, volume := range record.Volumes {
				if volume.Index > 0 && volume.Index < 20 {
					paths = append(paths, fmt.Sprintf("%s.volume-%02d.bento.html", base, volume.Index+1))
				}
			}
		}
	}
	for _, path := range paths {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("删除 PPT 文件失败: %w", err)
		}
	}
	return nil
}

func presentationSystemPrompt() string {
	return `你是专业的中文演示文稿设计师。请把用户提供的 Markdown 内容整理成 Bento Slides 文档 JSON，只返回 JSON，不要 Markdown 代码围栏，不要解释。

输出必须符合 bento/slides v1 格式：根对象包含 format、version、docId、title、size、theme、slides、modified；size 固定为 1280x720；slides 至少 1 页。每页包含 id、background、transition、notes、elements。元素类型只能使用 text、shape、image、svg、chart、table、media。

设计要求：保留 Markdown 的事实、数字、链接和图片；按内容自然拆分 3-12 页；标题页简洁；每页信息密度适中；使用清晰的中文层级、留白、对比度和一致的主题；为每页选择 fade、slide、zoom 或 morph 转场；为标题、重点和图形加入适度 enter 动效，动效不能遮挡内容。所有文本必须放进足够大的元素框，避免溢出画布。图片优先使用输入内容中的 URL，不能虚构图片地址。没有图片时使用 shape、chart 或 table 表达结构。

JSON 安全要求：text.html 只允许安全的文本格式标签；禁止 script、事件属性和 javascript URL。所有 id 在对应范围内唯一。不要添加品牌、Logo、厂商名称、官网、GitHub、英文宣传语或与原文无关的内容。`
}

func normalizePresentationResponse(value string) (string, error) {
	content := strings.TrimSpace(value)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	if start := strings.Index(content, "{"); start >= 0 {
		if end := strings.LastIndex(content, "}"); end > start {
			content = content[start : end+1]
		}
	}
	if len(content) == 0 || len(content) > maxPresentationOutput {
		return "", errors.New("AI 返回的 PPT JSON 为空或过大")
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(content), &root); err != nil {
		return "", fmt.Errorf("JSON 语法无效: %w", err)
	}
	if _, exists := root["format"]; !exists {
		root["format"] = "bento/slides"
	}
	if version, exists := root["version"]; !exists {
		root["version"] = float64(1)
	} else if text, ok := version.(string); ok {
		parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(text), 64)
		if parseErr != nil || parsed != 1 {
			return "", errors.New("version 必须是 1")
		}
		root["version"] = float64(1)
	}
	normalized, err := json.Marshal(root)
	if err != nil {
		return "", fmt.Errorf("整理 PPT JSON 失败: %w", err)
	}
	content = string(normalized)
	if _, err := extractAndValidateBentoJSON(content); err != nil {
		return "", err
	}
	return content, nil
}

func extractBentoJSONFromHTML(html string) (string, error) {
	match := embeddedBentoJSONPattern.FindStringSubmatch(html)
	if len(match) != 2 || strings.TrimSpace(match[1]) == "" {
		return "", errors.New("缺少 bento-doc 数据块")
	}
	return strings.TrimSpace(match[1]), nil
}

func extractAndValidateBentoJSON(value string) (string, error) {
	var root map[string]any
	if err := json.Unmarshal([]byte(value), &root); err != nil {
		return "", fmt.Errorf("JSON 语法无效: %w", err)
	}
	if root["format"] != "bento/slides" {
		return "", errors.New("format 必须是 bento/slides")
	}
	if version, ok := root["version"].(float64); !ok || int(version) != 1 {
		return "", errors.New("version 必须是 1")
	}
	size, ok := root["size"].(map[string]any)
	if !ok || !validNumber(size["width"]) || !validNumber(size["height"]) {
		return "", errors.New("size 必须包含有效的 width 和 height")
	}
	width := size["width"].(float64)
	height := size["height"].(float64)
	if width < 320 || width > 4096 || height < 180 || height > 4096 {
		return "", errors.New("画布尺寸超出范围")
	}
	slides, ok := root["slides"].([]any)
	if !ok || len(slides) == 0 || len(slides) > 100 {
		return "", errors.New("slides 必须包含 1 到 100 页")
	}
	slideIDs := map[string]bool{}
	for _, rawSlide := range slides {
		slide, ok := rawSlide.(map[string]any)
		if !ok {
			return "", errors.New("slide 必须是对象")
		}
		slideID, _ := slide["id"].(string)
		if slideID == "" || slideIDs[slideID] {
			return "", errors.New("slide id 缺失或重复")
		}
		slideIDs[slideID] = true
		elements, ok := slide["elements"].([]any)
		if !ok || len(elements) > 300 {
			return "", errors.New("slide elements 无效")
		}
		ids := map[string]bool{}
		for _, rawElement := range elements {
			element, ok := rawElement.(map[string]any)
			if !ok {
				return "", errors.New("element 必须是对象")
			}
			id, _ := element["id"].(string)
			kind, _ := element["type"].(string)
			if id == "" || ids[id] {
				return "", errors.New("element id 缺失或重复")
			}
			ids[id] = true
			switch kind {
			case "text", "shape", "image", "svg", "chart", "table", "media":
			default:
				return "", fmt.Errorf("不支持的 element type: %s", kind)
			}
			if err := validateBentoElement(element, width, height); err != nil {
				return "", err
			}
		}
	}
	return value, nil
}

func validateBentoElement(element map[string]any, width, height float64) error {
	for _, key := range []string{"x", "y", "w", "h"} {
		if value, exists := element[key]; exists {
			if !validNumber(value) {
				return fmt.Errorf("element %s 坐标无效", key)
			}
			n := value.(float64)
			if math.Abs(n) > math.Max(width, height)*4 {
				return fmt.Errorf("element %s 超出范围", key)
			}
		}
	}
	for _, key := range []string{"html", "url", "src", "href", "svg"} {
		if value, exists := element[key].(string); exists && unsafeBentoMarkup.MatchString(value) {
			return fmt.Errorf("element %s 包含不安全内容", key)
		}
	}
	if err := rejectUnsafeBentoValue(element); err != nil {
		return err
	}
	return nil
}

func rejectUnsafeBentoValue(value any) error {
	switch typed := value.(type) {
	case string:
		if unsafeBentoMarkup.MatchString(typed) {
			return errors.New("element 包含不安全内容")
		}
	case []any:
		for _, item := range typed {
			if err := rejectUnsafeBentoValue(item); err != nil {
				return err
			}
		}
	case map[string]any:
		for _, item := range typed {
			if err := rejectUnsafeBentoValue(item); err != nil {
				return err
			}
		}
	}
	return nil
}

func validNumber(value any) bool {
	n, ok := value.(float64)
	return ok && !math.IsNaN(n) && !math.IsInf(n, 0)
}

func normalizeBentoShape(value any) string {
	shape, _ := value.(string)
	switch strings.ToLower(strings.TrimSpace(shape)) {
	case "ellipse", "oval", "circle":
		return "ellipse"
	case "triangle":
		return "triangle"
	case "arrow":
		return "arrow"
	case "line":
		return "line"
	case "path", "freeform", "curve":
		return "path"
	default:
		return "rect"
	}
}

// GeneratePresentationWithAI requests only the document model. The caller
// wraps this JSON in the already-built Bento shell on the frontend.
func (a *App) GeneratePresentationWithAI(req AIPresentationRequest) (string, error) {
	markdown := strings.TrimSpace(req.Markdown)
	if markdown == "" {
		return "", errors.New("Markdown 内容为空")
	}
	if len(markdown) > maxPresentationInput {
		return "", errors.New("Markdown 内容超过 PPT 生成限制")
	}
	modelName, err := resolveAIModelName(req.Model)
	if err != nil {
		return "", err
	}
	instruction := strings.TrimSpace(req.Instruction)
	if len([]rune(instruction)) > 2000 {
		instruction = string([]rune(instruction)[:2000])
	}
	assetManifest := strings.TrimSpace(req.AssetManifest)
	if len(assetManifest) > 20000 {
		assetManifest = assetManifest[:20000]
	}
	systemPrompt := presentationSystemPrompt()
	userPrompt := "请生成一份可编辑的 PPT 文档 JSON。\n\n"
	if instruction != "" {
		userPrompt += "额外设计要求：\n" + instruction + "\n\n"
	}
	if assetManifest != "" {
		userPrompt += "资源清单：\n" + assetManifest + "\n\n"
	}
	userPrompt += "Markdown 原文：\n<markdown>\n" + markdown + "\n</markdown>"
	progress := newAIProgressReporter(a, "presentation")
	progress.emitStarted("正在生成 PPT", "AI 正在分析文档结构并布局幻灯片")
	endpoint, body, err := prepareAIRequest(req.Model, aiRequestContext{
		Kind: "bento-slides", ModelName: modelName, Temperature: 0.35,
		SystemPrompt: systemPrompt, UserPrompt: userPrompt, Markdown: markdown, Instruction: instruction,
		Messages: []chatCompletionMessage{{Role: "system", Content: systemPrompt}, {Role: "user", Content: userPrompt}},
	})
	if err != nil {
		return "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(req.Model, endpoint, body,
		clampTimeout(req.Model.FormatTimeout, 900, 60, 3600), maxPresentationOutput, progress,
		aiContentLifecycleOptions{
			streamMessage:              "正在接收 PPT JSON",
			requestFailureMessage:      "PPT 生成请求失败",
			requestErrorPrefix:         "PPT 生成请求失败",
			interfaceFailureMessage:    "AI 接口返回错误",
			explicitFailureMessage:     "AI 返回了错误",
			httpErrorFormat:            "PPT 生成失败，HTTP %d",
			parsingMessage:             "正在校验 PPT JSON",
			contentParseFailureMessage: "PPT JSON 解析失败",
			contentExtractedMessage:    "已收到 PPT 内容",
		})
	if err != nil {
		return "", err
	}
	normalized, err := normalizePresentationResponse(content)
	if err != nil {
		progress.emitFailure("PPT JSON 校验失败", err.Error(), nil)
		return "", err
	}
	progress.emitCompleted("PPT 生成完成", "可以打开编辑器继续设计", len(normalized), aiExecutionResult{})
	return normalized, nil
}

type pptSlideTextLock struct {
	Token   string
	HTML    string
	Element map[string]any
}

// pptSlideContentLock makes a reference image a visual-only input. The model
// receives placeholders for existing text, then the original text is restored
// after the generated layout has been validated.
type pptSlideContentLock struct {
	Enabled bool
	Notes   string
	Texts   []pptSlideTextLock
}

func clonePptJSONMap(value map[string]any) (map[string]any, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var cloned map[string]any
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return nil, err
	}
	if cloned == nil {
		return nil, errors.New("PPT 元素为空")
	}
	return cloned, nil
}

func pptTextElementHTML(element map[string]any) string {
	for _, key := range []string{"html", "content", "text", "value", "label"} {
		if value, ok := element[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func buildPptSlideContentLock(slide map[string]any) (map[string]any, pptSlideContentLock, error) {
	lockedSlide, err := clonePptJSONMap(slide)
	if err != nil {
		return nil, pptSlideContentLock{}, err
	}
	lock := pptSlideContentLock{Enabled: true}
	lock.Notes, _ = slide["notes"].(string)
	elements, _ := lockedSlide["elements"].([]any)
	for _, rawElement := range elements {
		element, ok := rawElement.(map[string]any)
		if !ok || element["type"] != "text" {
			continue
		}
		htmlValue := pptTextElementHTML(element)
		if strings.TrimSpace(htmlValue) == "" {
			continue
		}
		originalElement, err := clonePptJSONMap(element)
		if err != nil {
			return nil, pptSlideContentLock{}, err
		}
		token := fmt.Sprintf("[[PPT_TEXT_%03d]]", len(lock.Texts)+1)
		lock.Texts = append(lock.Texts, pptSlideTextLock{
			Token:   token,
			HTML:    htmlValue,
			Element: originalElement,
		})
		element["html"] = token
		for _, key := range []string{"content", "text", "value", "label"} {
			delete(element, key)
		}
	}
	return lockedSlide, lock, nil
}

func (lock pptSlideContentLock) textForToken(token string) (pptSlideTextLock, bool) {
	for _, text := range lock.Texts {
		if text.Token == token {
			return text, true
		}
	}
	return pptSlideTextLock{}, false
}

func (lock pptSlideContentLock) nextUnusedText(used map[string]bool) (pptSlideTextLock, bool) {
	for _, text := range lock.Texts {
		if !used[text.Token] {
			return text, true
		}
	}
	return pptSlideTextLock{}, false
}

func setPptLockedText(element map[string]any, htmlValue string) {
	element["html"] = htmlValue
	for _, key := range []string{"content", "text", "value", "label"} {
		delete(element, key)
	}
}

func restorePptSlideContentLock(value, fallbackID string, width, height float64, lock pptSlideContentLock) (string, error) {
	var slide map[string]any
	if err := json.Unmarshal([]byte(value), &slide); err != nil || slide == nil {
		if err == nil {
			err = errors.New("单页 PPT 不是 JSON 对象")
		}
		return "", fmt.Errorf("恢复当前页内容失败: %w", err)
	}
	elements, ok := slide["elements"].([]any)
	if !ok {
		return "", errors.New("恢复当前页内容失败: 缺少 elements")
	}

	matchedTokens := make([]string, len(elements))
	reserved := make(map[string]bool, len(lock.Texts))
	for index, rawElement := range elements {
		element, ok := rawElement.(map[string]any)
		if !ok || element["type"] != "text" {
			continue
		}
		htmlValue, _ := element["html"].(string)
		for _, text := range lock.Texts {
			if !reserved[text.Token] && strings.Contains(htmlValue, text.Token) {
				matchedTokens[index] = text.Token
				reserved[text.Token] = true
				break
			}
		}
	}

	used := make(map[string]bool, len(lock.Texts))
	restored := make([]any, 0, len(elements)+len(lock.Texts))
	for index, rawElement := range elements {
		element, ok := rawElement.(map[string]any)
		if !ok || element["type"] != "text" {
			restored = append(restored, rawElement)
			continue
		}
		if token := matchedTokens[index]; token != "" {
			text, _ := lock.textForToken(token)
			setPptLockedText(element, text.HTML)
			used[token] = true
			restored = append(restored, element)
			continue
		}
		if text, found := lock.nextUnusedText(used); found {
			setPptLockedText(element, text.HTML)
			used[text.Token] = true
			restored = append(restored, element)
		}
		// Drop text not traceable to the current slide. This is the final
		// guard against a model copying words from a reference image.
	}
	for _, text := range lock.Texts {
		if used[text.Token] {
			continue
		}
		originalElement, err := clonePptJSONMap(text.Element)
		if err != nil {
			return "", fmt.Errorf("恢复当前页内容失败: %w", err)
		}
		setPptLockedText(originalElement, text.HTML)
		restored = append(restored, originalElement)
	}
	slide["elements"] = restored
	slide["notes"] = lock.Notes
	encoded, err := json.Marshal(slide)
	if err != nil {
		return "", fmt.Errorf("恢复当前页内容失败: %w", err)
	}
	return normalizePresentationSlideResponse(string(encoded), fallbackID, width, height)
}

func normalizePresentationSlideResponse(value, fallbackID string, width, height float64) (string, error) {
	content := strings.TrimSpace(value)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	if start := strings.Index(content, "{"); start >= 0 {
		if end := strings.LastIndex(content, "}"); end > start {
			content = content[start : end+1]
		}
	}
	if len(content) == 0 || len(content) > maxPresentationOutput {
		return "", errors.New("AI 返回的单页 PPT JSON 为空或过大")
	}

	var root map[string]any
	if err := json.Unmarshal([]byte(content), &root); err != nil {
		return "", fmt.Errorf("单页 JSON 语法无效: %w", err)
	}
	if root == nil {
		return "", errors.New("AI 返回的单页 PPT 不是 JSON 对象")
	}
	if nested, ok := root["slide"].(map[string]any); ok && nested != nil {
		root = nested
	}
	if slides, ok := root["slides"].([]any); ok {
		if len(slides) == 0 {
			return "", errors.New("AI 返回的单页 PPT 缺少 slide")
		}
		if slide, ok := slides[0].(map[string]any); ok {
			root = slide
		}
	}
	if strings.TrimSpace(fallbackID) != "" {
		root["id"] = strings.TrimSpace(fallbackID)
	}
	slideID, _ := root["id"].(string)
	if strings.TrimSpace(slideID) == "" {
		return "", errors.New("AI 返回的单页 PPT 缺少 id")
	}
	elements, ok := root["elements"].([]any)
	if !ok {
		return "", errors.New("AI 返回的单页 PPT 缺少 elements")
	}
	ids := make(map[string]bool, len(elements))
	for index, rawElement := range elements {
		element, ok := rawElement.(map[string]any)
		if !ok {
			return "", fmt.Errorf("第 %d 个元素不是对象", index+1)
		}
		if err := normalizeGeneratedElement(element, slideID, index, ids); err != nil {
			return "", err
		}
		elements[index] = element
	}
	root["elements"] = elements
	if width <= 0 {
		width = 1280
	}
	if height <= 0 {
		height = 720
	}
	wrapper := map[string]any{
		"format":   "bento/slides",
		"version":  float64(1),
		"docId":    "slide-validation",
		"title":    "单页 PPT",
		"size":     map[string]any{"width": width, "height": height},
		"theme":    map[string]any{},
		"slides":   []any{root},
		"modified": time.Now().UTC().Format(time.RFC3339),
	}
	wrapped, err := json.Marshal(wrapper)
	if err != nil {
		return "", fmt.Errorf("整理单页 PPT 失败: %w", err)
	}
	if _, err := extractAndValidateBentoJSON(string(wrapped)); err != nil {
		return "", err
	}
	normalized, err := json.Marshal(root)
	if err != nil {
		return "", fmt.Errorf("整理单页 PPT 失败: %w", err)
	}
	return string(normalized), nil
}

func (a *App) RegeneratePresentationSlideWithAI(req AIPresentationSlideRequest) (string, error) {
	if len(req.Slide) == 0 {
		return "", errors.New("当前页面内容为空")
	}
	modelName, err := resolveAIModelName(req.Model)
	if err != nil {
		return "", err
	}
	instruction := strings.TrimSpace(req.Instruction)
	if len([]rune(instruction)) > 2000 {
		instruction = string([]rune(instruction)[:2000])
	}
	sourceSlideJSON, err := json.Marshal(req.Slide)
	if err != nil || len(sourceSlideJSON) > maxPresentationInput {
		return "", errors.New("当前页面内容过大或格式无效")
	}
	contextJSON, err := json.Marshal(req.Context)
	if err != nil || len(contextJSON) > 2*1024*1024 {
		return "", errors.New("PPT 页面上下文过大或格式无效")
	}
	referenceImages := make([]string, 0, len(req.ReferenceImages))
	seenReferences := make(map[string]bool)
	for _, reference := range req.ReferenceImages {
		reference = strings.TrimSpace(reference)
		if reference == "" || seenReferences[reference] {
			continue
		}
		seenReferences[reference] = true
		referenceImages = append(referenceImages, reference)
		if len(referenceImages) >= maxPptReferenceImages {
			break
		}
	}
	promptSlide := req.Slide
	contentLock := pptSlideContentLock{}
	if len(referenceImages) > 0 {
		promptSlide, contentLock, err = buildPptSlideContentLock(req.Slide)
		if err != nil {
			return "", fmt.Errorf("准备当前页内容保护失败: %w", err)
		}
	}
	slideJSON, err := json.Marshal(promptSlide)
	if err != nil {
		return "", errors.New("当前页面内容过大或格式无效")
	}
	fallbackID, _ := req.Slide["id"].(string)
	userPrompt := "请根据当前幻灯片和页面上下文，重新设计当前这一页。当前幻灯片 JSON 与页面上下文是本页主题、标题、事实、数字、实体和结论的唯一内容来源；新增文字只能忠实重述或重组其中已有信息。严禁把参考图中的文字、数字、表格、人物身份、品牌、Logo、主题、事件或结论带入结果，即使它们看起来与本页相关。只返回一个 slide JSON 对象，不要返回 format、version、slides 等外层包装，不要返回 Markdown 代码围栏或解释。必须保留当前页面的 id，元素必须使用 x、y、w、h、rotation、opacity 字段，宽高字段必须使用 w 和 h，不要使用 width 和 height。元素类型只能使用 text、shape、image、svg、chart、table、media；shape 的 shape 字段只能使用 rect、ellipse、triangle、arrow、line、path，不要使用 circle 或其他自定义名称。\n\n"
	if contentLock.Enabled {
		userPrompt += "本页已开启内容锁定。<slide> 中的 [[PPT_TEXT_001]] 这类标记代表当前页已有文字；每个标记必须保留且只出现一次，不得改写、替换或新增其他文字。后端会在布局完成后恢复原始文本，因此你只负责重新设计版式、配色、图形和动效。\n\n"
	}
	if instruction != "" {
		userPrompt += "用户对本页的生成要求：\n" + instruction + "\n\n"
	}
	if len(referenceImages) > 0 {
		_, referenceStyleJSON, referenceErr := analyzePptReferencesLocally(referenceImages)
		if referenceErr != nil {
			return "", fmt.Errorf("分析单页参考图风格失败: %w", referenceErr)
		}
		userPrompt += "用户提供了参考图片。为防止图片中的内容污染本页，原始图片不会发送给模型；以下仅是本地提取的无文字视觉摘要。你只能借鉴其中的配色、明暗、留白和构图节奏，不能将其作为内容来源：\n<reference-style>\n" + referenceStyleJSON + "\n</reference-style>\n\n"
	}
	userPrompt += "当前幻灯片 JSON：\n<slide>\n" + string(slideJSON) + "\n</slide>\n\n页面上下文 JSON：\n<context>\n" + string(contextJSON) + "\n</context>"
	systemPrompt := presentationSystemPrompt() + "\n\n这是单页重新生成任务：最终只能输出一个 slide 对象，不能输出整套演示文稿。"
	runRequest := func(prompt string, images []string) (string, error) {
		endpoint, body, requestErr := prepareAIRequest(req.Model, aiRequestContext{
			Kind: "bento-slide-regenerate", ModelName: modelName, Temperature: 0.35,
			SystemPrompt: systemPrompt, UserPrompt: prompt, Instruction: instruction,
			ReferenceImages: images,
			Messages:        pptReferenceRequestMessages(systemPrompt, prompt, images),
		})
		if requestErr != nil {
			return "", requestErr
		}
		_, content, _, requestErr := a.executeAIContentLifecycle(req.Model, endpoint, body,
			clampTimeout(req.Model.FormatTimeout, 900, 60, 3600), maxPresentationOutput, nil,
			aiContentLifecycleOptions{
				requestFailureMessage:      "AI 单页重新生成请求失败",
				requestErrorPrefix:         "AI 单页重新生成请求失败",
				interfaceFailureMessage:    "AI 接口返回错误",
				explicitFailureMessage:     "AI 返回了错误",
				httpErrorFormat:            "AI 单页重新生成失败，HTTP %d",
				parsingMessage:             "正在校验单页 PPT JSON",
				contentParseFailureMessage: "单页 PPT JSON 解析失败",
				contentExtractedMessage:    "已收到单页 PPT 内容",
			})
		return content, requestErr
	}

	// Reference images are intentionally converted to local style signals above.
	// Passing their raw pixels to a vision model makes image text compete with
	// the page content and can replace the user's actual topic.
	content, err := runRequest(userPrompt, nil)
	if err != nil {
		return "", err
	}

	width, height := 1280.0, 720.0
	if size, ok := req.Context["size"].(map[string]any); ok {
		if value, ok := size["width"].(float64); ok {
			width = value
		}
		if value, ok := size["height"].(float64); ok {
			height = value
		}
	}
	normalized, err := normalizePresentationSlideResponse(content, fallbackID, width, height)
	if err != nil {
		return "", err
	}
	if contentLock.Enabled {
		return restorePptSlideContentLock(normalized, fallbackID, width, height, contentLock)
	}
	return normalized, nil
}
