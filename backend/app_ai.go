package backend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"net"
	"net/http"
	"strings"
)

// FormatMarkdownWithAI calls an OpenAI-compatible chat completion endpoint to
// reorganize Markdown or HTML formatting without intentionally changing the content.
func (a *App) FormatMarkdownWithAI(req AIFormatRequest) (string, error) {
	if strings.TrimSpace(req.Markdown) == "" {
		if strings.EqualFold(strings.TrimSpace(req.Format), "html") {
			return "", fmt.Errorf("HTML 内容为空")
		}
		return "", fmt.Errorf("Markdown 内容为空")
	}

	modelName, err := resolveAIModelName(req.Model)
	if err != nil {
		return "", err
	}

	timeout := clampTimeout(req.Model.FormatTimeout, 300, 30, 1800)

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

	var userPrompt string
	var systemPrompt string
	format := strings.ToLower(strings.TrimSpace(req.Format))
	isHTMLFormat := format == "html"
	requestKind := "format"
	progressKind := "markdown-format"
	if isHTMLFormat {
		requestKind = "html-format"
		progressKind = "html-format"
		systemPrompt = `你是 HTML 页面设计和排版助手。只能返回完整、可运行的 HTML 源码，不要解释，不要 Markdown 代码块，不要把结果转换为 Markdown。

最高优先级规则：
1. 必须保留原 HTML 中的文字、数字、链接、图片地址、表格内容、表单内容、语义结构和可见信息，不能删减、改写、总结、翻译或虚构。
2. 可以优化 HTML 结构、CSS、容器层级、字号、颜色、留白、对齐、响应式布局和视觉层次；可以添加 style 标签或内联样式。
3. 不要输出说明文字、前言、结尾、差异说明或“下面是”之类内容；响应第一个非空字符必须是 <。
4. 如果原始内容是完整 HTML 文档，返回完整 HTML 文档；如果原始内容是片段，也要返回可运行的完整 HTML 文档。
5. 不要引用无法访问的新外部资源；原文已有外部图片、字体、链接可以保留。`
		userPrompt = "请对下面 HTML 做一次页面设计和视觉排版优化。只返回完整 HTML 源码。\n\n"
		if instruction != "" {
			userPrompt += "用户排版要求：\n<formatting_requirement>\n" + instruction + "\n</formatting_requirement>\n\n"
		} else {
			userPrompt += "默认目标：让页面更清晰、美观、层次分明，同时尽量保留原始内容和语义。\n\n"
		}
		userPrompt += "<html_input>\n" + req.Markdown + "\n</html_input>"
	} else if instruction != "" {
		systemPrompt = `你是 Markdown 排版助手。用户的排版要求是本次任务的主要目标。只能返回整理后的 Markdown，不要解释，不要包裹整个输出的代码围栏。

执行原则：
1. 优先满足用户明确写出的排版要求，例如任务计划、会议纪要、报告结构、步骤清单、表格归纳等。
2. 可以为了满足用户要求调整 Markdown 结构、标题层级、列表、任务清单、表格、引用和代码块；允许添加简短的结构性标题或分组名。
3. 不要虚构事实、数字、结论、负责人、日期或原文没有的信息；不确定的信息不要补写。
4. 尽量保留原文中的有效信息和含义，除非用户要求压缩、摘要或改写。
5. 如果用户要求整理为任务计划，使用标准 Markdown 任务清单：- [ ] 表示待办，- [x] 表示已完成。`
		userPrompt = "请按用户的排版要求整理下面 Markdown。用户要求优先于默认排版习惯；只在必要时应用少量 Markdown 规范化。\n\n用户排版要求：\n<formatting_requirement>\n" +
			instruction + "\n</formatting_requirement>\n\n<markdown_input>\n" + req.Markdown + "\n</markdown_input>"
	} else {
		userPrompt = "请对下面 Markdown 做一次专业语义排版，内容不能增删改；可以重组 Markdown 结构，让阅读层次和前后差异更明显，不要只做轻微空格调整。"
		userPrompt += "\n\n用户没有额外要求，请执行默认专业排版策略：根据内容语义识别标题、摘要、步骤、清单、任务、数据、代码、引用和表格，并选择最合适的 Markdown 元素。"
		userPrompt += "\n\n<markdown_input>\n" + req.Markdown + "\n</markdown_input>"

		systemPrompt = `你是专业 Markdown 信息架构和排版助手。只能返回整理后的 Markdown 原文，不要解释，不要包裹整个输出的代码围栏。

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

用户的额外要求优先级低于内容保留规则，任何要求都不能导致内容增删、改写或虚构。`
	}

	progress := newAIProgressReporter(a, progressKind)
	progress.emitStarted("正在准备 AI 排版请求", "请求由桌面端后端发起。")

	endpoint, body, err := prepareAIRequest(req.Model, aiRequestContext{
		Kind:         requestKind,
		ModelName:    modelName,
		Temperature:  0.2,
		SystemPrompt: systemPrompt,
		UserPrompt:   userPrompt,
		Markdown:     req.Markdown,
		Instruction:  instruction,
		Messages: []chatCompletionMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	})
	if err != nil {
		progress.emitFailure("AI 排版请求准备失败", err.Error(), nil)
		return "", err
	}
	execution, content, _, err := a.executeAIContentLifecycle(
		req.Model,
		endpoint,
		body,
		timeout,
		maxAIFormatResponseBytes,
		progress,
		aiContentLifecycleOptions{
			streamMessage:              "模型正在流式返回内容",
			requestFailureMessage:      "模型请求失败",
			requestErrorPrefix:         "请求模型失败",
			interfaceFailureMessage:    "模型接口返回错误",
			explicitFailureMessage:     "模型返回显式错误",
			httpErrorFormat:            "模型请求失败，HTTP %d",
			parsingMessage:             "正在解析模型返回内容",
			contentParseFailureMessage: "模型返回解析失败",
			contentExtractedMessage:    "已提取模型内容",
		},
	)
	if err != nil {
		return "", err
	}
	progress.emitCompleted("后端处理完成", "准备返回前端预览确认", len(content), execution)

	return content, nil
}

