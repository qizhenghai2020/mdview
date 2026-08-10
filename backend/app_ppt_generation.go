package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	stdhtml "html"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultPptBatchSize       = 3
	maxPptBatchSize           = 5
	maxPptGenerationSlides    = 500
	maxPptSlidesPerVolume     = 50
	maxPptBatchAttempts       = 3
	maxPptPlanningAttempts    = 3
	maxPptFailureContentRunes = 120000
)

var generatedHTMLTagPattern = regexp.MustCompile(`(?s)<[^>]*>`)

type AIPresentationGenerationRequest struct {
	Markdown          string        `json:"markdown"`
	SourcePath        string        `json:"sourcePath"`
	SourceHash        string        `json:"sourceHash"`
	FileName          string        `json:"fileName"`
	AssetManifest     string        `json:"assetManifest,omitempty"`
	Instruction       string        `json:"instruction,omitempty"`
	Density           string        `json:"density,omitempty"`
	TargetSlides      int           `json:"targetSlides,omitempty"`
	BatchSize         int           `json:"batchSize,omitempty"`
	ReferenceImages   []string      `json:"referenceImages,omitempty"`
	ReferenceMode     string        `json:"referenceMode,omitempty"`
	ReferenceUsage    string        `json:"referenceUsage,omitempty"`
	ReferenceStrength string        `json:"referenceStrength,omitempty"`
	Model             AIModelConfig `json:"model"`
}

