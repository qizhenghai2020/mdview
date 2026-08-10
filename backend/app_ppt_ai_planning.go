package backend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	stdhtml "html"
	"regexp"
	"strings"
	"time"
)

// pptAIPlanningVersion marks jobs whose page plans were created by the model,
// rather than by the legacy heading-and-character-count splitter.
const pptAIPlanningVersion = "ai-story-v2"

const (
	pptPlanningSourceWindowRunes  = 28000
	pptPlanningDirectSourceRunes  = 36000
	pptStoryboardSlidesPerRequest = 24
)

type pptDesignSpec struct {
	VisualDirection    string   `json:"visualDirection"`
	Palette            []string `json:"palette"`
	BackgroundStrategy string   `json:"backgroundStrategy"`
	Typography         string   `json:"typography"`
	CardTreatment      string   `json:"cardTreatment"`
	ChartAndTableStyle string   `json:"chartAndTableStyle"`
	ImageTreatment     string   `json:"imageTreatment,omitempty"`
	ReferenceNote      string   `json:"referenceNote,omitempty"`
	MotionStrategy     string   `json:"motionStrategy"`
	LayoutRhythm       []string `json:"layoutRhythm"`
}

type pptReferenceSpec struct {
	VisualDirection    string   `json:"visualDirection"`
	Palette            []string `json:"palette"`
	BackgroundStrategy string   `json:"backgroundStrategy"`
	Typography         string   `json:"typography"`
	CardTreatment      string   `json:"cardTreatment"`
	ImageTreatment     string   `json:"imageTreatment"`
	LayoutRhythm       []string `json:"layoutRhythm"`
	ContentSignals     []string `json:"contentSignals"`
	Avoid              []string `json:"avoid"`
}

// UnmarshalJSON accepts both the documented string arrays and the common
// single-string shorthand returned by otherwise valid vision models.
func (spec *pptReferenceSpec) UnmarshalJSON(data []byte) error {
	type rawReferenceSpec struct {
		VisualDirection    string          `json:"visualDirection"`
		Palette            json.RawMessage `json:"palette"`
		BackgroundStrategy string          `json:"backgroundStrategy"`
		Typography         string          `json:"typography"`
		CardTreatment      string          `json:"cardTreatment"`
		ImageTreatment     string          `json:"imageTreatment"`
		LayoutRhythm       json.RawMessage `json:"layoutRhythm"`
		ContentSignals     json.RawMessage `json:"contentSignals"`
		Avoid              json.RawMessage `json:"avoid"`
	}
	var raw rawReferenceSpec
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	palette, err := parsePptReferenceStringList(raw.Palette)
	if err != nil {
		return fmt.Errorf("palette: %w", err)
	}
	layoutRhythm, err := parsePptReferenceStringList(raw.LayoutRhythm)
	if err != nil {
		return fmt.Errorf("layoutRhythm: %w", err)
	}
	contentSignals, err := parsePptReferenceStringList(raw.ContentSignals)
	if err != nil {
		return fmt.Errorf("contentSignals: %w", err)
	}
	avoid, err := parsePptReferenceStringList(raw.Avoid)
	if err != nil {
		return fmt.Errorf("avoid: %w", err)
	}
	*spec = pptReferenceSpec{
		VisualDirection: raw.VisualDirection, Palette: palette, BackgroundStrategy: raw.BackgroundStrategy,
		Typography: raw.Typography, CardTreatment: raw.CardTreatment, ImageTreatment: raw.ImageTreatment,
		LayoutRhythm: layoutRhythm, ContentSignals: contentSignals, Avoid: avoid,
	}
	return nil
}

func parsePptReferenceStringList(value json.RawMessage) ([]string, error) {
	if text := strings.TrimSpace(string(value)); text == "" || text == "null" {
		return nil, nil
	}
	var items []string
	if err := json.Unmarshal(value, &items); err == nil {
		return items, nil
	}
	var item string
	if err := json.Unmarshal(value, &item); err != nil {
		return nil, errors.New("应为字符串或字符串数组")
	}
	return strings.FieldsFunc(item, func(char rune) bool {
		return char == '\n' || char == '\r' || char == ',' || char == '，' || char == ';' || char == '；' || char == '、' || char == '|'
	}), nil
}

type pptStorySlide struct {
	ID           string          `json:"id,omitempty"`
	Index        int             `json:"index,omitempty"`
	VolumeIndex  int             `json:"volumeIndex,omitempty"`
	Title        string          `json:"title"`
	Purpose      string          `json:"purpose"`
	KeyMessage   string          `json:"keyMessage"`
	Content      []string        `json:"content"`
	Evidence     []string        `json:"evidence"`
	VisualItems  []pptVisualItem `json:"visualItems,omitempty"`
	VisualType   string          `json:"visualType"`
	VisualBrief  string          `json:"visualBrief"`
	LayoutIntent string          `json:"layoutIntent"`
	Notes        string          `json:"speakerNotes,omitempty"`
}

type pptStoryPlan struct {
	Title     string          `json:"title"`
	Audience  string          `json:"audience"`
	Objective string          `json:"objective"`
	Narrative string          `json:"narrative"`
	KeyFacts  []string        `json:"keyFacts"`
	Design    pptDesignSpec   `json:"design"`
	Slides    []pptStorySlide `json:"slides"`
}

type pptDeckChapter struct {
	Title        string   `json:"title"`
	Purpose      string   `json:"purpose"`
	Focus        string   `json:"focus"`
	SlideCount   int      `json:"slideCount"`
	VisualRhythm []string `json:"visualRhythm"`
}

type pptDeckBlueprint struct {
	Title     string           `json:"title"`
	Audience  string           `json:"audience"`
	Objective string           `json:"objective"`
	Narrative string           `json:"narrative"`
	KeyFacts  []string         `json:"keyFacts"`
	Design    pptDesignSpec    `json:"design"`
	Chapters  []pptDeckChapter `json:"chapters"`
}