func (a *App) emitAIFormatProgress(event AIFormatProgressEvent) {
	if a == nil || a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "ai-format-progress", event)
}

// GenerateThemeWithAI asks an OpenAI-compatible model for a UI theme palette.
func (a *App) GenerateThemeWithAI(req AIThemeRequest) (string, error) {
	modelName, err := resolveAIModelName(req.Model)
	if err != nil {
		return "", err
	}

	timeout := clampTimeout(req.Model.FormatTimeout, 300, 30, 1800)
	progressKind := "theme"

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
	systemPrompt := `你是资深产品 UI 设计师和 Markdown 阅读体验设计师。只返回 JSON，不要 Markdown 代码块，不要解释。
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
所有颜色必须是安全 CSS 颜色值，优先使用 #RRGGBB，透明色只允许 rgba(...)。appearance 和 markdown 只能使用上述字段和值；数值要克制，blur 不要超过 28。文字和背景必须有足够对比度。`

	progress := newAIProgressReporter(a, progressKind)
	progress.emitStarted("正在准备智能主题请求", "请求由桌面端后端发起。")

	endpoint, body, err := prepareAIRequest(req.Model, aiRequestContext{
		Kind:         "theme",
		ModelName:    modelName,
		Temperature:  0.85,
		SystemPrompt: systemPrompt,
		UserPrompt:   userPrompt,
		Preference:   preference,
		CurrentTheme: currentTheme,
		Messages: []chatCompletionMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	})
	if err != nil {
		progress.emitFailure("智能主题请求准备失败", err.Error(), nil)
		return "", err
	}
	execution, content, _, err := a.executeAIContentLifecycle(
		req.Model,
		endpoint,
		body,
		timeout,
		maxAIThemeResponseBytes,
		progress,
		aiContentLifecycleOptions{
			streamMessage:              "模型正在流式返回主题数据",
			requestFailureMessage:      "主题模型请求失败",
			requestErrorPrefix:         "请求模型生成主题失败",
			interfaceFailureMessage:    "主题模型接口返回错误",
			explicitFailureMessage:     "主题模型返回显式错误",
			httpErrorFormat:            "主题模型请求失败，HTTP %d",
			parsingMessage:             "正在解析主题结果",
			contentParseFailureMessage: "主题结果解析失败",
			contentExtractedMessage:    "已提取主题结果",
			extractContent: func(execution aiExecutionResult) (string, string, error) {
				content, contentPath, err := extractAIExecutionContent(execution)
				if err == nil {
					return content, contentPath, nil
				}
				if !json.Valid(execution.ResponseBody) {
					return "", "", err
				}
				return strings.TrimSpace(string(execution.ResponseBody)), "$", nil
			},
		},
	)
	if err != nil {
		return "", err
	}

	if !json.Valid([]byte(content)) {
		start := strings.Index(content, "{")
		end := strings.LastIndex(content, "}")
		if start >= 0 && end > start {
			content = strings.TrimSpace(content[start : end+1])
		}
	}

	var themePayload map[string]any
	if err := json.Unmarshal([]byte(content), &themePayload); err != nil {
		progress.emitFailure("主题 JSON 校验失败", err.Error(), &execution)
		return "", fmt.Errorf("模型没有返回合法主题 JSON: %w", err)
	}

	normalized, err := json.Marshal(themePayload)
	if err != nil {
		progress.emitFailure("整理主题 JSON 失败", err.Error(), &execution)
		return "", fmt.Errorf("整理主题 JSON 失败: %w", err)
	}
	progress.emitCompleted("后端处理完成", "准备返回前端应用主题", len(normalized), execution)

	return string(normalized), nil
}

