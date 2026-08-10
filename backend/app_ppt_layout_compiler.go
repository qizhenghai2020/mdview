package backend

import (
	"encoding/json"
	"fmt"
	stdhtml "html"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// pptVisualItem is deliberately content-only. The model may describe a label,
// a fact/value, and a short explanation, but the layout compiler owns all
// geometry and presentation styling.
type pptVisualItem struct {
	Label  string `json:"label"`
	Value  string `json:"value,omitempty"`
	Detail string `json:"detail,omitempty"`
}

type pptSlideContentDraft struct {
	ID             string          `json:"id"`
	Headline       string          `json:"headline"`
	SupportingText string          `json:"supportingText"`
	Items          []string        `json:"items"`
	Evidence       []string        `json:"evidence"`
	VisualItems    []pptVisualItem `json:"visualItems"`
}

type pptLayoutPalette struct {
	Ink             string
	Accent          string
	Accent2         string
	Accent3         string
	Solid           string
	Canvas          string
	Surface         string
	Muted           string
	Line            string
	FontFamily      string
	TypeScale       float64
	CardRadiusScale float64
	CardFillScale   float64
	Motion          string
	Variant         string
	Dark            bool
}

type pptLayoutContent struct {
	Title      string
	Headline   string
	Supporting string
	Items      []string
	Evidence   []string
	Visuals    []pptVisualItem
}

type pptNumericPoint struct {
	Label   string
	Value   float64
	Display string
	Detail  string
}

type pptLayoutCompiler struct {
	plan     pptSlidePlan
	content  pptLayoutContent
	palette  pptLayoutPalette
	elements []any
	serial   int
}

var pptNumericValuePattern = regexp.MustCompile(`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*%|[万亿千百十])?`)

// normalizePptContentBatch accepts the small, content-only batch response. It
// also tolerates the old Bento-shaped response during upgrades, then falls back
// to the already-persisted storyboard rather than discarding a usable job.
func normalizePptContentBatch(value string, plans []pptSlidePlan) ([]pptSlideContentDraft, error) {
	content := extractJSONObject(value)
	if content == "" {
		return nil, fmt.Errorf("AI 返回的页面内容为空")
	}
	var payload struct {
		Slides []map[string]any `json:"slides"`
	}
	if err := json.Unmarshal([]byte(content), &payload); err != nil {
		return nil, fmt.Errorf("页面内容 JSON 无效: %w", err)
	}
	if len(payload.Slides) != len(plans) {
		return nil, fmt.Errorf("本批应返回 %d 页内容，实际返回 %d 页", len(plans), len(payload.Slides))
	}
	result := make([]pptSlideContentDraft, len(plans))
	for index, raw := range payload.Slides {
		encoded, _ := json.Marshal(raw)
		var draft pptSlideContentDraft
		if err := json.Unmarshal(encoded, &draft); err != nil {
			return nil, fmt.Errorf("第 %d 页内容无效: %w", plans[index].Index+1, err)
		}
		draft.ID = plans[index].ID
		draft.Headline = cleanPptPlanText(draft.Headline, 52)
		draft.SupportingText = cleanPptPlanText(draft.SupportingText, 96)
		draft.Items = cleanPptPlanList(draft.Items, 5, 44)
		draft.Evidence = cleanPptPlanList(draft.Evidence, 5, 72)
		draft.VisualItems = normalizePptVisualItems(draft.VisualItems, 5)
		result[index] = draft
	}
	return result, nil
}

func normalizePptVisualItems(values []pptVisualItem, maximum int) []pptVisualItem {
	result := make([]pptVisualItem, 0, len(values))
	seen := make(map[string]bool)
	for _, value := range values {
		item := pptVisualItem{
			Label:  cleanPptPlanText(value.Label, 30),
			Value:  cleanPptPlanText(value.Value, 28),
			Detail: cleanPptPlanText(value.Detail, 56),
		}
		if item.Label == "" && item.Value == "" && item.Detail == "" {
			continue
		}
		if item.Label == "" {
			item.Label = item.Detail
			item.Detail = ""
		}
		key := item.Label + "\x00" + item.Value + "\x00" + item.Detail
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
		if len(result) >= maximum {
			break
		}
	}
	return result
}

func compilePptBatch(plans []pptSlidePlan, drafts []pptSlideContentDraft, designJSON string) ([]map[string]any, error) {
	if len(plans) != len(drafts) {
		return nil, fmt.Errorf("页面计划与内容草稿数量不匹配")
	}
	palette := pptLayoutPaletteFromDesign(designJSON)
	result := make([]map[string]any, len(plans))
	for index, plan := range plans {
		compiler := pptLayoutCompiler{
			plan:    plan,
			content: pptLayoutContentFrom(plan, drafts[index]),
			palette: palette,
		}
		slide, err := normalizeGeneratedSlide(compiler.compile(), plan)
		if err != nil {
			return nil, fmt.Errorf("第 %d 页版式编译失败: %w", plan.Index+1, err)
		}
		result[index] = slide
	}
	return result, nil
}

func pptLayoutContentFrom(plan pptSlidePlan, draft pptSlideContentDraft) pptLayoutContent {
	content := pptLayoutContent{
		Title:      cleanPptPlanText(plan.Title, 28),
		Headline:   cleanPptPlanText(draft.Headline, 52),
		Supporting: cleanPptPlanText(draft.SupportingText, 96),
		Items:      cleanPptPlanList(draft.Items, 5, 44),
		Evidence:   cleanPptPlanList(draft.Evidence, 5, 72),
		Visuals:    normalizePptVisualItems(draft.VisualItems, 5),
	}
	if content.Title == "" {
		content.Title = "内容概览"
	}
	if content.Headline == "" {
		content.Headline = cleanPptPlanText(plan.KeyMessage, 52)
	}
	if content.Headline == "" {
		content.Headline = content.Title
	}
	if len(content.Items) == 0 {
		content.Items = cleanPptPlanList(plan.Content, 5, 44)
	}
	if len(content.Evidence) == 0 {
		content.Evidence = cleanPptPlanList(plan.Evidence, 5, 72)
	}
	if content.Supporting == "" && len(content.Evidence) > 0 {
		content.Supporting = content.Evidence[0]
	}
	if content.Supporting == "" {
		content.Supporting = cleanPptPlanText(plan.Purpose, 80)
	}
	if len(content.Visuals) == 0 {
		content.Visuals = normalizePptVisualItems(plan.VisualItems, 5)
	}
	if len(content.Visuals) == 0 {
		content.Visuals = derivePptVisualItems(content.Items, content.Evidence)
	}
	return content
}

func derivePptVisualItems(items, evidence []string) []pptVisualItem {
	result := make([]pptVisualItem, 0, len(items))
	for index, item := range items {
		entry := pptVisualItem{Label: item}
		if index < len(evidence) {
			entry.Detail = evidence[index]
		}
		if value := pptNumericValuePattern.FindString(item + " " + entry.Detail); value != "" {
			entry.Value = strings.TrimSpace(value)
		}
		result = append(result, entry)
	}
	if len(result) == 0 {
		for _, item := range evidence {
			result = append(result, pptVisualItem{Label: item, Value: pptNumericValuePattern.FindString(item)})
		}
	}
	return normalizePptVisualItems(result, 5)
}

func pptLayoutPaletteFromDesign(value string) pptLayoutPalette {
	palette := pptLayoutPalette{
		Ink: "#173B53", Accent: "#E65C4F", Accent2: "#2C8C7C", Accent3: "#E8B84A",
		Solid:  "#173B53",
		Canvas: "#F7F9FC", Surface: "#FFFFFF", Muted: "#5B6877", Line: "#D9E2EC",
		FontFamily: "Microsoft YaHei, PingFang SC, system-ui, sans-serif", TypeScale: 1,
		CardRadiusScale: 1, CardFillScale: 1, Motion: "fade-up", Variant: "balanced",
	}
	var design pptDesignSpec
	if json.Unmarshal([]byte(value), &design) != nil {
		return palette
	}
	valid := make([]string, 0, len(design.Palette))
	for _, color := range design.Palette {
		color = strings.TrimSpace(color)
		if pptHexColorPattern.MatchString(color) {
			valid = append(valid, color)
		}
	}
	for _, color := range valid {
		if pptColorLuminance(color) < 0.42 {
			palette.Ink = color
			break
		}
	}
	palette.Solid = palette.Ink
	accents := make([]string, 0, len(valid))
	for _, color := range valid {
		if !strings.EqualFold(color, palette.Ink) {
			accents = append(accents, color)
		}
	}
	if len(accents) > 0 {
		palette.Accent = accents[0]
	}
	if len(accents) > 1 {
		palette.Accent2 = accents[1]
	}
	if len(accents) > 2 {
		palette.Accent3 = accents[2]
	}
	backgroundStrategy := strings.ToLower(design.BackgroundStrategy)
	if strings.Contains(backgroundStrategy, "深") || strings.Contains(backgroundStrategy, "暗") || strings.Contains(backgroundStrategy, "黑") || strings.Contains(backgroundStrategy, "dark") {
		baseInk := palette.Ink
		palette.Canvas = baseInk
		palette.Solid = baseInk
		palette.Ink = "#F5F7FA"
		palette.Surface = pptColorAlpha("#FFFFFF", 0.10)
		palette.Muted = "#C1CBD6"
		palette.Line = pptColorAlpha("#FFFFFF", 0.24)
		palette.Dark = true
	}
	styleText := strings.ToLower(strings.Join([]string{
		design.VisualDirection, design.Typography, design.CardTreatment,
		strings.Join(design.LayoutRhythm, " "), design.ImageTreatment,
	}, " "))
	if strings.Contains(styleText, "衬线") || strings.Contains(styleText, "杂志") || strings.Contains(styleText, "书籍") || strings.Contains(styleText, "editorial") {
		palette.FontFamily = "Noto Serif SC, Songti SC, SimSun, serif"
		palette.Variant = "editorial"
	}
	if strings.Contains(styleText, "极简") || strings.Contains(styleText, "留白") || strings.Contains(styleText, "minimal") {
		palette.Variant = "minimal"
		palette.CardFillScale = 0.62
	}
	if strings.Contains(styleText, "海报") || strings.Contains(styleText, "强对比") || strings.Contains(styleText, "几何") || strings.Contains(styleText, "科技") || strings.Contains(styleText, "bold") {
		palette.Variant = "bold"
		palette.CardFillScale = 1.35
	}
	if strings.Contains(styleText, "大字") || strings.Contains(styleText, "醒目") || strings.Contains(styleText, "海报") || strings.Contains(styleText, "bold") {
		palette.TypeScale = 1.08
	}
	if strings.Contains(styleText, "紧凑") || strings.Contains(styleText, "密集") || strings.Contains(styleText, "compact") {
		palette.TypeScale = 0.94
	}
	cardText := strings.ToLower(design.CardTreatment)
	if strings.Contains(cardText, "直角") || strings.Contains(cardText, "方正") || strings.Contains(cardText, "硬边") || strings.Contains(cardText, "flat") {
		palette.CardRadiusScale = 0.28
	}
	if strings.Contains(cardText, "圆") || strings.Contains(cardText, "柔") || strings.Contains(cardText, "soft") {
		palette.CardRadiusScale = 1.35
	}
	motionText := strings.ToLower(design.MotionStrategy)
	if strings.Contains(motionText, "静") || strings.Contains(motionText, "无动") || strings.Contains(motionText, "none") {
		palette.Motion = "none"
	} else if strings.Contains(motionText, "淡入") || strings.Contains(motionText, "平缓") || strings.Contains(motionText, "fade") {
		palette.Motion = "fade"
	}
	return palette
}

func pptColorLuminance(color string) float64 {
	r, g, b, ok := pptHexRGB(color)
	if !ok {
		return 1
	}
	linear := func(value float64) float64 {
		value /= 255
		if value <= 0.03928 {
			return value / 12.92
		}
		return math.Pow((value+0.055)/1.055, 2.4)
	}
	return 0.2126*linear(r) + 0.7152*linear(g) + 0.0722*linear(b)
}

func pptHexRGB(color string) (float64, float64, float64, bool) {
	if len(color) != 7 || color[0] != '#' {
		return 0, 0, 0, false
	}
	value, err := strconv.ParseUint(color[1:], 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return float64((value >> 16) & 0xFF), float64((value >> 8) & 0xFF), float64(value & 0xFF), true
}

func pptColorAlpha(color string, alpha float64) string {
	r, g, b, ok := pptHexRGB(color)
	if !ok {
		return color
	}
	return fmt.Sprintf("rgba(%d,%d,%d,%.2f)", int(r), int(g), int(b), math.Max(0, math.Min(alpha, 1)))
}

func (c *pptLayoutCompiler) compile() map[string]any {
	kind := c.effectiveVisualType()
	slide := map[string]any{
		"id":         c.plan.ID,
		"background": c.palette.Canvas,
		"transition": pptTransitionFor(kind),
		"notes":      cleanPptPlanText(c.plan.Notes, 280),
	}
	switch kind {
	case "cover":
		c.compileCover(&slide)
	case "section":
		c.compileSection(&slide)
	case "kpi":
		c.compileKPI(&slide)
	case "comparison":
		c.compileComparison(&slide)
	case "timeline":
		c.compileTimeline(&slide)
	case "process":
		c.compileProcess(&slide)
	case "architecture":
		c.compileArchitecture(&slide)
	case "matrix":
		c.compileMatrix(&slide)
	case "chart":
		c.compileChart(&slide)
	case "table":
		c.compileTable(&slide)
	case "action":
		c.compileAction(&slide)
	default:
		c.compileInsight(&slide)
	}
	slide["elements"] = c.elements
	return slide
}

func (c *pptLayoutCompiler) effectiveVisualType() string {
	kind := normalizePptVisualType(c.plan.VisualType, c.plan.Index)
	if (kind == "kpi" || kind == "chart") && len(c.numericPoints()) < 2 {
		return "insight"
	}
	if kind == "table" && len(c.layoutItems(4)) == 0 {
		return "insight"
	}
	return kind
}

func pptTransitionFor(kind string) string {
	switch kind {
	case "cover", "section", "insight", "action":
		return "fade"
	case "timeline", "process", "architecture":
		return "slide"
	default:
		return "morph"
	}
}

func (c *pptLayoutCompiler) nextID(role string) string {
	c.serial++
	return fmt.Sprintf("%s-%s-%02d", c.plan.ID, role, c.serial)
}

func (c *pptLayoutCompiler) add(element map[string]any) {
	c.elements = append(c.elements, element)
}

func (c *pptLayoutCompiler) text(role string, x, y, w, h float64, value string, fontSize float64, color string, weight int, align string, order int) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	markup := stdhtml.EscapeString(value)
	if weight >= 600 {
		markup = "<b>" + markup + "</b>"
	}
	fontSize = math.Max(12, math.Min(76, fontSize*c.palette.TypeScale))
	element := map[string]any{
		"id": c.nextID(role), "type": "text", "x": x, "y": y, "w": w, "h": h,
		"rotation": float64(0), "opacity": float64(1), "html": markup,
		"fontSize": fontSize, "fontFamily": c.palette.FontFamily,
		"fontWeight": float64(weight), "color": color, "align": align, "valign": "top", "lineHeight": 1.24,
	}
	c.applyMotion(element, "fade-up", 0.45, order)
	c.add(element)
}

func (c *pptLayoutCompiler) rect(role string, x, y, w, h float64, fill string, radius, opacity float64, order int) {
	element := map[string]any{
		"id": c.nextID(role), "type": "shape", "shape": "rect", "x": x, "y": y, "w": w, "h": h,
		"rotation": float64(0), "opacity": opacity, "fill": fill, "stroke": "transparent", "strokeWidth": float64(0), "radius": c.cardRadius(role, radius),
	}
	c.applyMotion(element, "fade", 0.34, order)
	c.add(element)
}

func (c *pptLayoutCompiler) ellipse(role string, x, y, w, h float64, fill string, opacity float64) {
	c.add(map[string]any{
		"id": c.nextID(role), "type": "shape", "shape": "ellipse", "x": x, "y": y, "w": w, "h": h,
		"rotation": float64(0), "opacity": opacity, "fill": fill, "stroke": "transparent", "strokeWidth": float64(0),
	})
}

func (c *pptLayoutCompiler) arrow(role string, x, y, w, h float64, fill string, order int) {
	element := map[string]any{
		"id": c.nextID(role), "type": "shape", "shape": "arrow", "x": x, "y": y, "w": w, "h": h,
		"rotation": float64(0), "opacity": float64(1), "fill": fill, "stroke": "transparent", "strokeWidth": float64(0),
	}
	c.applyMotion(element, "fade", 0.3, order)
	c.add(element)
}

func (c *pptLayoutCompiler) applyMotion(element map[string]any, fallback string, duration float64, order int) {
	if order <= 0 || c.palette.Motion == "none" {
		return
	}
	enter := fallback
	if c.palette.Motion == "fade" {
		enter = "fade"
	}
	element["fx"] = map[string]any{"enter": enter, "enterDur": duration, "order": float64(order)}
}

func (c *pptLayoutCompiler) cardRadius(role string, radius float64) float64 {
	if radius <= 0 || !isPptCardRole(role) {
		return radius
	}
	return math.Max(2, radius*c.palette.CardRadiusScale)
}

func isPptCardRole(role string) bool {
	for _, value := range []string{"card", "panel", "anchor", "core", "layer", "cell", "table"} {
		if strings.Contains(role, value) {
			return true
		}
	}
	return false
}

func (c *pptLayoutCompiler) cardFill(color string, alpha float64) string {
	if c.palette.Dark {
		alpha = math.Max(alpha, 0.16)
	}
	return pptColorAlpha(color, math.Max(0.02, math.Min(alpha*c.palette.CardFillScale, 0.28)))
}

func (c *pptLayoutCompiler) standardHeader() {
	if c.palette.Variant == "editorial" {
		c.rect("header-marker", 72, 58, 5, 66, c.palette.Accent, 2, 1, 1)
		c.text("title", 100, 76, 900, 48, c.content.Title, 29, c.palette.Ink, 700, "left", 1)
		c.text("page", 1102, 77, 106, 30, fmt.Sprintf("第 %02d 页", c.plan.Index+1), 14, c.palette.Muted, 600, "right", 1)
		return
	}
	c.rect("header-marker", 72, 56, 34, 4, c.palette.Accent, 2, 1, 1)
	c.text("title", 72, 78, 900, 44, c.content.Title, 28, c.palette.Ink, 700, "left", 1)
	c.text("page", 1132, 58, 76, 32, fmt.Sprintf("%02d", c.plan.Index+1), 18, c.palette.Accent, 700, "right", 1)
}

func (c *pptLayoutCompiler) addHeadline(x, y, w, h float64, color string, order int) {
	c.text("headline", x, y, w, h, c.content.Headline, pptHeadlineFontSize(c.content.Headline, 46), color, 700, "left", order)
}

func pptHeadlineFontSize(value string, maximum float64) float64 {
	length := len([]rune(strings.TrimSpace(value)))
	switch {
	case length <= 16:
		return maximum
	case length <= 26:
		return math.Min(maximum, 42)
	case length <= 38:
		return math.Min(maximum, 36)
	default:
		return math.Min(maximum, 31)
	}
}

func (c *pptLayoutCompiler) layoutItems(maximum int) []pptVisualItem {
	items := append([]pptVisualItem(nil), c.content.Visuals...)
	if len(items) == 0 {
		items = derivePptVisualItems(c.content.Items, c.content.Evidence)
	}
	if len(items) == 0 && c.content.Headline != "" {
		items = []pptVisualItem{{Label: c.content.Headline, Detail: c.content.Supporting}}
	}
	if maximum > 0 && len(items) > maximum {
		items = items[:maximum]
	}
	return items
}

func (c *pptLayoutCompiler) numericPoints() []pptNumericPoint {
	points := make([]pptNumericPoint, 0, 5)
	for _, item := range c.layoutItems(5) {
		valueSource := strings.TrimSpace(item.Value)
		if valueSource == "" {
			valueSource = item.Label + " " + item.Detail
		}
		match := pptNumericValuePattern.FindString(valueSource)
		value, ok := pptParseNumericValue(match)
		if !ok {
			continue
		}
		label := strings.TrimSpace(pptNumericValuePattern.ReplaceAllString(item.Label, ""))
		if label == "" {
			label = fmt.Sprintf("要点 %d", len(points)+1)
		}
		points = append(points, pptNumericPoint{
			Label: pptLimitRunes(label, 14), Value: value, Display: strings.TrimSpace(match), Detail: pptLimitRunes(item.Detail, 32),
		})
	}
	return points
}

func pptParseNumericValue(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	multiplier := float64(1)
	switch {
	case strings.HasSuffix(value, "亿"):
		multiplier = 100000000
	case strings.HasSuffix(value, "万"):
		multiplier = 10000
	case strings.HasSuffix(value, "千"):
		multiplier = 1000
	}
	value = strings.TrimRight(value, "%万亿千百十")
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return 0, false
	}
	return parsed * multiplier, true
}

