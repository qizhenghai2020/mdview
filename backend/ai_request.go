package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func (a *App) TestAIModelDetailed(model AIModelConfig) AIModelTestResult {
	result := AIModelTestResult{
		Method: http.MethodPost,
	}

	modelName, err := resolveAIModelName(model)
	if err != nil {
		result.Message = err.Error()
		return result
	}

	timeout := clampTimeout(model.Timeout, 60, 5, 300)
	systemPrompt := "你是模型连通性测试助手。只返回 OK。"
	userPrompt := "请只回复 OK，用于测试模型是否可用。"

	endpoint, body, err := prepareAIRequest(model, aiRequestContext{
		Kind:         "test",
		ModelName:    modelName,
		Temperature:  0,
		SystemPrompt: systemPrompt,
		UserPrompt:   userPrompt,
		Messages: []chatCompletionMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	})
	if err != nil {
		result.Message = err.Error()
		return result
	}

	execution, content, contentPath, err := a.executeAIContentLifecycle(
		model,
		endpoint,
		body,
		timeout,
		maxAITestResponseBytes,
		nil,
		aiContentLifecycleOptions{
			requestErrorPrefix: "测试请求失败",
			timeoutError: func(timeout int) error {
				return fmt.Errorf("模型测试超时（当前 %d 秒），请提高“测试超时”后重试", timeout)
			},
			interfaceFailureMessage:    "模型接口返回错误",
			explicitFailureMessage:     "模型返回显式错误",
			httpErrorFormat:            "模型测试失败，HTTP %d",
			parsingMessage:             "正在解析模型测试结果",
			contentParseFailureMessage: "模型测试返回解析失败",
			contentExtractedMessage:    "已提取模型测试结果",
		},
	)
	applyAIExecutionSnapshot(&result, execution)
	if err != nil {
		result.Message = err.Error()
		return result
	}

	result.Success = true
	result.Content = content
	result.ContentPath = contentPath
	result.Message = "测试通过"
	return result
}

func clampTimeout(value, fallback, min, max int) int {
	timeout := value
	if timeout <= 0 {
		timeout = fallback
	}
	if timeout < min {
		timeout = min
	}
	if timeout > max {
		timeout = max
	}
	return timeout
}

func resolveAIModelName(model AIModelConfig) (string, error) {
	if strings.TrimSpace(model.BaseURL) == "" || strings.TrimSpace(model.Model) == "" {
		return "", fmt.Errorf("模型接口地址或模型名称为空")
	}

	return strings.TrimSpace(model.Model), nil
}

func prepareAIRequest(model AIModelConfig, requestContext aiRequestContext) (string, []byte, error) {
	endpoint := resolveAIEndpoint(strings.TrimSpace(model.BaseURL), model.RequestTemplate)
	if endpoint == "" {
		return "", nil, fmt.Errorf("模型接口地址为空")
	}

	requestContext, err := attachReferenceImages(requestContext)
	if err != nil {
		return "", nil, err
	}

	payload := chatCompletionRequest{
		Model:       requestContext.ModelName,
		Messages:    requestContext.Messages,
		Temperature: requestContext.Temperature,
	}

	body, err := marshalAIRequestPayload(model, payload, requestContext)
	if err != nil {
		return "", nil, err
	}

	return endpoint, body, nil
}

func resolveAIEndpoint(baseURL string, requestTemplate string) string {
	endpoint := strings.TrimSpace(baseURL)
	if endpoint == "" {
		return ""
	}

	if strings.TrimSpace(requestTemplate) == "" {
		return ensureChatCompletionsEndpoint(endpoint)
	}

	parsed, err := url.Parse(endpoint)
	if err != nil {
		return ensureChatCompletionsEndpoint(endpoint)
	}

	trimmedPath := strings.Trim(strings.TrimSpace(parsed.Path), "/")
	if trimmedPath == "" ||
		strings.EqualFold(trimmedPath, "v1") ||
		strings.EqualFold(trimmedPath, "v2") ||
		strings.EqualFold(trimmedPath, "api") {
		return ensureChatCompletionsEndpoint(endpoint)
	}

	return endpoint
}

func ensureChatCompletionsEndpoint(baseURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		endpoint := strings.TrimRight(strings.TrimSpace(baseURL), "/")
		if strings.HasSuffix(endpoint, "/chat/completions") {
			return endpoint
		}
		return endpoint + "/chat/completions"
	}

	if strings.HasSuffix(strings.TrimRight(parsed.Path, "/"), "/chat/completions") {
		return parsed.String()
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/chat/completions"
	return parsed.String()
}

func marshalAIRequestPayload(model AIModelConfig, defaultPayload chatCompletionRequest, requestContext aiRequestContext) ([]byte, error) {
	template := strings.TrimSpace(model.RequestTemplate)
	if template == "" {
		body, err := json.Marshal(defaultPayload)
		if err != nil {
			return nil, fmt.Errorf("生成请求失败: %w", err)
		}
		return body, nil
	}

	var raw any
	if err := json.Unmarshal([]byte(template), &raw); err != nil {
		return nil, fmt.Errorf("解析请求参数模板失败: %w", err)
	}

	variables := buildAIRequestTemplateVariables(requestContext)
	filled, err := applyTemplateVariables(raw, variables)
	if err != nil {
		return nil, fmt.Errorf("填充请求参数模板失败: %w", err)
	}

	normalized, err := finalizeTemplatePayload(filled, variables)
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal(normalized)
	if err != nil {
		return nil, fmt.Errorf("生成模板请求失败: %w", err)
	}

	return body, nil
}