func (a *App) planPptStory(ctx context.Context, runtime *pptGenerationRuntime) error {
	targetSlides := len(runtime.plans)
	if targetSlides < 2 {
		return errors.New("PPT 页面计划为空")
	}

	a.updatePptPlanningProgress(runtime, "source-analyzing", "正在理解文档内容", fmt.Sprintf("正在提取叙事、事实和可视化线索（目标 %d 页）", targetSlides))
	source, err := a.preparePptPlanningSource(ctx, runtime)
	if err != nil {
		return err
	}
	if len(runtime.request.ReferenceImages) > 0 && runtime.request.ReferenceMode == "smart" {
		a.updatePptPlanningProgress(runtime, "reference-analyzing", "正在分析参考图风格", fmt.Sprintf("读取 %d 张参考图的色彩、版式和内容线索", len(runtime.request.ReferenceImages)))
		spec, specJSON, err := a.analyzePptReferences(ctx, runtime)
		if err != nil {
			if fallbackErr := a.enableLocalPptReferenceFallback(runtime, err); fallbackErr != nil {
				return fallbackErr
			}
		} else {
			_ = spec
			runtime.mu.Lock()
			runtime.record.ReferenceSpecJSON = specJSON
			runtime.mu.Unlock()
		}
	}

	var lastErr error
	var lastRawContent string
	for attempt := 1; attempt <= maxPptPlanningAttempts; attempt++ {
		stage := "story-planning"
		message := "正在规划整套 PPT 的叙事与视觉"
		if attempt > 1 {
			stage = "story-retrying"
			message = "正在修正整套 PPT 策划"
		}
		detail := fmt.Sprintf("第 %d / %d 次策划尝试", attempt, maxPptPlanningAttempts)
		if lastErr != nil {
			detail = fmt.Sprintf("%s：%s", detail, lastErr.Error())
		}
		a.updatePptPlanningProgress(runtime, stage, message, detail)

		story, rawContent, err := a.generatePptStoryPlan(ctx, runtime, source, targetSlides, lastErr)
		if err != nil && isUnsupportedPptImageMessageError(err) && !pptReferenceFallbackActive(runtime) {
			if fallbackErr := a.enableLocalPptReferenceFallback(runtime, err); fallbackErr != nil {
				return fallbackErr
			}
			story, rawContent, err = a.generatePptStoryPlan(ctx, runtime, source, targetSlides, nil)
		}
		if strings.TrimSpace(rawContent) != "" {
			lastRawContent = rawContent
		}
		if err == nil {
			story.Design = mergePptReferenceDesign(story.Design, runtime.record.ReferenceSpecJSON, runtime.request)
			a.applyPptStoryPlan(runtime, story)
			snapshot := runtime.snapshot()
			if persistErr := a.persistPptGenerationRecord(snapshot); persistErr != nil {
				return fmt.Errorf("保存 AI 故事板失败: %w", persistErr)
			}
			a.emitPptJobProgress(snapshot, "story-planned", "已完成内容策划和视觉总纲", fmt.Sprintf("共 %d 页，准备逐批生成", len(story.Slides)), "", attempt, true)
			return nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("AI 未返回可用的 PPT 策划")
	}
	runtime.mu.Lock()
	runtime.record.RawContent = limitPptRawContent(lastRawContent)
	runtime.mu.Unlock()
	return fmt.Errorf("AI 策划失败: %w", lastErr)
}

func (a *App) analyzePptReferences(ctx context.Context, runtime *pptGenerationRuntime) (pptReferenceSpec, string, error) {
	jobID := ""
	if runtime != nil {
		jobID = runtime.snapshot().JobID
	}
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		a.appendPptDiagnostic("reference-analysis job=%s model-resolution-failed: %s", jobID, pptDiagnosticText(err.Error(), 240))
		return pptReferenceSpec{}, "", err
	}
	system := `你是演示文稿视觉研究员。请只分析用户提供的参考图片，提取可迁移到 PPT 的视觉规律，不要复刻品牌、Logo、具体文案或图片中的私人信息。只返回 JSON 对象：{"visualDirection":"","palette":["#RRGGBB"],"backgroundStrategy":"","typography":"","cardTreatment":"","imageTreatment":"","layoutRhythm":[""],"contentSignals":[""],"avoid":[""]}。palette 只返回 3-6 个最有代表性的十六进制颜色；layoutRhythm、contentSignals、avoid 必须是 JSON 字符串数组，不能返回单个字符串。所有描述简洁、可执行。`
	user := fmt.Sprintf("请分析这组参考图片，并按参考用途“%s”、参考强度“%s”提炼视觉系统。只关注可迁移的风格和版式规律。", runtime.request.ReferenceUsage, runtime.request.ReferenceStrength)
	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-reference-analysis", ModelName: modelName, Temperature: 0.12,
		SystemPrompt: system, UserPrompt: user, Instruction: runtime.request.Instruction,
		ReferenceImages: runtime.request.ReferenceImages,
		Messages:        pptReferenceRequestMessages(system, user, runtime.request.ReferenceImages),
	})
	if err != nil {
		return pptReferenceSpec{}, "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(runtime.request.Model, endpoint, body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200), maxPresentationOutput, nil,
		aiContentLifecycleOptions{
			requestContext: ctx, streamMessage: "正在分析参考图", requestFailureMessage: "参考图分析请求失败",
			requestErrorPrefix: "参考图分析失败", interfaceFailureMessage: "AI 接口返回错误",
			explicitFailureMessage: "AI 返回了错误", httpErrorFormat: "参考图分析失败，HTTP %d",
			parsingMessage: "正在解析参考图分析结果", contentParseFailureMessage: "参考图分析结果解析失败",
			contentExtractedMessage: "已完成参考图分析",
		})
	if err != nil {
		a.appendPptDiagnostic("reference-analysis job=%s request-failed: %s", jobID, pptDiagnosticText(err.Error(), 240))
		return pptReferenceSpec{}, "", err
	}
	a.appendPptDiagnostic("reference-analysis job=%s response %s", jobID, pptReferencePayloadShape(content))
	spec, err := normalizePptReferenceSpec(content)
	if err != nil {
		a.appendPptDiagnostic("reference-analysis job=%s parse-failed: %s", jobID, pptDiagnosticText(err.Error(), 240))
		return pptReferenceSpec{}, content, err
	}
	a.appendPptDiagnostic("reference-analysis job=%s parsed palette=%d layout=%d signals=%d avoid=%d", jobID, len(spec.Palette), len(spec.LayoutRhythm), len(spec.ContentSignals), len(spec.Avoid))
	encoded, _ := json.Marshal(spec)
	return spec, string(encoded), nil
}

func pptReferencePayloadShape(content string) string {
	value := extractJSONObject(content)
	if value == "" {
		return fmt.Sprintf("payload=%dB object=missing", len(content))
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(value), &fields); err != nil {
		return fmt.Sprintf("payload=%dB object=invalid", len(content))
	}
	kind := func(name string) string {
		text := strings.TrimSpace(string(fields[name]))
		if text == "" || text == "null" {
			return "missing"
		}
		switch text[0] {
		case '"':
			return "string"
		case '[':
			return "array"
		case '{':
			return "object"
		default:
			return "other"
		}
	}
	return fmt.Sprintf("payload=%dB palette=%s layoutRhythm=%s contentSignals=%s avoid=%s", len(content), kind("palette"), kind("layoutRhythm"), kind("contentSignals"), kind("avoid"))
}

func pptDiagnosticText(value string, maximum int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	runes := []rune(value)
	if maximum > 0 && len(runes) > maximum {
		return string(runes[:maximum])
	}
	return value
}

func normalizePptReferenceSpec(content string) (pptReferenceSpec, error) {
	var spec pptReferenceSpec
	value := extractJSONObject(content)
	if value == "" {
		return spec, errors.New("AI 返回的参考图分析为空")
	}
	if err := json.Unmarshal([]byte(value), &spec); err != nil {
		return spec, fmt.Errorf("参考图分析 JSON 无效: %w", err)
	}
	spec.VisualDirection = cleanPptPlanText(spec.VisualDirection, 180)
	spec.BackgroundStrategy = cleanPptPlanText(spec.BackgroundStrategy, 140)
	spec.Typography = cleanPptPlanText(spec.Typography, 140)
	spec.CardTreatment = cleanPptPlanText(spec.CardTreatment, 140)
	spec.ImageTreatment = cleanPptPlanText(spec.ImageTreatment, 140)
	spec.LayoutRhythm = cleanPptPlanList(spec.LayoutRhythm, 8, 100)
	spec.ContentSignals = cleanPptPlanList(spec.ContentSignals, 8, 100)
	spec.Avoid = cleanPptPlanList(spec.Avoid, 8, 100)
	validPalette := make([]string, 0, len(spec.Palette))
	for _, color := range spec.Palette {
		color = strings.TrimSpace(color)
		if pptHexColorPattern.MatchString(color) {
			validPalette = append(validPalette, color)
		}
		if len(validPalette) >= 6 {
			break
		}
	}
	spec.Palette = validPalette
	return spec, nil
}