func pptLimitRunes(value string, maximum int) string {
	runes := []rune(strings.TrimSpace(value))
	if maximum <= 0 || len(runes) <= maximum {
		return string(runes)
	}
	return strings.TrimSpace(string(runes[:maximum])) + "..."
}

func (c *pptLayoutCompiler) compileCover(slide *map[string]any) {
	(*slide)["background"] = c.palette.Solid
	if c.palette.Variant == "editorial" {
		c.rect("cover-spine", 76, 88, 7, 540, c.palette.Accent, 2, 1, 1)
		c.rect("cover-block", 806, 82, 330, 556, c.palette.Accent2, 0, 0.82, 0)
		c.rect("cover-block-inset", 862, 138, 290, 328, c.palette.Accent3, 0, 0.74, 0)
		c.text("cover-kicker", 112, 134, 380, 30, fmt.Sprintf("第 %02d 页", c.plan.Index+1), 15, "rgba(255,255,255,0.72)", 600, "left", 1)
		c.text("cover-title", 112, 208, 604, 250, c.content.Title, pptHeadlineFontSize(c.content.Title, 66), "#FFFFFF", 700, "left", 1)
	} else if c.palette.Variant == "minimal" {
		c.rect("cover-rule", 76, 178, 82, 3, c.palette.Accent, 2, 1, 1)
		c.text("cover-title", 76, 238, 760, 210, c.content.Title, pptHeadlineFontSize(c.content.Title, 62), "#FFFFFF", 700, "left", 1)
	} else if c.palette.Variant == "bold" {
		c.rect("cover-block-a", 710, 0, 570, 356, c.palette.Accent, 0, 0.92, 0)
		c.rect("cover-block-b", 896, 326, 384, 394, c.palette.Accent2, 0, 0.88, 0)
		c.rect("cover-rule", 76, 160, 70, 8, c.palette.Accent3, 2, 1, 1)
		c.text("cover-title", 76, 220, 630, 242, c.content.Title, pptHeadlineFontSize(c.content.Title, 64), "#FFFFFF", 700, "left", 1)
	} else {
		c.ellipse("cover-orb-a", 736, 48, 510, 510, c.palette.Accent, 0.22)
		c.ellipse("cover-orb-b", 928, 416, 294, 294, c.palette.Accent2, 0.20)
		c.rect("cover-rule", 76, 160, 54, 5, c.palette.Accent3, 3, 1, 1)
		c.text("cover-title", 76, 222, 610, 230, c.content.Title, pptHeadlineFontSize(c.content.Title, 62), "#FFFFFF", 700, "left", 1)
	}
	support := c.content.Headline
	if support == c.content.Title || support == "" {
		support = c.content.Supporting
	}
	summaryX, summaryY := 80.0, 490.0
	if c.palette.Variant == "editorial" {
		summaryX, summaryY = 112, 498
	}
	c.text("cover-summary", summaryX, summaryY, 540, 100, pptLimitRunes(support, 58), 24, "rgba(255,255,255,0.84)", 400, "left", 2)
	if len(c.content.Items) > 0 {
		c.text("cover-topic", summaryX, 622, 520, 34, pptLimitRunes(c.content.Items[0], 42), 16, "rgba(255,255,255,0.62)", 400, "left", 3)
	}
}