type PptGenerationSlideRecord struct {
	ID          string `json:"id"`
	Index       int    `json:"index"`
	VolumeIndex int    `json:"volumeIndex"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Attempts    int    `json:"attempts"`
	Error       string `json:"error,omitempty"`
	RawContent  string `json:"rawContent,omitempty"`
	UpdatedAt   int64  `json:"updatedAt,omitempty"`
}

type PptGenerationVolumeRecord struct {
	Index           int    `json:"index"`
	Title           string `json:"title"`
	FileName        string `json:"fileName"`
	Status          string `json:"status"`
	DocumentJSON    string `json:"documentJson"`
	CompletedSlides int    `json:"completedSlides"`
	TotalSlides     int    `json:"totalSlides"`
}

type PptGenerationJobRecord struct {
	JobID             string                      `json:"jobId"`
	SourcePath        string                      `json:"sourcePath"`
	SourceHash        string                      `json:"sourceHash"`
	FileName          string                      `json:"fileName"`
	Density           string                      `json:"density,omitempty"`
	TargetSlides      int                         `json:"targetSlides,omitempty"`
	BatchSize         int                         `json:"batchSize,omitempty"`
	ReferenceMode     string                      `json:"referenceMode,omitempty"`
	ReferenceUsage    string                      `json:"referenceUsage,omitempty"`
	ReferenceStrength string                      `json:"referenceStrength,omitempty"`
	ReferenceFallback bool                        `json:"referenceFallback,omitempty"`
	ReferenceSpecJSON string                      `json:"referenceSpecJson,omitempty"`
	PlanningVersion   string                      `json:"planningVersion,omitempty"`
	StoryPlanJSON     string                      `json:"storyPlanJson,omitempty"`
	DesignSpecJSON    string                      `json:"designSpecJson,omitempty"`
	Status            string                      `json:"status"`
	Stage             string                      `json:"stage"`
	Message           string                      `json:"message"`
	Detail            string                      `json:"detail,omitempty"`
	Error             string                      `json:"error,omitempty"`
	FailurePhase      string                      `json:"failurePhase,omitempty"`
	RawContent        string                      `json:"rawContent,omitempty"`
	CompletedSlides   int                         `json:"completedSlides"`
	TotalSlides       int                         `json:"totalSlides"`
	CurrentSlide      int                         `json:"currentSlide"`
	CurrentBatch      int                         `json:"currentBatch"`
	TotalBatches      int                         `json:"totalBatches"`
	CurrentVolume     int                         `json:"currentVolume"`
	CanResume         bool                        `json:"canResume"`
	StartedAt         int64                       `json:"startedAt"`
	UpdatedAt         int64                       `json:"updatedAt"`
	ElapsedMs         int64                       `json:"elapsedMs"`
	Slides            []PptGenerationSlideRecord  `json:"slides"`
	Volumes           []PptGenerationVolumeRecord `json:"volumes"`
}

type pptGenerationRuntime struct {
	mu      sync.Mutex
	record  PptGenerationJobRecord
	request AIPresentationGenerationRequest
	plans   []pptSlidePlan
	cancel  context.CancelFunc
}

type pptSlidePlan struct {
	ID           string
	Index        int
	VolumeIndex  int
	Title        string
	Markdown     string
	Purpose      string
	KeyMessage   string
	Content      []string
	Evidence     []string
	VisualItems  []pptVisualItem
	VisualType   string
	VisualBrief  string
	LayoutIntent string
	Notes        string
}

type pptBatchPlan struct {
	ID          string
	Index       int
	VolumeIndex int
	Slides      []pptSlidePlan
}

type pptBatchPayload struct {
	Slides []map[string]any `json:"slides"`
}

type pptMarkdownSection struct {
	title string
	body  string
}

type pptDocument struct {
	Format   string         `json:"format"`
	Version  int            `json:"version"`
	DocID    string         `json:"docId"`
	Title    string         `json:"title"`
	Size     map[string]any `json:"size"`
	Theme    map[string]any `json:"theme"`
	Slides   []any          `json:"slides"`
	Modified string         `json:"modified"`
}

var markdownHeadingPattern = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*$`)
var markdownImagePattern = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)`)

func newPptJobID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err == nil {
		return "ppt-" + hex.EncodeToString(buffer)
	}
	return fmt.Sprintf("ppt-%d", time.Now().UnixNano())
}

func presentationBaseName(fileName string) string {
	name := strings.TrimSpace(fileName)
	for _, suffix := range []string{".markdown", ".md", ".txt", ".bento.html", ".html"} {
		if strings.HasSuffix(strings.ToLower(name), suffix) {
			name = strings.TrimSpace(name[:len(name)-len(suffix)])
			break
		}
	}
	if name == "" {
		name = "演示文稿"
	}
	return name
}

func normalizePptGenerationRequest(req AIPresentationGenerationRequest) (AIPresentationGenerationRequest, error) {
	req.Markdown = strings.TrimSpace(req.Markdown)
	req.SourcePath = normalizePptSourcePath(req.SourcePath)
	req.SourceHash = strings.TrimSpace(req.SourceHash)
	req.FileName = presentationBaseName(req.FileName) + ".bento.html"
	req.Instruction = strings.TrimSpace(req.Instruction)
	req.AssetManifest = strings.TrimSpace(req.AssetManifest)
	references := make([]string, 0, len(req.ReferenceImages))
	seenReferences := make(map[string]bool)
	for _, reference := range req.ReferenceImages {
		reference = strings.TrimSpace(reference)
		if reference == "" || seenReferences[reference] {
			continue
		}
		seenReferences[reference] = true
		references = append(references, reference)
		if len(references) >= maxPptReferenceImages {
			break
		}
	}
	req.ReferenceImages = references
	req.ReferenceMode = strings.ToLower(strings.TrimSpace(req.ReferenceMode))
	req.ReferenceUsage = strings.ToLower(strings.TrimSpace(req.ReferenceUsage))
	req.ReferenceStrength = strings.ToLower(strings.TrimSpace(req.ReferenceStrength))
	req.Density = strings.ToLower(strings.TrimSpace(req.Density))
	if req.Markdown == "" {
		return req, errors.New("Markdown 内容为空")
	}
	if len(req.Markdown) > maxPresentationInput {
		return req, errors.New("Markdown 内容超过 PPT 生成限制")
	}
	if req.SourcePath == "" || req.SourceHash == "" {
		return req, errors.New("PPT 来源或文档摘要为空")
	}
	if _, err := resolveAIModelName(req.Model); err != nil {
		return req, err
	}
	if req.BatchSize <= 0 {
		req.BatchSize = defaultPptBatchSize
	}
	if req.BatchSize > maxPptBatchSize {
		req.BatchSize = maxPptBatchSize
	}
	if req.TargetSlides != 0 && req.TargetSlides < 2 {
		return req, errors.New("PPT 自定义页数不能少于 2 页（含封面）")
	}
	if req.TargetSlides > maxPptGenerationSlides {
		return req, fmt.Errorf("PPT 自定义页数不能超过 %d 页", maxPptGenerationSlides)
	}
	if len([]rune(req.Instruction)) > 2000 {
		req.Instruction = string([]rune(req.Instruction)[:2000])
	}
	if len(req.AssetManifest) > 20000 {
		req.AssetManifest = req.AssetManifest[:20000]
	}
	switch req.Density {
	case "compact", "detailed":
	default:
		req.Density = "standard"
	}
	if req.ReferenceMode != "direct" {
		req.ReferenceMode = "smart"
	}
	switch req.ReferenceUsage {
	case "content", "style-content":
	default:
		req.ReferenceUsage = "style"
	}
	switch req.ReferenceStrength {
	case "subtle", "strong":
	default:
		req.ReferenceStrength = "balanced"
	}
	return req, nil
}

func markdownChunkTarget(density string) int {
	switch density {
	case "compact":
		return 6500
	case "detailed":
		return 2600
	default:
		return 4200
	}
}

func markdownDocumentTitle(markdown, fallback string) string {
	for _, line := range strings.Split(markdown, "\n") {
		if match := markdownHeadingPattern.FindStringSubmatch(strings.TrimSpace(line)); len(match) == 3 {
			return strings.TrimSpace(match[2])
		}
	}
	return presentationBaseName(fallback)
}

func splitLongMarkdownSection(title, section string, target int) []struct{ title, body string } {
	paragraphs := regexp.MustCompile(`\n\s*\n`).Split(strings.TrimSpace(section), -1)
	result := make([]struct{ title, body string }, 0)
	var builder strings.Builder
	part := 1
	flush := func() {
		body := strings.TrimSpace(builder.String())
		if body == "" {
			return
		}
		partTitle := title
		if part > 1 {
			partTitle = fmt.Sprintf("%s（续 %d）", title, part)
		}
		result = append(result, struct{ title, body string }{partTitle, body})
		builder.Reset()
		part++
	}
	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}
		if builder.Len() > 0 && builder.Len()+len(paragraph)+2 > target {
			flush()
		}
		if len(paragraph) > target {
			runes := []rune(paragraph)
			for len(runes) > 0 {
				limit := target
				if limit > len(runes) {
					limit = len(runes)
				}
				if builder.Len() > 0 {
					flush()
				}
				builder.WriteString(string(runes[:limit]))
				runes = runes[limit:]
				flush()
			}
			continue
		}
		if builder.Len() > 0 {
			builder.WriteString("\n\n")
		}
		builder.WriteString(paragraph)
	}
	flush()
	return result
}

func buildPptSlidePlans(markdown, density, fallbackTitle string) ([]pptSlidePlan, error) {
	return buildPptSlidePlansWithTarget(markdown, density, fallbackTitle, 0)
}

func buildPptSlidePlansWithTarget(markdown, density, fallbackTitle string, targetSlides int) ([]pptSlidePlan, error) {
	target := markdownChunkTarget(density)
	documentTitle := markdownDocumentTitle(markdown, fallbackTitle)
	sections := make([]pptMarkdownSection, 0)
	currentTitle := documentTitle
	var current strings.Builder
	flush := func() {
		body := strings.TrimSpace(current.String())
		if body != "" {
			sections = append(sections, pptMarkdownSection{currentTitle, body})
		}
		current.Reset()
	}
	for _, line := range strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if match := markdownHeadingPattern.FindStringSubmatch(trimmed); len(match) == 3 {
			if current.Len() > 0 {
				flush()
			}
			currentTitle = strings.TrimSpace(match[2])
		}
		current.WriteString(line)
		current.WriteByte('\n')
	}
	flush()
	if len(sections) == 0 {
		sections = append(sections, pptMarkdownSection{documentTitle, markdown})
	}

	chunks := make([]pptMarkdownSection, 0, len(sections))
	for _, item := range sections {
		parts := splitLongMarkdownSection(item.title, item.body, target)
		for _, part := range parts {
			chunks = append(chunks, pptMarkdownSection{part.title, part.body})
		}
	}
	if targetSlides > 0 {
		var err error
		chunks, err = rebalancePptMarkdownSections(chunks, targetSlides-1)
		if err != nil {
			return nil, err
		}
	}
	if len(chunks) > maxPptGenerationSlides-1 {
		return nil, fmt.Errorf("文档预计超过 %d 页，请降低详细程度或拆分文档", maxPptGenerationSlides)
	}

	plans := make([]pptSlidePlan, 0, len(chunks)+1)
	plans = append(plans, pptSlidePlan{
		ID: "slide-0001", Index: 0, VolumeIndex: 0, Title: documentTitle,
		Markdown: "# " + documentTitle + "\n\n" + firstMeaningfulParagraph(markdown),
	})
	for index, chunk := range chunks {
		planIndex := index + 1
		plans = append(plans, pptSlidePlan{
			ID:          fmt.Sprintf("slide-%04d", planIndex+1),
			Index:       planIndex,
			VolumeIndex: planIndex / maxPptSlidesPerVolume,
			Title:       chunk.title,
			Markdown:    chunk.body,
		})
	}
	return plans, nil
}

func rebalancePptMarkdownSections(chunks []pptMarkdownSection, target int) ([]pptMarkdownSection, error) {
	if target < 1 {
		return nil, errors.New("PPT 至少需要 1 页正文和 1 页封面")
	}
	if len(chunks) == 0 {
		return nil, errors.New("文档没有可用于生成 PPT 的正文")
	}
	if len(chunks) > target {
		merged := make([]pptMarkdownSection, 0, target)
		for index := 0; index < target; index++ {
			start := index * len(chunks) / target
			end := (index + 1) * len(chunks) / target
			parts := make([]string, 0, end-start)
			for _, chunk := range chunks[start:end] {
				parts = append(parts, chunk.body)
			}
			merged = append(merged, pptMarkdownSection{title: chunks[start].title, body: strings.Join(parts, "\n\n")})
		}
		chunks = merged
	}
	for len(chunks) < target {
		largestIndex := -1
		largestLength := 0
		for index, chunk := range chunks {
			if length := len([]rune(strings.TrimSpace(chunk.body))); length > largestLength {
				largestIndex = index
				largestLength = length
			}
		}
		if largestIndex < 0 || largestLength < 2 {
			return nil, fmt.Errorf("文档内容不足以生成 %d 页，请减少自定义页数", target+1)
		}
		left, right, ok := splitPptMarkdownSection(chunks[largestIndex])
		if !ok {
			return nil, fmt.Errorf("文档内容不足以生成 %d 页，请减少自定义页数", target+1)
		}
		chunks = append(chunks, pptMarkdownSection{})
		copy(chunks[largestIndex+2:], chunks[largestIndex+1:])
		chunks[largestIndex] = left
		chunks[largestIndex+1] = right
	}
	return chunks, nil
}

func splitPptMarkdownSection(section pptMarkdownSection) (pptMarkdownSection, pptMarkdownSection, bool) {
	runes := []rune(strings.TrimSpace(section.body))
	if len(runes) < 2 {
		return pptMarkdownSection{}, pptMarkdownSection{}, false
	}
	middle := len(runes) / 2
	splitAt := middle
	isBoundary := func(value rune) bool {
		return value == '\n' || strings.ContainsRune("。！？；.!?;", value)
	}
	for offset := 0; offset < len(runes)/2; offset++ {
		left := middle - offset
		if left > 0 && left < len(runes) && isBoundary(runes[left-1]) {
			splitAt = left
			break
		}
		right := middle + offset
		if right > 0 && right < len(runes) && isBoundary(runes[right-1]) {
			splitAt = right
			break
		}
	}
	leftBody := strings.TrimSpace(string(runes[:splitAt]))
	rightBody := strings.TrimSpace(string(runes[splitAt:]))
	if leftBody == "" || rightBody == "" {
		return pptMarkdownSection{}, pptMarkdownSection{}, false
	}
	return pptMarkdownSection{title: section.title, body: leftBody},
		pptMarkdownSection{title: section.title + "（续）", body: rightBody}, true
}

func firstMeaningfulParagraph(markdown string) string {
	for _, paragraph := range regexp.MustCompile(`\n\s*\n`).Split(markdown, -1) {
		value := strings.TrimSpace(paragraph)
		if value == "" || markdownHeadingPattern.MatchString(value) {
			continue
		}
		runes := []rune(value)
		if len(runes) > 280 {
			value = string(runes[:280])
		}
		return value
	}
	return ""
}

func buildPptBatches(plans []pptSlidePlan, batchSize int) []pptBatchPlan {
	result := make([]pptBatchPlan, 0)
	for start := 0; start < len(plans); {
		volumeIndex := plans[start].VolumeIndex
		end := start
		for end < len(plans) && end-start < batchSize && plans[end].VolumeIndex == volumeIndex {
			end++
		}
		result = append(result, pptBatchPlan{
			ID:          fmt.Sprintf("batch-%03d", len(result)+1),
			Index:       len(result),
			VolumeIndex: volumeIndex,
			Slides:      append([]pptSlidePlan(nil), plans[start:end]...),
		})
		start = end
	}
	return result
}

func defaultPresentationTheme() map[string]any {
	return map[string]any{
		"background":   "#F7F8FA",
		"color":        "#182230",
		"accent":       "#D84A4A",
		"fontFamily":   "Microsoft YaHei, PingFang SC, system-ui, sans-serif",
		"chartPalette": []any{"#D84A4A", "#2F6B5F", "#D29D2B", "#3976B8", "#7356A8", "#5C6675"},
		"table": map[string]any{
			"headerBg": "#182230", "headerColor": "#FFFFFF", "zebra": "rgba(24,34,48,0.05)",
			"borderColor": "rgba(24,34,48,0.16)", "borderWidth": 1, "cellPadX": 14,
			"cellPadY": 10, "fontSize": 18, "color": "#182230", "radius": 4,
		},
	}
}

func newPptDocument(title string, volumeIndex int) pptDocument {
	volumeTitle := title
	if volumeIndex > 0 {
		volumeTitle = fmt.Sprintf("%s（第 %d 卷）", title, volumeIndex+1)
	}
	return pptDocument{
		Format:   "bento/slides",
		Version:  1,
		DocID:    fmt.Sprintf("%s-v%02d", newPptJobID(), volumeIndex+1),
		Title:    volumeTitle,
		Size:     map[string]any{"width": 1280, "height": 720},
		Theme:    defaultPresentationTheme(),
		Slides:   []any{},
		Modified: time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func marshalPptDocument(document pptDocument) string {
	content, _ := json.Marshal(document)
	return string(content)
}

func createPptGenerationRecord(req AIPresentationGenerationRequest, plans []pptSlidePlan) PptGenerationJobRecord {
	title := markdownDocumentTitle(req.Markdown, req.FileName)
	volumeCount := 1
	if len(plans) > 0 {
		volumeCount = plans[len(plans)-1].VolumeIndex + 1
	}
	volumes := make([]PptGenerationVolumeRecord, volumeCount)
	for index := range volumes {
		doc := newPptDocument(title, index)
		fileName := req.FileName
		if volumeCount > 1 {
			fileName = fmt.Sprintf("%s-%02d.bento.html", presentationBaseName(req.FileName), index+1)
		}
		volumes[index] = PptGenerationVolumeRecord{
			Index: index, Title: doc.Title, FileName: fileName, Status: "pending",
			DocumentJSON: marshalPptDocument(doc),
		}
	}
	slides := make([]PptGenerationSlideRecord, len(plans))
	for index, plan := range plans {
		slides[index] = PptGenerationSlideRecord{
			ID: plan.ID, Index: plan.Index, VolumeIndex: plan.VolumeIndex,
			Title: plan.Title, Status: "pending",
		}
		volumes[plan.VolumeIndex].TotalSlides++
	}
	batches := buildPptBatches(plans, req.BatchSize)
	now := time.Now().UnixMilli()
	return PptGenerationJobRecord{
		JobID: newPptJobID(), SourcePath: req.SourcePath, SourceHash: req.SourceHash,
		FileName: req.FileName, Density: req.Density, TargetSlides: req.TargetSlides, BatchSize: req.BatchSize,
		ReferenceMode: req.ReferenceMode, ReferenceUsage: req.ReferenceUsage, ReferenceStrength: req.ReferenceStrength,
		Status: "running", Stage: "planned",
		Message: "已完成文档拆分，准备逐批生成", Detail: fmt.Sprintf("共 %d 页，分为 %d 批", len(plans), len(batches)),
		TotalSlides: len(plans), TotalBatches: len(batches), CanResume: true,
		StartedAt: now, UpdatedAt: now, Slides: slides, Volumes: volumes,
	}
}

func pptPlansMatchRecord(plans []pptSlidePlan, slides []PptGenerationSlideRecord) bool {
	if len(plans) != len(slides) {
		return false
	}
	for index := range plans {
		if plans[index].ID != slides[index].ID ||
			plans[index].VolumeIndex != slides[index].VolumeIndex ||
			plans[index].Title != slides[index].Title {
			return false
		}
	}
	return true
}

func resolvePptResumePlan(req *AIPresentationGenerationRequest, record *PptGenerationJobRecord) ([]pptSlidePlan, error) {
	if strings.TrimSpace(record.StoryPlanJSON) != "" {
		plans, err := plansFromPersistedStory(record.StoryPlanJSON, record.TotalSlides)
		if err != nil {
			return nil, fmt.Errorf("读取已保存的 AI 故事板失败: %w", err)
		}
		req.Density = record.Density
		req.TargetSlides = record.TargetSlides
		if record.BatchSize > 0 && record.BatchSize <= maxPptBatchSize {
			req.BatchSize = record.BatchSize
		}
		return plans, nil
	}
	densities := []string{record.Density}
	if record.Density == "" {
		densities = []string{req.Density, "compact", "standard", "detailed"}
	}
	seen := make(map[string]bool)
	var plans []pptSlidePlan
	for _, density := range densities {
		if seen[density] {
			continue
		}
		seen[density] = true
		candidate, err := buildPptSlidePlansWithTarget(req.Markdown, density, req.FileName, record.TargetSlides)
		if err != nil {
			return nil, err
		}
		if pptPlansMatchRecord(candidate, record.Slides) {
			plans = candidate
			req.Density = density
			req.TargetSlides = record.TargetSlides
			record.Density = density
			break
		}
	}
	if plans == nil {
		return nil, errors.New("文档拆分结果已变化，请重新生成 PPT")
	}

	if record.BatchSize > 0 && record.BatchSize <= maxPptBatchSize {
		req.BatchSize = record.BatchSize
	} else {
		batchSizes := []int{req.BatchSize, defaultPptBatchSize, 1, 2, 4, 5}
		for _, batchSize := range batchSizes {
			if batchSize < 1 || batchSize > maxPptBatchSize {
				continue
			}
			if record.TotalBatches <= 0 || len(buildPptBatches(plans, batchSize)) == record.TotalBatches {
				req.BatchSize = batchSize
				break
			}
		}
		record.BatchSize = req.BatchSize
	}
	return plans, nil
}

func clonePptGenerationRecord(record PptGenerationJobRecord) PptGenerationJobRecord {
	data, _ := json.Marshal(record)
	var clone PptGenerationJobRecord
	_ = json.Unmarshal(data, &clone)
	return clone
}

func (runtime *pptGenerationRuntime) snapshot() PptGenerationJobRecord {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.record.ElapsedMs = maxInt64(0, time.Now().UnixMilli()-runtime.record.StartedAt)
	return clonePptGenerationRecord(runtime.record)
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func (a *App) pptGenerationPath(sourcePath string) (string, error) {
	htmlPath, _, err := a.pptArtifactPaths(sourcePath)
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(htmlPath, ".bento.html") + ".generation.json", nil
}

func writeJSONFileSafely(path string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	temporary, err := os.CreateTemp(dir, ".ppt-generation-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	cleanup := func() { _ = os.Remove(temporaryPath) }
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		cleanup()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		cleanup()
		return err
	}
	if err := temporary.Close(); err != nil {
		cleanup()
		return err
	}
	if err := os.Rename(temporaryPath, path); err == nil {
		return nil
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		cleanup()
		return err
	}
	cleanup()
	return nil
}

func (a *App) persistPptGenerationRecord(record PptGenerationJobRecord) error {
	path, err := a.pptGenerationPath(record.SourcePath)
	if err != nil {
		return err
	}
	record.UpdatedAt = time.Now().UnixMilli()
	record.ElapsedMs = maxInt64(0, record.UpdatedAt-record.StartedAt)
	return writeJSONFileSafely(path, record)
}

func (a *App) loadPptGenerationRecord(sourcePath string) (*PptGenerationJobRecord, error) {
	path, err := a.pptGenerationPath(sourcePath)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var record PptGenerationJobRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, fmt.Errorf("解析 PPT 生成任务失败: %w", err)
	}
	if record.Status == "running" {
		record.Status = "paused"
		record.Stage = "interrupted"
		record.Message = "上次生成被中断，可以从已完成页面继续"
		record.CanResume = true
	}
	return &record, nil
}

func (a *App) emitPptJobProgress(record PptGenerationJobRecord, stage, message, detail, batchID string, attempt int, retryable bool) {
	a.emitAIFormatProgress(AIFormatProgressEvent{
		Kind: "presentation", Stage: stage, Message: message, Detail: detail,
		JobID: record.JobID, BatchID: batchID, VolumeIndex: record.CurrentVolume,
		CurrentSlide: record.CurrentSlide, CompletedSlides: record.CompletedSlides,
		TotalSlides: record.TotalSlides, Attempt: attempt, Retryable: retryable,
		ElapsedMs: maxInt64(0, time.Now().UnixMilli()-record.StartedAt),
	})
}

func (a *App) getPptRuntime(sourcePath string) *pptGenerationRuntime {
	key := pptArtifactKey(sourcePath)
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pptJobs[key]
}

func (a *App) setPptRuntime(sourcePath string, runtime *pptGenerationRuntime) {
	key := pptArtifactKey(sourcePath)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.pptJobs == nil {
		a.pptJobs = make(map[string]*pptGenerationRuntime)
	}
	if runtime == nil {
		delete(a.pptJobs, key)
		return
	}
	a.pptJobs[key] = runtime
}

func (a *App) clearPptRuntime(sourcePath string, runtime *pptGenerationRuntime) {
	key := pptArtifactKey(sourcePath)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.pptJobs[key] == runtime {
		delete(a.pptJobs, key)
	}
}

func (a *App) cancelAllPptGenerationJobs() {
	a.mu.Lock()
	runtimes := make([]*pptGenerationRuntime, 0, len(a.pptJobs))
	for _, runtime := range a.pptJobs {
		runtimes = append(runtimes, runtime)
	}
	a.pptJobs = make(map[string]*pptGenerationRuntime)
	a.mu.Unlock()
	for _, runtime := range runtimes {
		if runtime.cancel != nil {
			runtime.cancel()
		}
	}
}

func (a *App) StartPptGeneration(req AIPresentationGenerationRequest) (*PptGenerationJobRecord, error) {
	normalized, err := normalizePptGenerationRequest(req)
	if err != nil {
		return nil, err
	}
	if existing := a.getPptRuntime(normalized.SourcePath); existing != nil {
		snapshot := existing.snapshot()
		if snapshot.Status == "running" {
			return &snapshot, nil
		}
	}
	plans, err := buildPptSlidePlansWithTarget(normalized.Markdown, normalized.Density, normalized.FileName, normalized.TargetSlides)
	if err != nil {
		return nil, err
	}
	record := createPptGenerationRecord(normalized, plans)
	record.PlanningVersion = pptAIPlanningVersion
	record.Stage = "source-analyzing"
	record.Message = "正在理解文档并规划整套 PPT"
	record.Detail = fmt.Sprintf("预计生成 %d 页，AI 将重新组织内容与视觉叙事", len(plans))
	requestContext := a.ctx
	if requestContext == nil {
		requestContext = context.Background()
	}
	jobContext, cancel := context.WithCancel(requestContext)
	runtime := &pptGenerationRuntime{record: record, request: normalized, plans: plans, cancel: cancel}
	a.setPptRuntime(normalized.SourcePath, runtime)
	if err := a.persistPptGenerationRecord(record); err != nil {
		a.setPptRuntime(normalized.SourcePath, nil)
		cancel()
		return nil, fmt.Errorf("保存 PPT 生成任务失败: %w", err)
	}
	a.emitPptJobProgress(record, record.Stage, record.Message, record.Detail, "", 0, true)
	go a.runPptGeneration(jobContext, runtime)
	snapshot := runtime.snapshot()
	return &snapshot, nil
}

func (a *App) ResumePptGeneration(req AIPresentationGenerationRequest) (*PptGenerationJobRecord, error) {
	normalized, err := normalizePptGenerationRequest(req)
	if err != nil {
		return nil, err
	}
	if existing := a.getPptRuntime(normalized.SourcePath); existing != nil {
		snapshot := existing.snapshot()
		if snapshot.Status == "running" {
			return &snapshot, nil
		}
	}
	record, err := a.loadPptGenerationRecord(normalized.SourcePath)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return a.StartPptGeneration(normalized)
	}
	if record.SourceHash != normalized.SourceHash {
		return nil, errors.New("当前文档已变化，不能继续旧的 PPT 生成任务，请重新生成")
	}
	plans, err := resolvePptResumePlan(&normalized, record)
	if err != nil {
		return nil, err
	}
	for index := range plans {
		if record.Slides[index].Status != "completed" {
			record.Slides[index].Status = "pending"
			record.Slides[index].Error = ""
		}
	}
	record.Status = "running"
	record.Stage = "resuming"
	record.Message = "正在从已完成页面继续生成"
	record.Detail = fmt.Sprintf("已完成 %d / %d 页", record.CompletedSlides, record.TotalSlides)
	record.Error = ""
	record.FailurePhase = ""
	record.RawContent = ""
	record.CanResume = true
	requestContext := a.ctx
	if requestContext == nil {
		requestContext = context.Background()
	}
	jobContext, cancel := context.WithCancel(requestContext)
	runtime := &pptGenerationRuntime{record: *record, request: normalized, plans: plans, cancel: cancel}
	a.setPptRuntime(normalized.SourcePath, runtime)
	if err := a.persistPptGenerationRecord(*record); err != nil {
		a.setPptRuntime(normalized.SourcePath, nil)
		cancel()
		return nil, err
	}
	a.emitPptJobProgress(*record, "resuming", record.Message, record.Detail, "", 0, true)
	go a.runPptGeneration(jobContext, runtime)
	snapshot := runtime.snapshot()
	return &snapshot, nil
}

func (a *App) GetPptGenerationJob(sourcePath string) (*PptGenerationJobRecord, error) {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" {
		return nil, errors.New("PPT 来源路径为空")
	}
	if runtime := a.getPptRuntime(cleanPath); runtime != nil {
		snapshot := runtime.snapshot()
		return &snapshot, nil
	}
	return a.loadPptGenerationRecord(cleanPath)
}

func (a *App) CancelPptGeneration(sourcePath string) error {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" {
		return errors.New("PPT 来源路径为空")
	}
	runtime := a.getPptRuntime(cleanPath)
	if runtime == nil {
		return nil
	}
	runtime.mu.Lock()
	runtime.record.Status = "pausing"
	runtime.record.Stage = "cancelling"
	runtime.record.Message = "正在停止生成，已完成页面会保留"
	runtime.record.CanResume = true
	snapshot := clonePptGenerationRecord(runtime.record)
	runtime.mu.Unlock()
	_ = a.persistPptGenerationRecord(snapshot)
	a.emitPptJobProgress(snapshot, "cancelling", snapshot.Message, "", "", 0, true)
	runtime.cancel()
	return nil
}

func (a *App) DeletePptGenerationJob(sourcePath string) error {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" {
		return errors.New("PPT 来源路径为空")
	}
	_ = a.CancelPptGeneration(cleanPath)
	path, err := a.pptGenerationPath(cleanPath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	a.setPptRuntime(cleanPath, nil)
	return nil
}

func (a *App) runPptGeneration(ctx context.Context, runtime *pptGenerationRuntime) {
	defer a.clearPptRuntime(runtime.request.SourcePath, runtime)
	if runtime.record.PlanningVersion == pptAIPlanningVersion && strings.TrimSpace(runtime.record.StoryPlanJSON) == "" {
		if err := a.planPptStory(ctx, runtime); err != nil {
			if ctx.Err() != nil {
				a.pausePptRuntime(runtime, "生成已停止，AI 策划结果尚未完成")
				return
			}
			a.failPptPlanning(runtime, err, "")
			return
		}
	}
	batches := buildPptBatches(runtime.plans, runtime.request.BatchSize)
	for _, batch := range batches {
		if ctx.Err() != nil {
			a.pausePptRuntime(runtime, "生成已停止，已完成页面已保留")
			return
		}
		if runtime.batchAlreadyCompleted(batch) {
			continue
		}
		success := false
		var lastErr error
		var rawContent string
		for attempt := 1; attempt <= maxPptBatchAttempts; attempt++ {
			if ctx.Err() != nil {
				a.pausePptRuntime(runtime, "生成已停止，已完成页面已保留")
				return
			}
			runtime.beginBatch(batch, attempt)
			snapshot := runtime.snapshot()
			_ = a.persistPptGenerationRecord(snapshot)
			a.emitPptJobProgress(snapshot, "batch-started", snapshot.Message, snapshot.Detail, batch.ID, attempt, true)
			feedback := ""
			if lastErr != nil {
				feedback = lastErr.Error()
			}
			slides, raw, err := a.generatePptBatch(ctx, runtime, batch, attempt, feedback)
			rawContent = raw
			if err == nil {
				if err = runtime.completeBatch(batch, slides); err == nil {
					success = true
					snapshot = runtime.snapshot()
					if persistErr := a.persistPptGenerationRecord(snapshot); persistErr != nil {
						lastErr = persistErr
						success = false
						break
					}
					a.emitPptJobProgress(snapshot, "batch-completed", snapshot.Message, snapshot.Detail, batch.ID, attempt, true)
					break
				}
			}
			lastErr = err
			runtime.failBatchAttempt(batch, attempt, err, rawContent)
			snapshot = runtime.snapshot()
			_ = a.persistPptGenerationRecord(snapshot)
			if attempt < maxPptBatchAttempts {
				a.emitPptJobProgress(snapshot, "batch-retrying", "本批生成失败，正在自动重试", err.Error(), batch.ID, attempt, true)
			}
		}
		if !success {
			runtime.markBatchFailed(batch, lastErr, rawContent)
			snapshot := runtime.snapshot()
			_ = a.persistPptGenerationRecord(snapshot)
			a.emitPptJobProgress(snapshot, "batch-failed", snapshot.Message, snapshot.Detail, batch.ID, maxPptBatchAttempts, true)
			continue
		}
	}
	runtime.finish()
	snapshot := runtime.snapshot()
	_ = a.persistPptGenerationRecord(snapshot)
	stage := "completed"
	if snapshot.Status == "partial" {
		stage = "partial-completed"
	}
	a.emitPptJobProgress(snapshot, stage, snapshot.Message, snapshot.Detail, "", 0, snapshot.CanResume)
}

func (runtime *pptGenerationRuntime) batchAlreadyCompleted(batch pptBatchPlan) bool {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	for _, plan := range batch.Slides {
		if plan.Index >= len(runtime.record.Slides) || runtime.record.Slides[plan.Index].Status != "completed" {
			return false
		}
	}
	return true
}

func (runtime *pptGenerationRuntime) beginBatch(batch pptBatchPlan, attempt int) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.record.Status = "running"
	runtime.record.Stage = "generating-batch"
	runtime.record.CurrentBatch = batch.Index + 1
	runtime.record.CurrentVolume = batch.VolumeIndex
	runtime.record.CurrentSlide = batch.Slides[0].Index + 1
	runtime.record.Message = fmt.Sprintf("正在生成第 %d-%d 页", batch.Slides[0].Index+1, batch.Slides[len(batch.Slides)-1].Index+1)
	runtime.record.Detail = fmt.Sprintf("第 %d / %d 批，第 %d 次尝试", batch.Index+1, runtime.record.TotalBatches, attempt)
	runtime.record.Error = ""
	runtime.record.FailurePhase = ""
	runtime.record.RawContent = ""
	for _, plan := range batch.Slides {
		record := &runtime.record.Slides[plan.Index]
		record.Status = "generating"
		record.Attempts = attempt
		record.Error = ""
	}
	volume := &runtime.record.Volumes[batch.VolumeIndex]
	volume.Status = "generating"
	runtime.record.UpdatedAt = time.Now().UnixMilli()
}

func (runtime *pptGenerationRuntime) completeBatch(batch pptBatchPlan, slides []map[string]any) error {
	if len(slides) != len(batch.Slides) {
		return fmt.Errorf("本批应返回 %d 页，实际返回 %d 页", len(batch.Slides), len(slides))
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	volume := &runtime.record.Volumes[batch.VolumeIndex]
	var document pptDocument
	if err := json.Unmarshal([]byte(volume.DocumentJSON), &document); err != nil {
		return fmt.Errorf("读取 PPT 草稿失败: %w", err)
	}
	existing := make(map[string]int, len(document.Slides))
	for index, rawSlide := range document.Slides {
		if slide, ok := rawSlide.(map[string]any); ok {
			if id, _ := slide["id"].(string); id != "" {
				existing[id] = index
			}
		}
	}
	for index, slide := range slides {
		plan := batch.Slides[index]
		if existingIndex, ok := existing[plan.ID]; ok {
			document.Slides[existingIndex] = slide
		} else {
			document.Slides = append(document.Slides, slide)
		}
	}
	sort.SliceStable(document.Slides, func(left, right int) bool {
		leftMap, _ := document.Slides[left].(map[string]any)
		rightMap, _ := document.Slides[right].(map[string]any)
		return slideOrder(leftMap) < slideOrder(rightMap)
	})
	document.Modified = time.Now().UTC().Format(time.RFC3339Nano)
	documentJSON := marshalPptDocument(document)
	if _, err := extractAndValidateBentoJSON(documentJSON); err != nil {
		return fmt.Errorf("合并后的 PPT 文档无效: %w", err)
	}
	volume.DocumentJSON = documentJSON
	completedBefore := runtime.record.CompletedSlides
	for _, plan := range batch.Slides {
		record := &runtime.record.Slides[plan.Index]
		if record.Status != "completed" {
			runtime.record.CompletedSlides++
			volume.CompletedSlides++
		}
		record.Status = "completed"
		record.Error = ""
		record.RawContent = ""
		record.UpdatedAt = time.Now().UnixMilli()
	}
	if volume.CompletedSlides >= volume.TotalSlides {
		volume.Status = "completed"
	} else {
		volume.Status = "partial"
	}
	runtime.record.Stage = "batch-completed"
	runtime.record.Message = fmt.Sprintf("已完成 %d / %d 页", runtime.record.CompletedSlides, runtime.record.TotalSlides)
	runtime.record.Detail = fmt.Sprintf("本批新增 %d 页", runtime.record.CompletedSlides-completedBefore)
	runtime.record.UpdatedAt = time.Now().UnixMilli()
	return nil
}

func slideOrder(slide map[string]any) int {
	id, _ := slide["id"].(string)
	parts := strings.Split(id, "-")
	if len(parts) > 1 {
		if value, err := strconv.Atoi(parts[len(parts)-1]); err == nil {
			return value
		}
	}
	return math.MaxInt
}

func (runtime *pptGenerationRuntime) failBatchAttempt(batch pptBatchPlan, attempt int, err error, rawContent string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	message := "未知错误"
	if err != nil {
		message = err.Error()
	}
	for _, plan := range batch.Slides {
		record := &runtime.record.Slides[plan.Index]
		record.Status = "retrying"
		record.Attempts = attempt
		record.Error = message
		record.RawContent = limitPptRawContent(rawContent)
		record.UpdatedAt = time.Now().UnixMilli()
	}
	runtime.record.Error = message
	runtime.record.FailurePhase = "batch"
	runtime.record.RawContent = limitPptRawContent(rawContent)
	runtime.record.UpdatedAt = time.Now().UnixMilli()
}

func (runtime *pptGenerationRuntime) markBatchFailed(batch pptBatchPlan, err error, rawContent string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	message := "未知错误"
	if err != nil {
		message = err.Error()
	}
	for _, plan := range batch.Slides {
		record := &runtime.record.Slides[plan.Index]
		record.Status = "failed"
		record.Error = message
		record.RawContent = limitPptRawContent(rawContent)
		record.UpdatedAt = time.Now().UnixMilli()
	}
	runtime.record.Volumes[batch.VolumeIndex].Status = "partial"
	runtime.record.Stage = "batch-failed"
	runtime.record.Message = fmt.Sprintf("第 %d-%d 页生成失败，已继续处理后续页面", batch.Slides[0].Index+1, batch.Slides[len(batch.Slides)-1].Index+1)
	runtime.record.Detail = message
	runtime.record.Error = message
	runtime.record.FailurePhase = "batch"
	runtime.record.RawContent = limitPptRawContent(rawContent)
	runtime.record.CanResume = true
	runtime.record.UpdatedAt = time.Now().UnixMilli()
}

func (runtime *pptGenerationRuntime) finish() {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	failed := 0
	for _, slide := range runtime.record.Slides {
		if slide.Status != "completed" {
			failed++
		}
	}
	if failed == 0 {
		runtime.record.Status = "completed"
		runtime.record.Stage = "completed"
		runtime.record.Message = fmt.Sprintf("PPT 已生成，共 %d 页", runtime.record.TotalSlides)
		runtime.record.Detail = fmt.Sprintf("共 %d 卷，所有页面已保存", len(runtime.record.Volumes))
		runtime.record.Error = ""
		runtime.record.FailurePhase = ""
		runtime.record.RawContent = ""
		runtime.record.CanResume = false
	} else {
		runtime.record.Status = "partial"
		runtime.record.Stage = "partial-completed"
		runtime.record.Message = fmt.Sprintf("已生成 %d / %d 页", runtime.record.CompletedSlides, runtime.record.TotalSlides)
		runtime.record.Detail = fmt.Sprintf("有 %d 页未完成，可以稍后继续补充", failed)
		runtime.record.CanResume = true
	}
	runtime.record.CurrentSlide = 0
	runtime.record.UpdatedAt = time.Now().UnixMilli()
	runtime.record.ElapsedMs = maxInt64(0, runtime.record.UpdatedAt-runtime.record.StartedAt)
}

func (a *App) pausePptRuntime(runtime *pptGenerationRuntime, message string) {
	runtime.mu.Lock()
	runtime.record.Status = "paused"
	runtime.record.Stage = "paused"
	runtime.record.Message = message
	runtime.record.Detail = fmt.Sprintf("已完成 %d / %d 页", runtime.record.CompletedSlides, runtime.record.TotalSlides)
	runtime.record.CanResume = true
	for index := range runtime.record.Slides {
		if runtime.record.Slides[index].Status == "generating" || runtime.record.Slides[index].Status == "retrying" {
			runtime.record.Slides[index].Status = "pending"
		}
	}
	snapshot := clonePptGenerationRecord(runtime.record)
	runtime.mu.Unlock()
	_ = a.persistPptGenerationRecord(snapshot)
	a.emitPptJobProgress(snapshot, "paused", snapshot.Message, snapshot.Detail, "", 0, true)
}

func limitPptRawContent(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > maxPptFailureContentRunes {
		return string(runes[:maxPptFailureContentRunes]) + "\n\n[返回内容过长，已截断显示]"
	}
	return string(runes)
}

func presentationBatchSystemPrompt() string {
	return `你是专业中文演示文稿设计师。你只生成当前批次的 Bento Slides 页面，不生成根文档。