func buildAIRequestTemplateVariables(requestContext aiRequestContext) map[string]any {
	messages := make([]map[string]any, 0, len(requestContext.Messages))
	for _, message := range requestContext.Messages {
		messages = append(messages, map[string]any{
			"role":    message.Role,
			"content": chatMessageContent(message),
		})
	}
	imageURLs := make([]string, 0)
	for _, message := range requestContext.Messages {
		imageURLs = append(imageURLs, message.ImageDataURLs...)
	}

	format := "markdown"
	if requestContext.Kind == "html-format" {
		format = "html"
	}

	return map[string]any{
		"requestKind":     requestContext.Kind,
		"format":          format,
		"model":           requestContext.ModelName,
		"temperature":     requestContext.Temperature,
		"messages":        messages,
		"systemPrompt":    requestContext.SystemPrompt,
		"userPrompt":      requestContext.UserPrompt,
		"markdown":        requestContext.Markdown,
		"html":            requestContext.Markdown,
		"instruction":     requestContext.Instruction,
		"preference":      requestContext.Preference,
		"currentTheme":    requestContext.CurrentTheme,
		"referenceImages": imageURLs,
	}
}

func chatMessageContent(message chatCompletionMessage) any {
	if len(message.ImageDataURLs) == 0 {
		return message.Content
	}
	parts := make([]map[string]any, 0, len(message.ImageDataURLs)+1)
	for _, imageURL := range message.ImageDataURLs {
		if imageURL == "" {
			continue
		}
		parts = append(parts, map[string]any{
			"type":      "image_url",
			"image_url": map[string]any{"url": imageURL},
		})
	}
	if message.Content != "" {
		parts = append(parts, map[string]any{"type": "text", "text": message.Content})
	}
	return parts
}

func applyTemplateVariables(value any, variables map[string]any) (any, error) {
	switch typed := value.(type) {
	case map[string]any:
		next := make(map[string]any, len(typed))
		for key, child := range typed {
			if replacement, ok := autoTemplateFieldValue(key, child, variables); ok {
				next[key] = cloneTemplateValue(replacement)
				continue
			}

			normalized, err := applyTemplateVariables(child, variables)
			if err != nil {
				return nil, err
			}
			next[key] = normalized
		}
		return next, nil
	case []any:
		next := make([]any, 0, len(typed))
		for _, item := range typed {
			normalized, err := applyTemplateVariables(item, variables)
			if err != nil {
				return nil, err
			}
			next = append(next, normalized)
		}
		return next, nil
	case string:
		return replaceTemplateString(typed, variables), nil
	default:
		return value, nil
	}
}

func autoTemplateFieldValue(key string, original any, variables map[string]any) (any, bool) {
	if templateValueContainsPlaceholder(original) {
		return nil, false
	}

	switch strings.ToLower(strings.TrimSpace(key)) {
	case "model":
		return variables["model"], true
	case "temperature":
		return variables["temperature"], true
	case "messages":
		return variables["messages"], true
	case "system":
		return variables["systemPrompt"], true
	case "prompt", "input":
		return variables["userPrompt"], true
	case "instruction":
		return variables["instruction"], true
	case "preference":
		return variables["preference"], true
	case "currenttheme":
		return variables["currentTheme"], true
	default:
		return nil, false
	}
}

func replaceTemplateString(template string, variables map[string]any) any {
	matches := templatePlaceholderPattern.FindAllStringSubmatchIndex(template, -1)
	if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(template) {
		name := template[matches[0][2]:matches[0][3]]
		if value, ok := variables[name]; ok {
			return cloneTemplateValue(value)
		}
		return ""
	}

	return templatePlaceholderPattern.ReplaceAllStringFunc(template, func(match string) string {
		nameMatch := templatePlaceholderPattern.FindStringSubmatch(match)
		if len(nameMatch) != 2 {
			return match
		}
		value, ok := variables[nameMatch[1]]
		if !ok {
			return ""
		}
		return templateValueToString(value)
	})
}

func finalizeTemplatePayload(value any, variables map[string]any) (map[string]any, error) {
	payload, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("请求参数模板根节点必须是 JSON 对象")
	}

	if _, exists := payload["model"]; !exists {
		payload["model"] = cloneTemplateValue(variables["model"])
	}
	if _, exists := payload["temperature"]; !exists {
		payload["temperature"] = cloneTemplateValue(variables["temperature"])
	}
	if _, exists := payload["messages"]; !exists {
		payload["messages"] = cloneTemplateValue(variables["messages"])
	}

	return payload, nil
}

func cloneTemplateValue(value any) any {
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}

	var cloned any
	if err := json.Unmarshal(data, &cloned); err != nil {
		return value
	}

	return cloned
}

func templateValueContainsPlaceholder(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for _, child := range typed {
			if templateValueContainsPlaceholder(child) {
				return true
			}
		}
	case []any:
		for _, item := range typed {
			if templateValueContainsPlaceholder(item) {
				return true
			}
		}
	case string:
		return templatePlaceholderPattern.MatchString(typed)
	}

	return false
}

func templateValueToString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		data, err := json.Marshal(typed)
		if err != nil {
			return fmt.Sprint(typed)
		}
		return string(data)
	}
}