func (c *pptLayoutCompiler) compileSection(slide *map[string]any) {
	(*slide)["background"] = c.palette.Solid
	c.rect("section-band", 0, 522, 1280, 198, c.palette.Accent, 0, 0.94, 0)
	c.text("section-index", 76, 110, 220, 60, fmt.Sprintf("%02d", c.plan.Index+1), 22, pptColorAlpha("#FFFFFF", 0.72), 700, "left", 1)
	c.text("section-title", 76, 205, 760, 150, c.content.Title, pptHeadlineFontSize(c.content.Title, 56), "#FFFFFF", 700, "left", 1)
	c.text("section-headline", 80, 556, 760, 86, pptLimitRunes(c.content.Headline, 58), 28, "#FFFFFF", 500, "left", 2)
}

func (c *pptLayoutCompiler) compileInsight(_ *map[string]any) {
	c.standardHeader()
	c.rect("insight-accent", 72, 186, 8, 280, c.palette.Accent, 4, 1, 1)
	c.addHeadline(112, 188, 560, 252, c.palette.Ink, 2)
	c.text("insight-support", 114, 470, 530, 82, pptLimitRunes(c.content.Supporting, 88), 20, c.palette.Muted, 400, "left", 3)
	c.rect("insight-panel", 748, 168, 460, 432, c.palette.Surface, 18, 1, 1)
	c.rect("insight-panel-line", 748, 168, 460, 6, c.palette.Accent2, 3, 1, 1)
	items := c.layoutItems(4)
	for index, item := range items {
		y := 216 + float64(index)*86
		accent := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3, c.palette.Ink}[index%4]
		c.ellipse("insight-dot", 784, y+7, 16, 16, accent, 1)
		c.text("insight-item", 820, y, 338, 36, pptLimitRunes(item.Label, 34), 20, c.palette.Ink, 650, "left", index+2)
		detail := item.Detail
		if detail == "" {
			detail = item.Value
		}
		c.text("insight-detail", 820, y+35, 336, 34, pptLimitRunes(detail, 48), 16, c.palette.Muted, 400, "left", index+2)
	}
}