func mergePptReferenceDesign(design pptDesignSpec, referenceJSON string, request AIPresentationGenerationRequest) pptDesignSpec {
	if strings.TrimSpace(referenceJSON) == "" {
		return normalizePptDesignSpec(design)
	}
	var reference pptReferenceSpec
	if json.Unmarshal([]byte(referenceJSON), &reference) != nil {
		return normalizePptDesignSpec(design)
	}
	design = normalizePptDesignSpec(design)
	strength := request.ReferenceStrength
	if strength != "subtle" && strength != "strong" {
		strength = "balanced"
	}
	usage := request.ReferenceUsage
	if usage != "content" && usage != "style-content" {
		usage = "style"
	}

	// Content-only references guide the storyboard but do not unexpectedly recolor the deck.
	applyVisualStyle := usage != "content" || strength == "strong"
	if applyVisualStyle && strength == "subtle" {
		design.Palette = mergePptReferenceAccent(design.Palette, reference.Palette)
	}
	if applyVisualStyle && strength != "subtle" {
		if reference.VisualDirection != "" {
			if strength == "strong" {
				design.VisualDirection = reference.VisualDirection
			} else {
				design.VisualDirection = strings.TrimSpace(design.VisualDirection + "；参考图风格：" + reference.VisualDirection)
			}
		}
		if len(reference.Palette) > 0 {
			design.Palette = append([]string(nil), reference.Palette...)
		}
		if reference.BackgroundStrategy != "" {
			design.BackgroundStrategy = reference.BackgroundStrategy
		}
		if reference.Typography != "" {
			design.Typography = reference.Typography
		}
		if reference.CardTreatment != "" {
			design.CardTreatment = reference.CardTreatment
		}
		if reference.ImageTreatment != "" {
			design.ImageTreatment = reference.ImageTreatment
		}
		if len(reference.LayoutRhythm) > 0 {
			if strength == "strong" {
				design.LayoutRhythm = append([]string(nil), reference.LayoutRhythm...)
			} else {
				design.LayoutRhythm = append(design.LayoutRhythm, reference.LayoutRhythm...)
			}
		}
	}
	design.ReferenceNote = fmt.Sprintf("参考图模式：%s；用途：%s；强度：%s", request.ReferenceMode, usage, strength)
	return normalizePptDesignSpec(design)
}

func mergePptReferenceAccent(palette, referencePalette []string) []string {
	if len(referencePalette) == 0 {
		return append([]string(nil), palette...)
	}
	merged := make([]string, 0, 6)
	if len(palette) > 0 {
		merged = append(merged, palette[0])
	}
	for _, color := range referencePalette {
		color = strings.TrimSpace(color)
		if color == "" || containsPptPaletteColor(merged, color) {
			continue
		}
		merged = append(merged, color)
		break
	}
	for _, color := range palette[1:] {
		color = strings.TrimSpace(color)
		if color == "" || containsPptPaletteColor(merged, color) {
			continue
		}
		merged = append(merged, color)
		if len(merged) >= 6 {
			break
		}
	}
	return merged
}

func containsPptPaletteColor(palette []string, candidate string) bool {
	for _, color := range palette {
		if strings.EqualFold(strings.TrimSpace(color), candidate) {
			return true
		}
	}
	return false
}

func pptReferencePrompt(runtime *pptGenerationRuntime) string {
	if runtime == nil || len(runtime.request.ReferenceImages) == 0 {
		return ""
	}
	record := runtime.snapshot()
	var builder strings.Builder
	builder.WriteString("\n\n参考图设置：")
	builder.WriteString(fmt.Sprintf("模式=%s，用途=%s，强度=%s。", runtime.request.ReferenceMode, runtime.request.ReferenceUsage, runtime.request.ReferenceStrength))
	builder.WriteString("\n应用规则：")
	builder.WriteString(pptReferenceUsageGuidance(runtime.request.ReferenceUsage, runtime.request.ReferenceStrength))
	if record.ReferenceSpecJSON != "" {
		builder.WriteString("\n参考图分析结果（优先迁移视觉规律，不复制品牌和具体内容）：\n")
		builder.WriteString(record.ReferenceSpecJSON)
	}
	if record.ReferenceFallback {
		builder.WriteString("\n当前模型或网关不支持直接接收本地图片，已改用本地提取的色彩、明暗和构图线索；不要引用图片中的具体文字、品牌或事实。")
	} else if runtime.request.ReferenceMode == "direct" {
		builder.WriteString("\n本次请求末尾附有参考图片，请直接观察其视觉风格、版式节奏和可迁移的内容结构。")
	}
	return builder.String()
}

func pptReferenceUsageGuidance(usage, strength string) string {
	if strength != "subtle" && strength != "strong" {
		strength = "balanced"
	}
	var usageGuidance string
	switch usage {
	case "content":
		usageGuidance = "仅借鉴可识别的主题、信息组织和内容线索；保持文档自身的视觉风格，图片文字不清晰时不要臆造。"
	case "style-content":
		usageGuidance = "同时借鉴可迁移的视觉规律和可识别的内容组织；不得复制品牌、Logo、人物身份或未经确认的事实。"
	default:
		usageGuidance = "仅借鉴色彩、字体、留白、版式节奏等视觉规律；不要把图片中的文字、品牌或具体事实带入演示稿。"
	}
	strengthGuidance := map[string]string{
		"subtle":   "弱参考只保留少量色彩提示，优先保持文档自身风格。",
		"balanced": "平衡参考将视觉规律融入当前内容结构。",
		"strong":   "强参考以图片的视觉系统为主，但仍以当前文档事实为准。",
	}[strength]
	return usageGuidance + strengthGuidance
}

func pptDirectReferenceImages(runtime *pptGenerationRuntime) []string {
	if runtime == nil || runtime.request.ReferenceMode != "direct" || pptReferenceFallbackActive(runtime) {
		return nil
	}
	return append([]string(nil), runtime.request.ReferenceImages...)
}

// Some OpenAI-compatible vision gateways only accept image parts in the first
// user message. Keep the system instructions in the same text part when a
// reference image is attached, while preserving normal chat roles otherwise.
func pptReferenceRequestMessages(systemPrompt, userPrompt string, images []string) []chatCompletionMessage {
	if len(images) == 0 {
		return []chatCompletionMessage{{Role: "system", Content: systemPrompt}, {Role: "user", Content: userPrompt}}
	}
	combined := "系统要求：\n" + strings.TrimSpace(systemPrompt) + "\n\n用户请求：\n" + strings.TrimSpace(userPrompt)
	return []chatCompletionMessage{{Role: "user", Content: combined}}
}

func pptReferenceFallbackActive(runtime *pptGenerationRuntime) bool {
	return runtime != nil && runtime.snapshot().ReferenceFallback
}