// GenerateContentWithAI asks an OpenAI-compatible model for code or Mermaid content.
func (a *App) GenerateContentWithAI(req AIGenerateContentRequest) (string, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return "", fmt.Errorf("生成需求不能为空")
	}

	modelName, err := resolveAIModelName(req.Model)
	if err != nil {
		return "", err
	}

	timeout := clampTimeout(req.Model.FormatTimeout, 300, 30, 1800)
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	if kind != "mermaid" {
		kind = "code"
	}

	language := strings.TrimSpace(req.Language)
	template := strings.TrimSpace(req.Template)

	promptRunes := []rune(prompt)
	if len(promptRunes) > 1200 {
		prompt = string(promptRunes[:1200])
	}
	templateRunes := []rune(template)
	if len(templateRunes) > 2000 {
		template = string(templateRunes[:2000])
	}

	var systemPrompt string
	var userPrompt strings.Builder
	if kind == "mermaid" {
		systemPrompt = `你是 Mermaid 图表生成助手。只返回可以直接插入的 Mermaid 源码，不要解释，不要 Markdown 说明，不要额外围栏。
要求：
1. 根据用户需求生成准确的 Mermaid 语法。
2. 如果提供了模板，请沿用其图类型和结构。
3. 允许返回 flowchart、sequenceDiagram、classDiagram、gantt、pie、erDiagram 等常见图。
4. 输出必须尽量简洁，并保证可直接渲染。`
		userPrompt.WriteString("请根据下面需求生成 Mermaid 内容。\n")
	} else {
		systemPrompt = `你是代码片段生成助手。只返回可直接插入的代码内容，不要解释，不要 Markdown 说明，不要额外围栏。
要求：
1. 根据用户需求生成对应语言的代码。
2. 如果提供了模板，请沿用其结构和风格。
3. 代码应尽量简洁、完整、可直接使用。`
		userPrompt.WriteString("请根据下面需求生成代码内容。\n")
	}

	userPrompt.WriteString("\n用户需求：\n")
	userPrompt.WriteString(prompt)

	if language != "" {
		userPrompt.WriteString("\n\n目标语言：\n")
		userPrompt.WriteString(language)
	}

	if template != "" {
		userPrompt.WriteString("\n\n参考模板：\n")
		if kind == "mermaid" {
			userPrompt.WriteString("```mermaid\n")
		} else if language != "" {
			userPrompt.WriteString("```")
			userPrompt.WriteString(language)
			userPrompt.WriteString("\n")
		} else {
			userPrompt.WriteString("```\n")
		}
		userPrompt.WriteString(template)
		if !strings.HasSuffix(template, "\n") {
			userPrompt.WriteString("\n")
		}
		userPrompt.WriteString("```")
	}

	progress := newAIProgressReporter(a, "content-generate")
	progress.emitStarted("正在准备 AI 生成请求", "请求由桌面端后端发起。")

	endpoint, body, err := prepareAIRequest(req.Model, aiRequestContext{
		Kind:         "content-generate",
		ModelName:    modelName,
		Temperature:  0.2,
		SystemPrompt: systemPrompt,
		UserPrompt:   userPrompt.String(),
		Instruction:  prompt,
		Messages: []chatCompletionMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt.String()},
		},
	})
	if err != nil {
		progress.emitFailure("AI 生成请求准备失败", err.Error(), nil)
		return "", err
	}

	execution, content, _, err := a.executeAIContentLifecycle(
		req.Model,
		endpoint,
		body,
		timeout,
		maxAIFormatResponseBytes,
		progress,
		aiContentLifecycleOptions{
			streamMessage:              "模型正在流式生成内容",
			requestFailureMessage:      "内容生成请求失败",
			requestErrorPrefix:         "请求内容生成失败",
			interfaceFailureMessage:    "内容生成接口返回错误",
			explicitFailureMessage:     "内容生成显式错误",
			httpErrorFormat:            "内容生成请求失败，HTTP %d",
			parsingMessage:             "正在解析生成结果",
			contentParseFailureMessage: "内容生成解析失败",
			contentExtractedMessage:    "已提取生成内容",
		},
	)
	if err != nil {
		return "", err
	}

	generated := strings.TrimSpace(stripOuterMarkdownFence(content))
	if generated == "" {
		return "", fmt.Errorf("模型没有返回可用内容")
	}

	progress.emitCompleted("后端处理完成", "已生成可插入内容", len(generated), execution)
	return generated, nil
}

// TestAIModel sends a tiny prompt to verify that the configured model can respond.
func (a *App) TestAIModel(model AIModelConfig) (string, error) {
	result := a.TestAIModelDetailed(model)
	if !result.Success {
		return "", fmt.Errorf("%s", result.Message)
	}
	return result.Content, nil
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
	return fmt.Errorf("AI 请求超时（当前 %d 秒），请提高模型的“AI排版超时”或更换响应更快的模型", timeout)
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