func (c *pptLayoutCompiler) compileKPI(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 145, 1020, 110, c.palette.Ink, 2)
	points := c.numericPoints()
	if len(points) > 4 {
		points = points[:4]
	}
	gap := 22.0
	width := (1136 - gap*float64(len(points)-1)) / float64(len(points))
	colors := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3, c.palette.Ink}
	for index, point := range points {
		x := 72 + float64(index)*(width+gap)
		fill := c.cardFill(colors[index%len(colors)], 0.09)
		c.rect("kpi-card", x, 326, width, 236, fill, 16, 1, index+1)
		c.rect("kpi-rule", x, 326, width, 7, colors[index%len(colors)], 4, 1, index+1)
		c.text("kpi-value", x+24, 370, width-48, 72, pptLimitRunes(point.Display, 18), 42, c.palette.Ink, 700, "left", index+2)
		c.text("kpi-label", x+24, 456, width-48, 44, point.Label, 20, c.palette.Ink, 650, "left", index+2)
		c.text("kpi-detail", x+24, 510, width-48, 32, point.Detail, 15, c.palette.Muted, 400, "left", index+3)
	}
	if c.content.Supporting != "" {
		c.text("kpi-support", 74, 596, 1010, 40, pptLimitRunes(c.content.Supporting, 108), 17, c.palette.Muted, 400, "left", 4)
	}
}