func (a *App) enableLocalPptReferenceFallback(runtime *pptGenerationRuntime, cause error) error {
	if runtime == nil {
		return errors.New("参考图任务未初始化")
	}
	jobID := runtime.snapshot().JobID
	a.appendPptDiagnostic("reference-fallback job=%s reason=%s", jobID, pptDiagnosticText(cause.Error(), 240))
	a.updatePptPlanningProgress(runtime, "reference-local-analysis", "参考图 AI 分析未返回可用结果，正在本地提取参考图风格", "将继续使用配色、明暗和构图线索完成 PPT 生成")
	spec, referenceJSON, err := analyzePptReferencesLocally(runtime.request.ReferenceImages)
	if err != nil {
		a.appendPptDiagnostic("reference-fallback job=%s local-analysis-failed: %s", jobID, pptDiagnosticText(err.Error(), 240))
		return fmt.Errorf("参考图 AI 分析不可用（%s），且本地参考图分析失败: %w", cause.Error(), err)
	}
	a.appendPptDiagnostic("reference-fallback job=%s local-analysis-ready palette=%d layout=%d", jobID, len(spec.Palette), len(spec.LayoutRhythm))
	runtime.mu.Lock()
	runtime.record.ReferenceSpecJSON = referenceJSON
	runtime.record.ReferenceFallback = true
	snapshot := clonePptGenerationRecord(runtime.record)
	runtime.mu.Unlock()
	if err := a.persistPptGenerationRecord(snapshot); err != nil {
		return fmt.Errorf("保存本地参考图分析结果失败: %w", err)
	}
	return nil
}

func (a *App) preparePptPlanningSource(ctx context.Context, runtime *pptGenerationRuntime) (string, error) {
	markdown := strings.TrimSpace(runtime.request.Markdown)
	if len([]rune(markdown)) <= pptPlanningDirectSourceRunes {
		return markdown, nil
	}
	windows := splitPptPlanningSource(markdown, pptPlanningSourceWindowRunes)
	digests := make([]string, 0, len(windows))
	for index, window := range windows {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		a.updatePptPlanningProgress(runtime, "source-digesting", "正在分段理解长文档", fmt.Sprintf("正在提炼第 %d / %d 段内容", index+1, len(windows)))
		digest, err := a.generatePptSourceDigest(ctx, runtime, window, index+1, len(windows))
		if err != nil {
			return "", fmt.Errorf("第 %d 段文档理解失败: %w", index+1, err)
		}
		digests = append(digests, digest)
	}
	a.updatePptPlanningProgress(runtime, "source-digested", "已完成长文档理解", fmt.Sprintf("已整合 %d 段内容", len(digests)))
	return strings.Join(digests, "\n\n"), nil
}

func splitPptPlanningSource(value string, limit int) []string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return []string{string(runes)}
	}
	parts := make([]string, 0, (len(runes)/limit)+1)
	for len(runes) > 0 {
		end := limit
		if end >= len(runes) {
			parts = append(parts, strings.TrimSpace(string(runes)))
			break
		}
		cut := end
		for offset := end; offset > end-limit/4; offset-- {
			if runes[offset] == '\n' {
				cut = offset + 1
				break
			}
		}
		parts = append(parts, strings.TrimSpace(string(runes[:cut])))
		runes = runes[cut:]
	}
	return parts
}

func (a *App) generatePptSourceDigest(ctx context.Context, runtime *pptGenerationRuntime, source string, index, total int) (string, error) {
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		return "", err
	}
	system := `你是中文演示文稿的研究分析师。只提炼可核验的信息，不写 PPT 页面，不补充文档中没有的事实。只返回 JSON 对象：{"facts":[],"decisions":[],"metrics":[],"risks":[],"actions":[],"visualCandidates":[]}。每项简洁、中文、可直接作为后续演示文稿依据。删除文件路径、Source of truth、TODO、品牌宣传和重复噪声。`
	user := fmt.Sprintf("这是长文档的第 %d / %d 段，请提炼：\n\n%s", index, total, source)
	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-source-digest", ModelName: modelName, Temperature: 0.16,
		SystemPrompt: system, UserPrompt: user, Markdown: source,
		Messages: []chatCompletionMessage{{Role: "system", Content: system}, {Role: "user", Content: user}},
	})
	if err != nil {
		return "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(runtime.request.Model, endpoint, body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200), maxPresentationOutput, nil,
		aiContentLifecycleOptions{
			requestContext: ctx, streamMessage: "正在理解长文档", requestFailureMessage: "文档理解请求失败",
			requestErrorPrefix: "文档理解失败", interfaceFailureMessage: "AI 接口返回错误",
			explicitFailureMessage: "AI 返回了错误", httpErrorFormat: "文档理解失败，HTTP %d",
			parsingMessage: "正在解析文档理解结果", contentParseFailureMessage: "文档理解结果解析失败",
			contentExtractedMessage: "已完成文档理解",
		})
	if err != nil {
		return "", err
	}
	content = strings.TrimSpace(extractJSONObject(content))
	if content == "" {
		return "", errors.New("AI 返回的文档摘要为空")
	}
	return content, nil
}

func (a *App) generatePptStoryboard(ctx context.Context, runtime *pptGenerationRuntime, source string, targetSlides int, previousErr error) (string, error) {
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		return "", err
	}
	system := presentationStorySystemPrompt()
	var user strings.Builder
	user.WriteString(fmt.Sprintf("请为下面文档规划恰好 %d 页的中文 PPT（含封面）。\n\n", targetSlides))
	user.WriteString(fmt.Sprintf("内容密度偏好：%s。\n", runtime.request.Density))
	user.WriteString("原始资料或其结构化摘要：\n")
	user.WriteString(source)
	if runtime.request.Instruction != "" {
		user.WriteString("\n\n用户额外要求：\n")
		user.WriteString(runtime.request.Instruction)
	}
	if runtime.request.AssetManifest != "" {
		user.WriteString("\n\n可用原文资源清单（只可引用其中存在的资源）：\n")
		user.WriteString(runtime.request.AssetManifest)
	}
	if previousErr != nil {
		user.WriteString("\n\n上次策划不合格，请修复这个具体问题：\n")
		user.WriteString(previousErr.Error())
	}
	user.WriteString(pptReferencePrompt(runtime))
	referenceImages := pptDirectReferenceImages(runtime)
	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-storyboard", ModelName: modelName, Temperature: 0.38,
		SystemPrompt: system, UserPrompt: user.String(), Markdown: source, Instruction: runtime.request.Instruction,
		ReferenceImages: referenceImages,
		Messages:        pptReferenceRequestMessages(system, user.String(), referenceImages),
	})
	if err != nil {
		return "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(runtime.request.Model, endpoint, body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200), maxPresentationOutput, nil,
		aiContentLifecycleOptions{
			requestContext: ctx, streamMessage: "正在规划 PPT", requestFailureMessage: "PPT 策划请求失败",
			requestErrorPrefix: "PPT 策划失败", interfaceFailureMessage: "AI 接口返回错误",
			explicitFailureMessage: "AI 返回了错误", httpErrorFormat: "PPT 策划失败，HTTP %d",
			parsingMessage: "正在解析 PPT 策划", contentParseFailureMessage: "PPT 策划结果解析失败",
			contentExtractedMessage: "已收到 PPT 策划",
		})
	return content, err
}

func (a *App) generatePptStoryPlan(ctx context.Context, runtime *pptGenerationRuntime, source string, targetSlides int, previousErr error) (pptStoryPlan, string, error) {
	if targetSlides <= pptStoryboardSlidesPerRequest {
		content, err := a.generatePptStoryboard(ctx, runtime, source, targetSlides, previousErr)
		if err != nil {
			return pptStoryPlan{}, content, err
		}
		story, err := normalizePptStoryPlan(content, runtime.request, targetSlides)
		return story, content, err
	}
	return a.generateLargePptStoryPlan(ctx, runtime, source, targetSlides, previousErr)
}