只返回一个 JSON 对象，结构必须是 {"slides":[...]}，不要代码围栏、解释或其他文字。slides 数量必须与页面计划完全相同，并按计划顺序返回。

每页必须包含 id、background、transition、notes、elements。元素类型只能是 text、shape、image、svg、chart、table、media。画布固定 1280x720。元素必须包含唯一 id、type、x、y、w、h、rotation、opacity，并补齐该类型需要的字段。text 元素的正文必须放在 html 字段中，content、text、value、label 字段不会被接受；html 不能为空。文本使用安全 HTML，只允许 b、i、u、s、code、br、span，禁止 script、事件属性和 javascript URL。

设计要求：
1. 页面计划已经是 AI 策划后的结论，必须以其中的 keyMessage、content、evidence 为准，不要把原始 Markdown 段落重新搬上页面，也不虚构信息。
2. 标题不少于 35px，正文不少于 18px；文字过多时继续概括，不缩成难以阅读的小字。单个文本框不应承载整页正文，不能做“大白卡片 + 大段文字”。
3. 每页必须把 visualType 和 visualBrief 画成真实的信息关系：comparison 用对照、timeline 用节点、process 用流程、architecture 用层级、matrix 用二维关系、chart 用图表、table 用紧凑表格、kpi 用重点数字。shape 只能辅助结构，不能只堆几个空白矩形冒充可视化。
4. 优先使用 2-5 个短文本元素配合图形、图表、表格、SVG 或原文图片；相邻页面必须更换信息结构和构图，不要连续使用同一种三栏卡片或相同白底布局。
5. 版式参考：cover 使用标题与抽象构图；insight 使用一句结论配证据；comparison 使用左右或三列对照；chart 使用左侧解释右侧主图；process/timeline 用画布中部的连贯节点；action 用优先级与下一步收束。所有元素要留出 48px 以上安全边距，不得越界或相互遮挡。
6. 转场使用 fade、slide、zoom 或 morph；标题、重点数字和图形可以使用 fx.enter、fx.order 或 fx.countUp，动效适度。
7. 不添加任何品牌、Logo、厂商名称、官网、GitHub、英文宣传语、Source of truth、TODO、文件路径或与原文无关的信息。
8. 页面和元素 id 必须使用页面计划指定的 id 前缀，不能重复。`
}

func presentationContentBatchSystemPrompt() string {
	return `你是中文演示文稿的内容编辑和信息设计师。你只负责把已经完成的页面计划润色为可供版式引擎使用的内容，不负责画布坐标、字体、颜色、形状或 Bento JSON 页面。