func (c *pptLayoutCompiler) compileComparison(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 142, 1040, 98, c.palette.Ink, 2)
	items := c.layoutItems(3)
	if len(items) < 2 {
		items = append(items, pptVisualItem{Label: c.content.Supporting})
	}
	gap := 24.0
	width := (1136 - gap*float64(len(items)-1)) / float64(len(items))
	colors := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3}
	for index, item := range items {
		x := 72 + float64(index)*(width+gap)
		accent := colors[index%len(colors)]
		c.rect("compare-card", x, 292, width, 282, c.cardFill(accent, 0.075), 16, 1, index+1)
		c.rect("compare-index", x+24, 316, 44, 30, accent, 15, 1, index+1)
		c.text("compare-index-label", x+24, 321, 44, 21, fmt.Sprintf("%02d", index+1), 13, "#FFFFFF", 700, "center", index+1)
		c.text("compare-label", x+24, 372, width-48, 80, pptLimitRunes(item.Label, 36), 23, c.palette.Ink, 700, "left", index+2)
		if item.Value != "" {
			c.text("compare-value", x+24, 462, width-48, 40, pptLimitRunes(item.Value, 24), 22, accent, 700, "left", index+2)
		}
		c.text("compare-detail", x+24, 510, width-48, 46, pptLimitRunes(item.Detail, 54), 16, c.palette.Muted, 400, "left", index+3)
	}
}