func (a *App) generateLargePptStoryPlan(ctx context.Context, runtime *pptGenerationRuntime, source string, targetSlides int, previousErr error) (pptStoryPlan, string, error) {
	blueprintContent, err := a.generatePptDeckBlueprint(ctx, runtime, source, targetSlides, previousErr)
	if err != nil {
		return pptStoryPlan{}, blueprintContent, err
	}
	blueprint, err := normalizePptDeckBlueprint(blueprintContent, targetSlides)
	if err != nil {
		return pptStoryPlan{}, blueprintContent, err
	}

	story := pptStoryPlan{
		Title: blueprint.Title, Audience: blueprint.Audience, Objective: blueprint.Objective, Narrative: blueprint.Narrative,
		KeyFacts: blueprint.KeyFacts, Design: blueprint.Design,
	}
	rawParts := []string{blueprintContent}
	for index, chapter := range blueprint.Chapters {
		if ctx.Err() != nil {
			return pptStoryPlan{}, strings.Join(rawParts, "\n\n"), ctx.Err()
		}
		a.updatePptPlanningProgress(runtime, "story-planning", "正在细化 PPT 页面故事板", fmt.Sprintf("正在规划第 %d / %d 个章节（%d 页）", index+1, len(blueprint.Chapters), chapter.SlideCount))
		content, chapterErr := a.generatePptStoryboardChapter(ctx, runtime, source, blueprint, chapter, index)
		rawParts = append(rawParts, content)
		if chapterErr != nil {
			return pptStoryPlan{}, strings.Join(rawParts, "\n\n"), fmt.Errorf("第 %d 个章节策划失败: %w", index+1, chapterErr)
		}
		slides, chapterErr := normalizePptStorySlides(content, chapter.SlideCount)
		if chapterErr != nil {
			return pptStoryPlan{}, strings.Join(rawParts, "\n\n"), fmt.Errorf("第 %d 个章节策划无效: %w", index+1, chapterErr)
		}
		story.Slides = append(story.Slides, slides...)
	}
	encoded, _ := json.Marshal(story)
	normalized, err := normalizePptStoryPlan(string(encoded), runtime.request, targetSlides)
	if err != nil {
		return pptStoryPlan{}, strings.Join(rawParts, "\n\n"), err
	}
	return normalized, strings.Join(rawParts, "\n\n"), nil
}

func (a *App) generatePptDeckBlueprint(ctx context.Context, runtime *pptGenerationRuntime, source string, targetSlides int, previousErr error) (string, error) {
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		return "", err
	}
	system := `你是资深中文演示文稿策略师。针对大型演示文稿，你只制定整套叙事蓝图，不直接输出每页内容。只返回 JSON 对象：{"title":"","audience":"","objective":"","narrative":"","keyFacts":[],"design":{"visualDirection":"","palette":[],"backgroundStrategy":"","typography":"","cardTreatment":"","chartAndTableStyle":"","motionStrategy":"","layoutRhythm":[]},"chapters":[{"title":"","purpose":"","focus":"","slideCount":0,"visualRhythm":[]}]}

chapters 的 slideCount 总和必须恰好等于用户要求；每章 2-24 页；相邻章节的叙事角色和视觉节奏要不同。可重组原文但不虚构；移除路径、TODO、Source of truth、品牌和英文宣传语。`
	var user strings.Builder
	user.WriteString(fmt.Sprintf("请为 %d 页中文 PPT 制定可分批执行的故事蓝图。\n\n资料：\n%s", targetSlides, source))
	if runtime.request.Instruction != "" {
		user.WriteString("\n\n额外要求：\n")
		user.WriteString(runtime.request.Instruction)
	}
	if previousErr != nil {
		user.WriteString("\n\n上次结果的问题：\n")
		user.WriteString(previousErr.Error())
	}
	user.WriteString(pptReferencePrompt(runtime))
	referenceImages := pptDirectReferenceImages(runtime)
	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-deck-blueprint", ModelName: modelName, Temperature: 0.32,
		SystemPrompt: system, UserPrompt: user.String(), Markdown: source, Instruction: runtime.request.Instruction,
		ReferenceImages: referenceImages,
		Messages:        pptReferenceRequestMessages(system, user.String(), referenceImages),
	})
	if err != nil {
		return "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(runtime.request.Model, endpoint, body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200), maxPresentationOutput, nil,
		aiContentLifecycleOptions{
			requestContext: ctx, streamMessage: "正在规划大型 PPT", requestFailureMessage: "大型 PPT 蓝图请求失败",
			requestErrorPrefix: "大型 PPT 蓝图失败", interfaceFailureMessage: "AI 接口返回错误",
			explicitFailureMessage: "AI 返回了错误", httpErrorFormat: "大型 PPT 蓝图失败，HTTP %d",
			parsingMessage: "正在解析大型 PPT 蓝图", contentParseFailureMessage: "大型 PPT 蓝图解析失败",
			contentExtractedMessage: "已收到大型 PPT 蓝图",
		})
	return content, err
}

func (a *App) generatePptStoryboardChapter(ctx context.Context, runtime *pptGenerationRuntime, source string, blueprint pptDeckBlueprint, chapter pptDeckChapter, chapterIndex int) (string, error) {
	modelName, err := resolveAIModelName(runtime.request.Model)
	if err != nil {
		return "", err
	}
	system := `你是专业中文演示文稿设计师。你正在为一套大型 PPT 细化一个章节，只返回 JSON 对象 {"slides":[...]}，不返回根文档、解释或代码围栏。slides 数量必须精确匹配要求。

每页必须有 title、purpose、keyMessage、content、evidence、visualItems、visualType、visualBrief、layoutIntent、speakerNotes。visualItems 是由 {label,value,detail} 组成的结构化视觉数据，value 仅能使用原文已有数值；没有数字时留空。每页只讲一个判断，content 2-5 条短句，不能转抄原文大段文字。visualType 只能为 cover、section、kpi、comparison、timeline、process、architecture、matrix、chart、table、insight、action；相邻页面要变化。不要出现路径、TODO、Source of truth、品牌、Logo、官网或英文宣传语。`
	blueprintJSON, _ := json.Marshal(blueprint)
	chapterJSON, _ := json.Marshal(chapter)
	user := fmt.Sprintf("整套蓝图：\n%s\n\n当前章节（第 %d 章）：\n%s\n\n资料或摘要：\n%s\n\n请恰好生成 %d 页页面简报。%s", blueprintJSON, chapterIndex+1, chapterJSON, source, chapter.SlideCount, pptReferencePrompt(runtime))
	referenceImages := pptDirectReferenceImages(runtime)
	endpoint, body, err := prepareAIRequest(runtime.request.Model, aiRequestContext{
		Kind: "bento-slides-storyboard-chapter", ModelName: modelName, Temperature: 0.38,
		SystemPrompt: system, UserPrompt: user, Markdown: source, Instruction: runtime.request.Instruction,
		ReferenceImages: referenceImages,
		Messages:        pptReferenceRequestMessages(system, user, referenceImages),
	})
	if err != nil {
		return "", err
	}
	_, content, _, err := a.executeAIContentLifecycle(runtime.request.Model, endpoint, body,
		clampTimeout(runtime.request.Model.FormatTimeout, 420, 60, 1200), maxPresentationOutput, nil,
		aiContentLifecycleOptions{
			requestContext: ctx, streamMessage: "正在细化大型 PPT", requestFailureMessage: "章节策划请求失败",
			requestErrorPrefix: "章节策划失败", interfaceFailureMessage: "AI 接口返回错误",
			explicitFailureMessage: "AI 返回了错误", httpErrorFormat: "章节策划失败，HTTP %d",
			parsingMessage: "正在解析章节策划", contentParseFailureMessage: "章节策划解析失败",
			contentExtractedMessage: "已收到章节策划",
		})
	return content, err
}