只返回一个 JSON 对象，结构必须是 {"slides":[...]}，不要代码围栏、解释或其他文字。slides 数量必须与页面计划完全相同，按计划顺序返回。每页字段只能包含：id、headline、supportingText、items、evidence、visualItems。

字段要求：
1. headline 是一句可直接放大呈现的中文结论，不重复标题，不超过 52 个字符。
2. supportingText 是对结论的必要补充，不超过 96 个字符。items 是 2-5 条短句，evidence 只保留可核验事实、条件或数字。
3. visualItems 用于真实信息关系，每项结构为 {"label":"","value":"","detail":""}。chart/kpi 的 value 只能填写页面计划或证据中已经存在的数值；没有数字时留空，不能编造。comparison、timeline、process、architecture、matrix、table、action 用 label 与 detail 表达对象、阶段、层级或行动。
4. 不要输出 x、y、w、h、fontSize、html、elements、background、transition 或任何布局字段；这些由本地版式编译器统一生成。
5. 必须忠于页面计划和原文事实，不重新搬运 Markdown 段落，不杜撰数字、案例、来源或结论。全部使用自然中文，不添加品牌、Logo、厂商名称、官网、GitHub、英文宣传语、文件路径、Source of truth 或 TODO。`
}

func (a *App) generatePptBatch(ctx context.Context, runtime *pptGenerationRuntime, batch pptBatchPlan, attempt int, qualityFeedback string) ([]map[string]any, string, error) {
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		return nil, "", err
	}
	systemPrompt := presentationContentBatchSystemPrompt()
	var userPrompt strings.Builder
	userPrompt.WriteString("请润色下面页面计划对应的 PPT 内容草稿。页面会由本地模板负责稳定排版。\n\n")
	userPrompt.WriteString("整套视觉规范：\n")
	if strings.TrimSpace(runtime.record.DesignSpecJSON) != "" {
		userPrompt.WriteString(runtime.record.DesignSpecJSON)
	} else {
		theme, _ := json.Marshal(defaultPresentationTheme())
		userPrompt.Write(theme)
	}
	userPrompt.WriteString("\n\n整套叙事上下文：\n")
	userPrompt.WriteString(storyContextForBatch(runtime.record.StoryPlanJSON, batch))
	userPrompt.WriteString("\n\n页面计划：\n")
	for _, plan := range batch.Slides {
		userPrompt.WriteString(fmt.Sprintf("\n<slide id=%q index=%q title=%q>\n", plan.ID, strconv.Itoa(plan.Index+1), plan.Title))
		brief, _ := json.Marshal(map[string]any{
			"purpose": plan.Purpose, "keyMessage": plan.KeyMessage, "content": plan.Content,
			"evidence": plan.Evidence, "visualItems": plan.VisualItems, "visualType": plan.VisualType, "visualBrief": plan.VisualBrief,
			"layoutIntent": plan.LayoutIntent, "speakerNotes": plan.Notes,
		})
		userPrompt.Write(brief)
		userPrompt.WriteString("\n</slide>\n")
	}
	if runtime.request.Instruction != "" {
		userPrompt.WriteString("\n额外设计要求：\n")
		userPrompt.WriteString(runtime.request.Instruction)
		userPrompt.WriteByte('\n')
	}
	if runtime.request.AssetManifest != "" {
		userPrompt.WriteString("\n原文资源清单：\n")
		userPrompt.WriteString(runtime.request.AssetManifest)
		userPrompt.WriteByte('\n')
	}
	if attempt > 1 {
		userPrompt.WriteString("\n这是内容质量修复重试。必须逐项修复以下问题，同时保持事实准确：\n")
		userPrompt.WriteString(qualityFeedback)
		userPrompt.WriteString("\n严格返回合法 JSON，并确保页面数、页面 id 和内容字段完整。\n")
	}

	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-content-batch", ModelName: modelName, Temperature: 0.24,
		SystemPrompt: systemPrompt, UserPrompt: userPrompt.String(),
		Markdown: strings.Join(batchMarkdownParts(batch), "\n\n"), Instruction: runtime.request.Instruction,
		Messages: []chatCompletionMessage{{Role: "system", Content: systemPrompt}, {Role: "user", Content: userPrompt.String()}},
	})
	if err != nil {
		return nil, "", err
	}
	snapshot := runtime.snapshot()
	progress := newPptProgressReporter(a, snapshot.JobID, batch.ID, batch.VolumeIndex, batch.Slides[0].Index+1, snapshot.CompletedSlides, snapshot.TotalSlides, attempt)
	progress.emitStarted("正在完善当前批次内容", fmt.Sprintf("第 %d-%d 页", batch.Slides[0].Index+1, batch.Slides[len(batch.Slides)-1].Index+1))
	execution, content, _, err := a.executeAIContentLifecycle(
		runtime.request.Model,
		endpoint,
		body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200),
		maxPresentationOutput,
		progress,
		aiContentLifecycleOptions{
			requestContext:             ctx,
			streamMessage:              "正在接收当前批次内容",
			requestFailureMessage:      "当前批次请求失败",
			requestErrorPrefix:         "PPT 批次请求失败",
			interfaceFailureMessage:    "AI 接口返回错误",
			explicitFailureMessage:     "AI 返回了错误",
			httpErrorFormat:            "PPT 批次生成失败，HTTP %d",
			parsingMessage:             "正在解析当前批次内容",
			contentParseFailureMessage: "当前批次返回解析失败",
			contentExtractedMessage:    "已收到当前批次内容",
		},
	)
	if err != nil {
		raw := strings.TrimSpace(string(execution.ResponseBody))
		return nil, raw, err
	}
	drafts, err := normalizePptContentBatch(content, batch.Slides)
	if err != nil {
		progress.emitFailure("当前批次 JSON 校验失败", err.Error(), &execution)
		return nil, content, err
	}
	progress.emitStarted("正在应用专业版式", fmt.Sprintf("第 %d-%d 页", batch.Slides[0].Index+1, batch.Slides[len(batch.Slides)-1].Index+1))
	slides, err := compilePptBatch(batch.Slides, drafts, runtime.record.DesignSpecJSON)
	if err != nil {
		progress.emitFailure("当前批次版式编译失败", err.Error(), &execution)
		return nil, content, err
	}
	if err := validatePptBatchQuality(slides, batch.Slides); err != nil {
		progress.emitFailure("当前批次设计质量未达标", err.Error(), &execution)
		return nil, content, err
	}
	progress.emitCompleted("当前批次已完成专业排版", fmt.Sprintf("已生成 %d 页", len(slides)), len(content), execution)
	return slides, content, nil
}

func batchMarkdownParts(batch pptBatchPlan) []string {
	parts := make([]string, len(batch.Slides))
	for index, plan := range batch.Slides {
		parts[index] = plan.Markdown
	}
	return parts
}

func extractJSONObject(value string) string {
	content := strings.TrimSpace(value)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	if start := strings.IndexAny(content, "[{"); start >= 0 {
		lastObject := strings.LastIndex(content, "}")
		lastArray := strings.LastIndex(content, "]")
		end := lastObject
		if lastArray > end {
			end = lastArray
		}
		if end > start {
			return strings.TrimSpace(content[start : end+1])
		}
	}
	return content
}

func normalizePresentationBatch(value string, plans []pptSlidePlan) ([]map[string]any, error) {
	content := extractJSONObject(value)
	if content == "" {
		return nil, errors.New("AI 返回的页面内容为空")
	}
	var decoded any
	if err := json.Unmarshal([]byte(content), &decoded); err != nil {
		return nil, fmt.Errorf("JSON 语法无效: %w", err)
	}
	var rawSlides []any
	switch typed := decoded.(type) {
	case []any:
		rawSlides = typed
	case map[string]any:
		if slides, ok := typed["slides"].([]any); ok {
			rawSlides = slides
		} else if slide, ok := typed["slide"].(map[string]any); ok {
			rawSlides = []any{slide}
		}
	}
	if len(rawSlides) != len(plans) {
		return nil, fmt.Errorf("本批应返回 %d 页，实际返回 %d 页", len(plans), len(rawSlides))
	}
	result := make([]map[string]any, len(plans))
	for index, plan := range plans {
		slide, ok := rawSlides[index].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("第 %d 页不是有效对象", plan.Index+1)
		}
		normalized, err := normalizeGeneratedSlide(slide, plan)
		if err != nil {
			return nil, fmt.Errorf("第 %d 页校验失败: %w", plan.Index+1, err)
		}
		result[index] = normalized
	}
	return result, nil
}

func normalizeGeneratedSlide(slide map[string]any, plan pptSlidePlan) (map[string]any, error) {
	slide["id"] = plan.ID
	if _, ok := slide["background"].(string); !ok {
		slide["background"] = "#F7F8FA"
	}
	transition, _ := slide["transition"].(string)
	switch transition {
	case "fade", "slide", "zoom", "morph", "none":
	default:
		slide["transition"] = "fade"
	}
	if _, ok := slide["notes"].(string); !ok {
		slide["notes"] = ""
	}
	rawElements, ok := slide["elements"].([]any)
	if !ok {
		return nil, errors.New("elements 必须是数组")
	}
	if len(rawElements) > 120 {
		return nil, errors.New("单页元素数量超过 120")
	}
	ids := make(map[string]bool, len(rawElements))
	textElements := 0
	hasVisibleText := false
	hasContentVisual := false
	for index, rawElement := range rawElements {
		element, ok := rawElement.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("第 %d 个元素不是对象", index+1)
		}
		if err := normalizeGeneratedElement(element, plan.ID, index, ids); err != nil {
			return nil, err
		}
		switch element["type"] {
		case "text":
			textElements++
			hasVisibleText = hasVisibleText || hasMeaningfulGeneratedText(element["html"])
		case "image", "svg", "chart", "table", "media":
			hasContentVisual = true
		}
		rawElements[index] = element
	}
	if textElements > 0 && !hasVisibleText {
		return nil, errors.New("页面中的文本元素内容全部为空")
	}
	if textElements == 0 && !hasContentVisual {
		return nil, errors.New("页面没有可见文本或有效的图像、图表、表格、媒体内容")
	}
	slide["elements"] = rawElements
	if err := rejectUnsafeBentoValue(slide); err != nil {
		return nil, err
	}
	return slide, nil
}

func normalizeGeneratedElement(element map[string]any, slideID string, index int, ids map[string]bool) error {
	kind, _ := element["type"].(string)
	switch kind {
	case "text", "shape", "image", "svg", "chart", "table", "media":
	default:
		return fmt.Errorf("不支持的 element type: %s", kind)
	}
	id, _ := element["id"].(string)
	if id == "" || ids[id] {
		id = fmt.Sprintf("%s-el-%03d", slideID, index+1)
	}
	ids[id] = true
	element["id"] = id
	element["rotation"] = normalizedNumber(element["rotation"], 0, -360, 360)
	element["opacity"] = normalizedNumber(element["opacity"], 1, 0, 1)
	element["x"] = normalizedNumber(element["x"], 80, -1280, 2560)
	element["y"] = normalizedNumber(element["y"], 80, -720, 1440)
	element["w"] = normalizedNumber(element["w"], 480, 1, 2560)
	element["h"] = normalizedNumber(element["h"], 120, 1, 1440)
	switch kind {
	case "text":
		htmlValue, _ := element["html"].(string)
		if strings.TrimSpace(htmlValue) == "" {
			for _, key := range []string{"content", "text", "value", "label"} {
				if alternate, ok := element[key].(string); ok && strings.TrimSpace(alternate) != "" {
					htmlValue = alternate
					break
				}
			}
		}
		element["html"] = htmlValue
		delete(element, "content")
		delete(element, "text")
		delete(element, "value")
		delete(element, "label")
		element["fontSize"] = normalizedNumber(element["fontSize"], 24, 10, 160)
		if _, ok := element["fontFamily"].(string); !ok {
			element["fontFamily"] = "Microsoft YaHei, PingFang SC, system-ui, sans-serif"
		}
		element["fontWeight"] = normalizedNumber(element["fontWeight"], 400, 100, 900)
		if _, ok := element["color"].(string); !ok {
			element["color"] = "#182230"
		}
		if _, ok := element["align"].(string); !ok {
			element["align"] = "left"
		}
		if _, ok := element["valign"].(string); !ok {
			element["valign"] = "top"
		}
		element["lineHeight"] = normalizedNumber(element["lineHeight"], 1.3, 0.8, 3)
	case "shape":
		element["shape"] = normalizeBentoShape(element["shape"])
		if _, ok := element["fill"].(string); !ok {
			element["fill"] = "#D84A4A"
		}
		if _, ok := element["stroke"].(string); !ok {
			element["stroke"] = "transparent"
		}
		element["strokeWidth"] = normalizedNumber(element["strokeWidth"], 0, 0, 40)
	case "image":
		if _, ok := element["src"].(string); !ok {
			if url, ok := element["url"].(string); ok {
				element["src"] = url
			} else {
				return errors.New("image 元素缺少 src")
			}
		}
		if _, ok := element["fit"].(string); !ok {
			element["fit"] = "cover"
		}
	case "svg":
		if _, asset := element["asset"].(string); !asset {
			if _, markup := element["markup"].(string); !markup {
				if raw, ok := element["svg"].(string); ok {
					element["markup"] = raw
				} else {
					return errors.New("svg 元素缺少 markup")
				}
			}
		}
	case "chart":
		if _, ok := element["option"].(map[string]any); !ok {
			return errors.New("chart 元素缺少 option")
		}
	case "table":
		if _, ok := element["rows"].([]any); !ok {
			return errors.New("table 元素缺少 rows")
		}
	case "media":
		if _, ok := element["src"].(string); !ok {
			return errors.New("media 元素缺少 src")
		}
	}
	return validateBentoElement(element, 1280, 720)
}

func hasMeaningfulGeneratedText(value any) bool {
	markup, ok := value.(string)
	if !ok {
		return false
	}
	plain := generatedHTMLTagPattern.ReplaceAllString(markup, " ")
	plain = stdhtml.UnescapeString(plain)
	plain = strings.ReplaceAll(plain, "\u00a0", " ")
	return strings.TrimSpace(plain) != ""
}

func normalizedNumber(value any, fallback, minimum, maximum float64) float64 {
	var number float64
	switch typed := value.(type) {
	case float64:
		number = typed
	case float32:
		number = float64(typed)
	case int:
		number = float64(typed)
	case json.Number:
		number, _ = typed.Float64()
	case string:
		number, _ = strconv.ParseFloat(strings.TrimSpace(typed), 64)
	default:
		number = fallback
	}
	if math.IsNaN(number) || math.IsInf(number, 0) {
		number = fallback
	}
	if number < minimum {
		number = minimum
	}
	if number > maximum {
		number = maximum
	}
	return number
}