func (c *pptLayoutCompiler) compileTimeline(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 142, 1020, 92, c.palette.Ink, 2)
	items := c.layoutItems(5)
	if len(items) < 2 {
		items = append(items, pptVisualItem{Label: c.content.Supporting})
	}
	start, end, lineY := 138.0, 1142.0, 404.0
	c.rect("timeline-line", start, lineY, end-start, 4, c.palette.Line, 2, 1, 1)
	step := (end - start) / float64(len(items)-1)
	for index, item := range items {
		x := start + float64(index)*step
		above := index%2 == 0
		cardY := 254.0
		if !above {
			cardY = 454
		}
		cardX := math.Max(60, math.Min(1026, x-104))
		accent := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3, c.palette.Ink}[index%4]
		c.rect("timeline-card", cardX, cardY, 208, 106, c.cardFill(accent, 0.08), 12, 1, index+1)
		c.ellipse("timeline-node", x-16, lineY-16, 32, 32, accent, 1)
		c.text("timeline-number", x-15, lineY-8, 30, 18, fmt.Sprintf("%d", index+1), 12, "#FFFFFF", 700, "center", index+1)
		c.text("timeline-label", cardX+16, cardY+16, 176, 38, pptLimitRunes(item.Label, 22), 18, c.palette.Ink, 700, "left", index+2)
		detail := item.Detail
		if detail == "" {
			detail = item.Value
		}
		c.text("timeline-detail", cardX+16, cardY+58, 176, 32, pptLimitRunes(detail, 36), 14, c.palette.Muted, 400, "left", index+2)
	}
}