func presentationStorySystemPrompt() string {
	return `你是资深中文演示文稿策略师和信息设计师。你先重组资料，再设计故事，不要按照 Markdown 标题或字数机械拆页。

只返回一个 JSON 对象，不要代码围栏或解释。结构必须是：
{"title":"","audience":"","objective":"","narrative":"","keyFacts":[],"design":{"visualDirection":"","palette":[],"backgroundStrategy":"","typography":"","cardTreatment":"","chartAndTableStyle":"","motionStrategy":"","layoutRhythm":[]},"slides":[{"title":"","purpose":"","keyMessage":"","content":[],"evidence":[],"visualItems":[{"label":"","value":"","detail":""}],"visualType":"","visualBrief":"","layoutIntent":"","speakerNotes":""}]}

硬性要求：
1. slides 数量必须恰好等于用户要求；第 1 页必须是封面，最后一页必须给出结论、行动或下一步。
2. 先判断受众、目标和真正主线；可以合并、重排、概括原文，不能逐段转抄，也不能编造事实、数字、案例或来源。
3. 每页只表达一个判断明确的核心信息。title 不超过 22 个中文字符；content 为 2-5 条短句，每条尽量不超过 32 个中文字符；evidence 只保留支撑判断的数字、事实、条件。visualItems 是供版式引擎绘制关系图、图表或表格的结构化信息，每项包含 label、value、detail；value 只能使用原文已有数字，没有数字时留空，不能虚构。
4. 不出现“Source of truth”、TODO、文件路径、生成日期、原始 Markdown 语法、品牌、Logo、厂商名、官网、英文宣传语或与资料无关的内容。除专有名词、指标缩写外使用中文。
5. visualType 必须从 cover、section、kpi、comparison、timeline、process、architecture、matrix、chart、table、insight、action 中选择，并让相邻页面交替变化。visualBrief 描述要画出的信息关系，不是装饰。layoutIntent 描述具体版式，例如“左侧结论，右侧 3 个对比块”。
6. design 是整套视觉总纲：克制、有对比、有留白；不要默认白底灰色大卡片，不要 Logo，不要渐变宣传页。为图表、表格、重点数字和页面节奏给出具体策略。
7. 演讲备注只写必要的讲述提示，不要复述全文。`
}

func normalizePptStoryPlan(content string, request AIPresentationGenerationRequest, target int) (pptStoryPlan, error) {
	var story pptStoryPlan
	value := extractJSONObject(content)
	if value == "" {
		return story, errors.New("AI 返回的 PPT 策划为空")
	}
	if err := json.Unmarshal([]byte(value), &story); err != nil {
		return story, fmt.Errorf("PPT 策划 JSON 无效: %w", err)
	}
	if len(story.Slides) != target {
		return story, fmt.Errorf("策划应返回 %d 页，实际返回 %d 页", target, len(story.Slides))
	}
	story.Title = cleanPptPlanText(story.Title, 44)
	if story.Title == "" {
		story.Title = markdownDocumentTitle(request.Markdown, request.FileName)
	}
	story.Audience = cleanPptPlanText(story.Audience, 80)
	story.Objective = cleanPptPlanText(story.Objective, 120)
	story.Narrative = cleanPptPlanText(story.Narrative, 240)
	story.KeyFacts = cleanPptPlanList(story.KeyFacts, 12, 100)
	story.Design = normalizePptDesignSpec(story.Design)
	for index := range story.Slides {
		slide := &story.Slides[index]
		slide.ID = fmt.Sprintf("slide-%04d", index+1)
		slide.Index = index
		slide.VolumeIndex = index / maxPptSlidesPerVolume
		slide.Title = cleanPptPlanText(slide.Title, 22)
		if slide.Title == "" {
			slide.Title = fmt.Sprintf("第 %d 页", index+1)
		}
		slide.Purpose = cleanPptPlanText(slide.Purpose, 120)
		slide.KeyMessage = cleanPptPlanText(slide.KeyMessage, 120)
		slide.Content = cleanPptPlanList(slide.Content, 5, 42)
		slide.Evidence = cleanPptPlanList(slide.Evidence, 5, 80)
		slide.VisualItems = normalizePptVisualItems(slide.VisualItems, 5)
		slide.VisualType = normalizePptVisualType(slide.VisualType, index)
		slide.VisualBrief = cleanPptPlanText(slide.VisualBrief, 180)
		slide.LayoutIntent = cleanPptPlanText(slide.LayoutIntent, 160)
		slide.Notes = cleanPptPlanText(slide.Notes, 280)
		if slide.KeyMessage == "" {
			slide.KeyMessage = slide.Title
		}
		if len(slide.Content) == 0 && index != 0 {
			return story, fmt.Errorf("第 %d 页缺少可呈现的内容", index+1)
		}
		if slide.VisualBrief == "" {
			slide.VisualBrief = defaultPptVisualBrief(slide.VisualType)
		}
		if slide.LayoutIntent == "" {
			slide.LayoutIntent = defaultPptLayoutIntent(slide.VisualType)
		}
	}
	story.Slides[0].VisualType = "cover"
	story.Slides[len(story.Slides)-1].VisualType = "action"
	return story, nil
}

func normalizePptDeckBlueprint(content string, target int) (pptDeckBlueprint, error) {
	var blueprint pptDeckBlueprint
	value := extractJSONObject(content)
	if value == "" {
		return blueprint, errors.New("AI 返回的大型 PPT 蓝图为空")
	}
	if err := json.Unmarshal([]byte(value), &blueprint); err != nil {
		return blueprint, fmt.Errorf("大型 PPT 蓝图 JSON 无效: %w", err)
	}
	if len(blueprint.Chapters) == 0 {
		return blueprint, errors.New("大型 PPT 蓝图没有章节")
	}
	total := 0
	for index := range blueprint.Chapters {
		chapter := &blueprint.Chapters[index]
		chapter.Title = cleanPptPlanText(chapter.Title, 32)
		chapter.Purpose = cleanPptPlanText(chapter.Purpose, 100)
		chapter.Focus = cleanPptPlanText(chapter.Focus, 180)
		chapter.VisualRhythm = cleanPptPlanList(chapter.VisualRhythm, 6, 60)
		if chapter.Title == "" || chapter.Focus == "" {
			return blueprint, fmt.Errorf("第 %d 个章节缺少标题或内容焦点", index+1)
		}
		if chapter.SlideCount < 2 || chapter.SlideCount > pptStoryboardSlidesPerRequest {
			return blueprint, fmt.Errorf("第 %d 个章节页数必须在 2-%d 页之间", index+1, pptStoryboardSlidesPerRequest)
		}
		total += chapter.SlideCount
	}
	if total != target {
		return blueprint, fmt.Errorf("大型 PPT 蓝图共 %d 页，应为 %d 页", total, target)
	}
	blueprint.Title = cleanPptPlanText(blueprint.Title, 44)
	blueprint.Audience = cleanPptPlanText(blueprint.Audience, 80)
	blueprint.Objective = cleanPptPlanText(blueprint.Objective, 120)
	blueprint.Narrative = cleanPptPlanText(blueprint.Narrative, 240)
	blueprint.KeyFacts = cleanPptPlanList(blueprint.KeyFacts, 12, 100)
	blueprint.Design = normalizePptDesignSpec(blueprint.Design)
	return blueprint, nil
}