func (c *pptLayoutCompiler) compileProcess(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 142, 1010, 92, c.palette.Ink, 2)
	items := c.layoutItems(4)
	if len(items) < 2 {
		items = append(items, pptVisualItem{Label: c.content.Supporting})
	}
	gap := 26.0
	arrowW := 42.0
	width := (1136 - gap*float64(len(items)-1) - arrowW*float64(len(items)-1)) / float64(len(items))
	x := 72.0
	colors := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3, c.palette.Ink}
	for index, item := range items {
		accent := colors[index%len(colors)]
		c.rect("process-card", x, 314, width, 188, c.cardFill(accent, 0.075), 16, 1, index+1)
		c.ellipse("process-step", x+22, 336, 36, 36, accent, 1)
		c.text("process-step-label", x+22, 345, 36, 18, fmt.Sprintf("%d", index+1), 14, "#FFFFFF", 700, "center", index+1)
		c.text("process-label", x+24, 394, width-48, 50, pptLimitRunes(item.Label, 26), 20, c.palette.Ink, 700, "left", index+2)
		detail := item.Detail
		if detail == "" {
			detail = item.Value
		}
		c.text("process-detail", x+24, 454, width-48, 32, pptLimitRunes(detail, 38), 14, c.palette.Muted, 400, "left", index+3)
		if index < len(items)-1 {
			c.arrow("process-arrow", x+width+gap/2, 380, arrowW, 48, c.palette.Line, index+2)
		}
		x += width + gap + arrowW
	}
}

func (c *pptLayoutCompiler) compileArchitecture(_ *map[string]any) {
	c.standardHeader()
	c.rect("architecture-core", 72, 196, 308, 386, c.palette.Solid, 18, 1, 1)
	c.text("architecture-title", 104, 236, 244, 34, c.content.Title, 20, pptColorAlpha("#FFFFFF", 0.72), 600, "left", 1)
	c.text("architecture-headline", 104, 296, 234, 160, pptLimitRunes(c.content.Headline, 42), 31, "#FFFFFF", 700, "left", 2)
	c.text("architecture-support", 104, 490, 232, 56, pptLimitRunes(c.content.Supporting, 58), 15, pptColorAlpha("#FFFFFF", 0.7), 400, "left", 3)
	items := c.layoutItems(3)
	for index, item := range items {
		y := 196 + float64(index)*126
		accent := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3}[index%3]
		c.rect("architecture-connector", 380, y+50, 54, 4, c.palette.Line, 2, 1, index+1)
		c.rect("architecture-layer", 434, y, 774, 100, c.cardFill(accent, 0.075), 14, 1, index+1)
		c.rect("architecture-marker", 434, y, 8, 100, accent, 4, 1, index+1)
		c.text("architecture-label", 470, y+22, 282, 34, pptLimitRunes(item.Label, 30), 21, c.palette.Ink, 700, "left", index+2)
		detail := item.Detail
		if detail == "" {
			detail = item.Value
		}
		c.text("architecture-detail", 770, y+28, 398, 34, pptLimitRunes(detail, 52), 16, c.palette.Muted, 400, "left", index+2)
	}
}

func (c *pptLayoutCompiler) compileMatrix(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 142, 1010, 90, c.palette.Ink, 2)
	items := c.layoutItems(4)
	for len(items) < 4 {
		items = append(items, pptVisualItem{Label: c.content.Supporting})
	}
	gridX, gridY, cellW, cellH := 234.0, 242.0, 440.0, 168.0
	colors := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3, c.palette.Ink}
	for index := 0; index < 4; index++ {
		col, row := index%2, index/2
		x, y := gridX+float64(col)*(cellW+12), gridY+float64(row)*(cellH+12)
		accent := colors[index]
		c.rect("matrix-cell", x, y, cellW, cellH, c.cardFill(accent, 0.075), 14, 1, index+1)
		c.rect("matrix-corner", x, y, 46, 7, accent, 4, 1, index+1)
		c.text("matrix-label", x+22, y+34, cellW-44, 54, pptLimitRunes(items[index].Label, 30), 21, c.palette.Ink, 700, "left", index+2)
		detail := items[index].Detail
		if detail == "" {
			detail = items[index].Value
		}
		c.text("matrix-detail", x+22, y+102, cellW-44, 34, pptLimitRunes(detail, 48), 15, c.palette.Muted, 400, "left", index+2)
	}
	c.text("matrix-axis-y", 76, 346, 118, 34, "影响程度", 16, c.palette.Muted, 600, "center", 1)
	c.text("matrix-axis-x", 570, 614, 220, 34, "行动优先级", 16, c.palette.Muted, 600, "center", 1)
}

func (c *pptLayoutCompiler) compileChart(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 194, 420, 205, c.palette.Ink, 2)
	c.text("chart-support", 74, 430, 412, 100, pptLimitRunes(c.content.Supporting, 100), 18, c.palette.Muted, 400, "left", 3)
	points := c.numericPoints()
	labels := make([]any, 0, len(points))
	values := make([]any, 0, len(points))
	for _, point := range points {
		labels = append(labels, point.Label)
		values = append(values, point.Value)
	}
	option := map[string]any{
		"color":   []any{c.palette.Accent, c.palette.Accent2, c.palette.Accent3},
		"tooltip": map[string]any{"trigger": "axis"},
		"grid":    map[string]any{"left": 48, "right": 20, "top": 28, "bottom": 52},
		"xAxis":   map[string]any{"type": "category", "data": labels, "axisLabel": map[string]any{"color": c.palette.Muted, "fontSize": 13}},
		"yAxis":   map[string]any{"type": "value", "axisLabel": map[string]any{"color": c.palette.Muted, "fontSize": 12}, "splitLine": map[string]any{"lineStyle": map[string]any{"color": c.palette.Line}}},
		"series":  []any{map[string]any{"type": "bar", "name": "关键数据", "data": values, "barMaxWidth": 44, "itemStyle": map[string]any{"borderRadius": []any{8, 8, 0, 0}}}},
	}
	element := map[string]any{
		"id": c.nextID("chart"), "type": "chart", "x": 552.0, "y": 178.0, "w": 656.0, "h": 402.0,
		"rotation": float64(0), "opacity": float64(1), "preset": "bar", "option": option,
	}
	c.applyMotion(element, "fade-up", 0.5, 2)
	c.add(element)
}

func (c *pptLayoutCompiler) compileTable(_ *map[string]any) {
	c.standardHeader()
	c.addHeadline(72, 142, 1050, 74, c.palette.Ink, 2)
	items := c.layoutItems(4)
	hasValues := false
	for _, item := range items {
		hasValues = hasValues || strings.TrimSpace(item.Value) != ""
	}
	columns := []any{map[string]any{"w": 1.1}, map[string]any{"w": 2.1}}
	header := []any{pptTableCell("维度", true), pptTableCell("关键信息", true)}
	if hasValues {
		columns = []any{map[string]any{"w": 1.1}, map[string]any{"w": 0.8}, map[string]any{"w": 1.6}}
		header = []any{pptTableCell("维度", true), pptTableCell("数值", true), pptTableCell("关键信息", true)}
	}
	rows := []any{map[string]any{"cells": header}}
	for _, item := range items {
		detail := item.Detail
		if detail == "" {
			detail = c.content.Supporting
		}
		cells := []any{pptTableCell(pptLimitRunes(item.Label, 28), false)}
		if hasValues {
			cells = append(cells, pptTableCell(pptLimitRunes(item.Value, 20), false))
		}
		cells = append(cells, pptTableCell(pptLimitRunes(detail, 54), false))
		rows = append(rows, map[string]any{"cells": cells})
	}
	style := map[string]any{
		"headerBg": c.palette.Solid, "headerColor": "#FFFFFF", "zebra": "rgba(23,59,83,0.045)",
		"borderColor": c.palette.Line, "borderWidth": float64(1), "cellPadX": float64(17), "cellPadY": float64(12),
		"fontSize": math.Max(14, 18*c.palette.TypeScale), "color": c.palette.Ink, "radius": c.cardRadius("table", 10), "fontFamily": c.palette.FontFamily,
	}
	element := map[string]any{
		"id": c.nextID("table"), "type": "table", "x": 72.0, "y": 254.0, "w": 1136.0, "h": 280.0,
		"rotation": float64(0), "opacity": float64(1), "header": true, "columns": columns, "rows": rows, "style": style,
	}
	c.applyMotion(element, "fade-up", 0.48, 2)
	c.add(element)
}

func pptTableCell(value string, bold bool) map[string]any {
	return map[string]any{"html": stdhtml.EscapeString(value), "align": "left", "bold": bold}
}

func (c *pptLayoutCompiler) compileAction(_ *map[string]any) {
	c.standardHeader()
	c.rect("action-anchor", 72, 180, 406, 392, c.palette.Solid, 18, 1, 1)
	c.text("action-title", 106, 222, 332, 36, c.content.Title, 19, pptColorAlpha("#FFFFFF", 0.7), 600, "left", 1)
	c.text("action-headline", 106, 284, 326, 180, pptLimitRunes(c.content.Headline, 46), 33, "#FFFFFF", 700, "left", 2)
	c.text("action-support", 106, 490, 320, 54, pptLimitRunes(c.content.Supporting, 64), 15, pptColorAlpha("#FFFFFF", 0.7), 400, "left", 3)
	items := c.layoutItems(3)
	for index, item := range items {
		y := 190 + float64(index)*126
		accent := []string{c.palette.Accent, c.palette.Accent2, c.palette.Accent3}[index%3]
		c.rect("action-card", 536, y, 672, 102, c.cardFill(accent, 0.075), 14, 1, index+1)
		c.rect("action-order", 562, y+25, 42, 42, accent, 12, 1, index+1)
		c.text("action-order-label", 562, y+37, 42, 20, fmt.Sprintf("%d", index+1), 15, "#FFFFFF", 700, "center", index+1)
		c.text("action-label", 630, y+22, 530, 34, pptLimitRunes(item.Label, 34), 20, c.palette.Ink, 700, "left", index+2)
		detail := item.Detail
		if detail == "" {
			detail = item.Value
		}
		c.text("action-detail", 630, y+60, 530, 28, pptLimitRunes(detail, 48), 15, c.palette.Muted, 400, "left", index+2)
	}
}