func normalizePptStorySlides(content string, expected int) ([]pptStorySlide, error) {
	value := extractJSONObject(content)
	if value == "" {
		return nil, errors.New("AI 返回的章节页面为空")
	}
	var payload struct {
		Slides []pptStorySlide `json:"slides"`
	}
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return nil, fmt.Errorf("章节页面 JSON 无效: %w", err)
	}
	if len(payload.Slides) != expected {
		return nil, fmt.Errorf("章节应返回 %d 页，实际返回 %d 页", expected, len(payload.Slides))
	}
	return payload.Slides, nil
}

func normalizePptDesignSpec(spec pptDesignSpec) pptDesignSpec {
	spec.VisualDirection = cleanPptPlanText(spec.VisualDirection, 160)
	if spec.VisualDirection == "" {
		spec.VisualDirection = "清晰克制的中文信息设计，以重点色引导叙事，避免大面积单调白卡片"
	}
	spec.Palette = cleanPptPlanList(spec.Palette, 6, 24)
	if len(spec.Palette) == 0 {
		spec.Palette = []string{"#173B53", "#E65C4F", "#2C8C7C", "#E8B84A", "#F5F6F2"}
	}
	spec.BackgroundStrategy = cleanPptPlanText(spec.BackgroundStrategy, 140)
	spec.Typography = cleanPptPlanText(spec.Typography, 140)
	spec.CardTreatment = cleanPptPlanText(spec.CardTreatment, 140)
	spec.ChartAndTableStyle = cleanPptPlanText(spec.ChartAndTableStyle, 140)
	spec.ImageTreatment = cleanPptPlanText(spec.ImageTreatment, 140)
	spec.ReferenceNote = cleanPptPlanText(spec.ReferenceNote, 180)
	spec.MotionStrategy = cleanPptPlanText(spec.MotionStrategy, 120)
	spec.LayoutRhythm = cleanPptPlanList(spec.LayoutRhythm, 8, 100)
	return spec
}

func cleanPptPlanText(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	value = regexp.MustCompile(`(?i)source\s+of\s+truth|\bTODO\b|https?://\S+|[A-Za-z]:\\[^\s]+|/(?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]*`).ReplaceAllString(value, "")
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > maxRunes {
		return strings.TrimSpace(string(runes[:maxRunes]))
	}
	return value
}

func cleanPptPlanList(values []string, maximum, runeLimit int) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]bool)
	for _, value := range values {
		clean := cleanPptPlanText(value, runeLimit)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		result = append(result, clean)
		if len(result) >= maximum {
			break
		}
	}
	return result
}

func normalizePptVisualType(value string, index int) string {
	value = strings.ToLower(strings.TrimSpace(value))
	allowed := map[string]bool{"cover": true, "section": true, "kpi": true, "comparison": true, "timeline": true, "process": true, "architecture": true, "matrix": true, "chart": true, "table": true, "insight": true, "action": true}
	if allowed[value] {
		return value
	}
	cycle := []string{"cover", "insight", "comparison", "process", "chart", "matrix", "timeline", "action"}
	return cycle[index%len(cycle)]
}

func defaultPptVisualBrief(kind string) string {
	return map[string]string{
		"cover": "用标题、一个短副标题和抽象几何构图建立主题", "kpi": "用重点数字和简短标签形成强弱对比",
		"comparison": "用并列的两到三组对象比较关键差异", "timeline": "按时间或阶段排列关键节点",
		"process": "用箭头和节点展示步骤、输入与输出", "architecture": "用层级或模块连接表达结构关系",
		"matrix": "用二维矩阵展示分类与优先级", "chart": "用简洁图表突出一个趋势或差异",
		"table": "用精炼表格比较有限字段", "action": "用优先级清单和下一步形成收束",
	}[kind]
}

func defaultPptLayoutIntent(kind string) string {
	return map[string]string{
		"cover": "左下标题，右侧或满版抽象图形，留出大面积呼吸空间", "kpi": "上方结论，下方 3 个重点数字块",
		"comparison": "上方结论，下方左右对照或三列比较", "timeline": "上方标题，中部横向时间轴，下方解释",
		"process": "左上结论，中部流程节点，底部补充说明", "architecture": "左侧核心结论，右侧分层结构图",
		"matrix": "上方标题，中部二维矩阵，右侧一句解读", "chart": "左侧结论与注释，右侧主图表",
		"table": "上方核心判断，中部紧凑表格，底部说明", "action": "左侧结论，右侧按优先级排列的行动卡片",
		"insight": "左侧一句核心洞察，右侧用结构化图形承载证据",
	}[kind]
}

func (a *App) applyPptStoryPlan(runtime *pptGenerationRuntime, story pptStoryPlan) {
	plans := plansFromPptStory(story)
	storyJSON, _ := json.Marshal(story)
	designJSON, _ := json.Marshal(story.Design)
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	old := runtime.record
	rebuilt := createPptGenerationRecord(runtime.request, plans)
	applyPptDesignToDocuments(&rebuilt, story)
	rebuilt.JobID = old.JobID
	rebuilt.StartedAt = old.StartedAt
	rebuilt.PlanningVersion = pptAIPlanningVersion
	rebuilt.StoryPlanJSON = string(storyJSON)
	rebuilt.DesignSpecJSON = string(designJSON)
	rebuilt.ReferenceSpecJSON = old.ReferenceSpecJSON
	rebuilt.ReferenceFallback = old.ReferenceFallback
	rebuilt.Status = "running"
	rebuilt.Stage = "design-planned"
	rebuilt.Message = "已完成 AI 内容策划，正在生成页面"
	rebuilt.Detail = fmt.Sprintf("共 %d 页，采用 %s", len(plans), story.Design.VisualDirection)
	rebuilt.CanResume = true
	runtime.record = rebuilt
	runtime.plans = plans
}

func applyPptDesignToDocuments(record *PptGenerationJobRecord, story pptStoryPlan) {
	theme := presentationThemeFromDesign(story.Design)
	for index := range record.Volumes {
		volume := &record.Volumes[index]
		var document pptDocument
		if err := json.Unmarshal([]byte(volume.DocumentJSON), &document); err != nil {
			continue
		}
		document.Title = story.Title
		if len(record.Volumes) > 1 {
			document.Title = fmt.Sprintf("%s（第 %d 卷）", story.Title, index+1)
		}
		document.Theme = theme
		volume.Title = document.Title
		volume.DocumentJSON = marshalPptDocument(document)
	}
}

func presentationThemeFromDesign(design pptDesignSpec) map[string]any {
	theme := defaultPresentationTheme()
	valid := make([]string, 0, len(design.Palette))
	for _, color := range design.Palette {
		color = strings.TrimSpace(color)
		if pptHexColorPattern.MatchString(color) {
			valid = append(valid, color)
		}
	}
	if len(valid) > 0 {
		theme["color"] = valid[0]
	}
	if len(valid) > 1 {
		theme["accent"] = valid[1]
	}
	if len(valid) > 0 {
		palette := make([]any, 0, len(valid))
		for _, color := range valid {
			palette = append(palette, color)
		}
		theme["chartPalette"] = palette
	}
	if design.BackgroundStrategy != "" {
		theme["backgroundStrategy"] = design.BackgroundStrategy
	}
	if design.Typography != "" {
		theme["typography"] = design.Typography
	}
	if design.CardTreatment != "" {
		theme["cardTreatment"] = design.CardTreatment
	}
	if design.ImageTreatment != "" {
		theme["imageTreatment"] = design.ImageTreatment
	}
	return theme
}

func plansFromPptStory(story pptStoryPlan) []pptSlidePlan {
	plans := make([]pptSlidePlan, len(story.Slides))
	for index, slide := range story.Slides {
		plans[index] = pptSlidePlan{
			ID: slide.ID, Index: slide.Index, VolumeIndex: slide.VolumeIndex, Title: slide.Title,
			Purpose: slide.Purpose, KeyMessage: slide.KeyMessage, Content: append([]string(nil), slide.Content...),
			Evidence: append([]string(nil), slide.Evidence...), VisualItems: append([]pptVisualItem(nil), slide.VisualItems...), VisualType: slide.VisualType,
			VisualBrief: slide.VisualBrief, LayoutIntent: slide.LayoutIntent, Notes: slide.Notes,
		}
	}
	return plans
}

func plansFromPersistedStory(value string, expected int) ([]pptSlidePlan, error) {
	var story pptStoryPlan
	if err := json.Unmarshal([]byte(value), &story); err != nil {
		return nil, err
	}
	if len(story.Slides) != expected {
		return nil, fmt.Errorf("已保存故事板页数为 %d，任务页数为 %d", len(story.Slides), expected)
	}
	plans := plansFromPptStory(story)
	for index := range plans {
		if plans[index].ID == "" {
			return nil, fmt.Errorf("第 %d 页缺少页面 id", index+1)
		}
	}
	return plans, nil
}

func storyContextForBatch(value string, batch pptBatchPlan) string {
	if strings.TrimSpace(value) == "" {
		return "本批以页面计划为准，保持与相邻页面的视觉差异。"
	}
	var story pptStoryPlan
	if err := json.Unmarshal([]byte(value), &story); err != nil {
		return "本批以页面计划为准，保持与相邻页面的视觉差异。"
	}
	items := []string{fmt.Sprintf("主题：%s", story.Title), fmt.Sprintf("受众：%s", story.Audience), fmt.Sprintf("目标：%s", story.Objective), fmt.Sprintf("主线：%s", story.Narrative)}
	start := batch.Slides[0].Index - 1
	if start >= 0 && start < len(story.Slides) {
		items = append(items, fmt.Sprintf("上一页：%s", story.Slides[start].Title))
	}
	end := batch.Slides[len(batch.Slides)-1].Index + 1
	if end >= 0 && end < len(story.Slides) {
		items = append(items, fmt.Sprintf("下一页：%s", story.Slides[end].Title))
	}
	return strings.Join(items, "\n")
}

func (a *App) updatePptPlanningProgress(runtime *pptGenerationRuntime, stage, message, detail string) {
	runtime.mu.Lock()
	runtime.record.Stage = stage
	runtime.record.Message = message
	runtime.record.Detail = detail
	runtime.record.Status = "running"
	runtime.record.CanResume = true
	runtime.record.UpdatedAt = time.Now().UnixMilli()
	snapshot := clonePptGenerationRecord(runtime.record)
	runtime.mu.Unlock()
	_ = a.persistPptGenerationRecord(snapshot)
	a.emitPptJobProgress(snapshot, stage, message, detail, "planning", 0, true)
}

func (a *App) failPptPlanning(runtime *pptGenerationRuntime, err error, rawContent string) {
	message := "AI 策划失败"
	if err != nil {
		message = err.Error()
	}
	runtime.mu.Lock()
	runtime.record.Status = "failed"
	runtime.record.Stage = "planning-failed"
	runtime.record.Message = "无法完成 PPT 内容策划"
	runtime.record.Detail = message
	runtime.record.Error = message
	runtime.record.FailurePhase = "planning"
	if strings.TrimSpace(rawContent) != "" {
		runtime.record.RawContent = limitPptRawContent(rawContent)
	}
	runtime.record.CanResume = true
	runtime.record.UpdatedAt = time.Now().UnixMilli()
	snapshot := clonePptGenerationRecord(runtime.record)
	runtime.mu.Unlock()
	_ = a.persistPptGenerationRecord(snapshot)
	a.emitPptJobProgress(snapshot, "planning-failed", snapshot.Message, snapshot.Detail, "planning", maxPptPlanningAttempts, true)
}

var pptForbiddenOutputPattern = regexp.MustCompile(`(?i)source\s+of\s+truth|\bTODO\b|[A-Za-z]:\\[^\s<]+|/(?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]*`)
var pptHexColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func validatePptBatchQuality(slides []map[string]any, plans []pptSlidePlan) error {
	if len(slides) != len(plans) {
		return errors.New("页面数量不匹配")
	}
	textOnly := 0
	layouts := make(map[string]int)
	for index, slide := range slides {
		var totalRunes int
		textCount := 0
		shapeCount := 0
		hasVisual := false
		for _, raw := range slide["elements"].([]any) {
			element, _ := raw.(map[string]any)
			kind, _ := element["type"].(string)
			if kind == "text" {
				textCount++
				plain := pptElementPlainText(element)
				if pptForbiddenOutputPattern.MatchString(plain) {
					return fmt.Errorf("第 %d 页包含工程残留或路径文本", index+1)
				}
				length := len([]rune(plain))
				totalRunes += length
				if length > 360 {
					return fmt.Errorf("第 %d 页有超过 360 字的大段文本", index+1)
				}
				if length > 180 && elementAreaRatio(element) > 0.62 {
					return fmt.Errorf("第 %d 页把长文本塞进了过大的单一文本框", index+1)
				}
			} else if kind == "shape" {
				shapeCount++
			} else {
				hasVisual = true
			}
		}
		// The layout compiler intentionally uses native shapes for timelines,
		// process diagrams, matrices and architectures. Several coordinated shapes
		// are a real visual structure, not a text-only slide.
		if shapeCount >= 3 {
			hasVisual = true
		}
		if totalRunes > 700 {
			return fmt.Errorf("第 %d 页可见文字过多（%d 字），应先总结再可视化", index+1, totalRunes)
		}
		if !hasVisual && plans[index].VisualType != "cover" && plans[index].VisualType != "section" && plans[index].VisualType != "insight" && plans[index].VisualType != "action" {
			textOnly++
		}
		layout := fmt.Sprintf("%s:%d:%t", plans[index].VisualType, textCount, hasVisual)
		layouts[layout]++
	}
	if len(slides) >= 3 && textOnly == len(slides) {
		return errors.New("当前批次全是纯文字页，缺少图形、图表、表格或结构化视觉表达")
	}
	if len(slides) >= 3 {
		for layout, count := range layouts {
			if count == len(slides) {
				return fmt.Errorf("当前批次版式重复（%s），需要让相邻页面具有不同的信息结构", layout)
			}
		}
	}
	return nil
}

func pptElementPlainText(element map[string]any) string {
	markup, _ := element["html"].(string)
	plain := generatedHTMLTagPattern.ReplaceAllString(markup, " ")
	plain = stdhtml.UnescapeString(plain)
	return strings.Join(strings.Fields(plain), " ")
}

func elementAreaRatio(element map[string]any) float64 {
	w := normalizedNumber(element["w"], 0, 0, 1280)
	h := normalizedNumber(element["h"], 0, 0, 720)
	return (w * h) / float64(1280*720)
}
