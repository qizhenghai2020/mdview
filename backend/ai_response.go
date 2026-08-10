package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

func (a *App) executeAIRequestWithProgress(model AIModelConfig, endpoint string, body []byte, timeout int, limit int64, onProgress func(aiStreamProgress)) (aiExecutionResult, error) {
	return a.executeAIRequestWithContext(nil, model, endpoint, body, timeout, limit, onProgress)
}

func (a *App) executeAIRequestWithContext(requestContext context.Context, model AIModelConfig, endpoint string, body []byte, timeout int, limit int64, onProgress func(aiStreamProgress)) (aiExecutionResult, error) {
	model = withBuiltinDefaultAPIKey(model)
	requestBody, err := applyAIResponseModeToRequestBody(body, model.ResponseMode)
	if err != nil {
		return aiExecutionResult{
			Endpoint: endpoint,
			Method:   http.MethodPost,
		}, err
	}

	result := aiExecutionResult{
		Endpoint:    endpoint,
		Method:      http.MethodPost,
		RequestBody: string(requestBody),
	}

	if requestContext == nil {
		requestContext = a.ctx
		if requestContext == nil {
			requestContext = context.Background()
		}
	}

	httpReq, err := http.NewRequestWithContext(
		requestContext,
		http.MethodPost,
		endpoint,
		bytes.NewReader(requestBody),
	)
	if err != nil {
		return result, fmt.Errorf("创建请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(model.APIKey) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(model.APIKey))
	}
	if err := applyAIRequestHeaders(httpReq, model.Headers); err != nil {
		return result, err
	}
	result.RequestHeaders = flattenRequestHeaders(httpReq)

	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode
	result.ResponseHeaders = cloneHeaderValues(resp.Header)

	var responseBody []byte
	if isAIStreamResponseMode(model.ResponseMode) {
		responseBody, err = readAIStreamResponse(resp.Body, limit, onProgress)
	} else {
		responseBody, err = readLimitedAIResponse(resp.Body, limit)
	}
	if err != nil {
		return result, err
	}

	result.ResponseBody = responseBody
	return result, nil
}

func flattenRequestHeaders(request *http.Request) map[string]string {
	headers := make(map[string]string, len(request.Header)+1)
	if request.Host != "" {
		headers["Host"] = request.Host
	}
	for name, values := range request.Header {
		headers[name] = strings.Join(values, ", ")
	}
	return headers
}

func cloneHeaderValues(header http.Header) map[string][]string {
	headers := make(map[string][]string, len(header))
	for name, values := range header {
		nextValues := make([]string, len(values))
		copy(nextValues, values)
		headers[name] = nextValues
	}
	return headers
}

func applyAIExecutionSnapshot(result *AIModelTestResult, execution aiExecutionResult) {
	if result == nil {
		return
	}

	result.Endpoint = execution.Endpoint
	result.Method = execution.Method
	result.RequestHeaders = execution.RequestHeaders
	result.RequestBody = execution.RequestBody
	result.StatusCode = execution.StatusCode
	result.ResponseHeaders = execution.ResponseHeaders
	result.ResponseBody = strings.TrimSpace(string(execution.ResponseBody))
}

func resolveAIExecutionFailure(execution aiExecutionResult, interfaceMessage, explicitMessage, httpErrorFormat string) (string, string, error, bool) {
	if execution.StatusCode < 200 || execution.StatusCode >= 300 {
		if errorMessage := extractAIErrorMessage(execution.ResponseBody); errorMessage != "" {
			return interfaceMessage, errorMessage, fmt.Errorf("模型返回错误: %s", errorMessage), true
		}

		detail := fmt.Sprintf("HTTP %d", execution.StatusCode)
		return interfaceMessage, detail, fmt.Errorf(httpErrorFormat, execution.StatusCode), true
	}

	if errorMessage := extractAIExplicitErrorMessage(execution.ResponseBody); errorMessage != "" {
		return explicitMessage, errorMessage, fmt.Errorf("模型返回错误: %s", errorMessage), true
	}

	return "", "", nil, false
}

func extractAIExecutionContent(execution aiExecutionResult) (string, string, error) {
	return extractAIResponseContent(execution.ResponseBody)
}

func extractAIResponseContent(responseBody []byte) (string, string, error) {
	trimmedBody := strings.TrimSpace(string(responseBody))
	if trimmedBody == "" {
		return "", "", fmt.Errorf("模型返回内容为空")
	}

	if !json.Valid([]byte(trimmedBody)) {
		content := stripOuterMarkdownFence(trimmedBody)
		if strings.TrimSpace(content) == "" {
			return "", "", fmt.Errorf("模型返回内容为空")
		}
		return content, "$", nil
	}

	var root any
	if err := json.Unmarshal([]byte(trimmedBody), &root); err != nil {
		return "", "", fmt.Errorf("解析模型响应失败: %w", err)
	}

	candidates := collectAITextCandidates(root)
	if len(candidates) == 0 {
		return "", "", fmt.Errorf("模型没有返回可用内容")
	}

	sort.SliceStable(candidates, func(indexA, indexB int) bool {
		if candidates[indexA].Score == candidates[indexB].Score {
			return len(candidates[indexA].Path) < len(candidates[indexB].Path)
		}
		return candidates[indexA].Score > candidates[indexB].Score
	})

	content := stripOuterMarkdownFence(candidates[0].Text)
	if strings.TrimSpace(content) == "" {
		return "", "", fmt.Errorf("模型返回内容为空")
	}
	return content, candidates[0].Path, nil
}

func collectAITextCandidates(root any) []aiTextCandidate {
	candidates := make([]aiTextCandidate, 0, 16)
	seen := map[string]struct{}{}
	add := func(text string, path string, score int) {
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			return
		}
		key := path + "\n" + trimmed
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		candidates = append(candidates, aiTextCandidate{
			Text:  trimmed,
			Path:  path,
			Score: score,
		})
	}

	addExtractedCandidate := func(value any, path string, score int) {
		if text := extractTextPayload(value); text != "" {
			add(text, path, score)
		}
	}

	addExtractedCandidate(lookupJSONPath(root, "choices", 0, "message", "content"), "$.choices[0].message.content", 120)
	addExtractedCandidate(lookupJSONPath(root, "choices", 0, "text"), "$.choices[0].text", 118)
	addExtractedCandidate(lookupJSONPath(root, "output_text"), "$.output_text", 116)
	addExtractedCandidate(lookupJSONPath(root, "message", "content"), "$.message.content", 114)
	addExtractedCandidate(lookupJSONPath(root, "content"), "$.content", 112)
	addExtractedCandidate(lookupJSONPath(root, "data", 0, "output"), "$.data[0].output", 110)
	addExtractedCandidate(lookupJSONPath(root, "data", 0, "text"), "$.data[0].text", 108)
	addExtractedCandidate(lookupJSONPath(root, "output", 0, "content"), "$.output[0].content", 106)
	addExtractedCandidate(lookupJSONPath(root, "output", 0, "text"), "$.output[0].text", 104)
	addExtractedCandidate(lookupJSONPath(root, "candidates", 0, "content", "parts"), "$.candidates[0].content.parts", 102)

	collectRecursiveTextCandidates(root, "$", 0, add)
	return candidates
}

func lookupJSONPath(value any, segments ...any) any {
	current := value
	for _, segment := range segments {
		switch typed := segment.(type) {
		case string:
			asMap, ok := current.(map[string]any)
			if !ok {
				return nil
			}
			next, exists := asMap[typed]
			if !exists {
				return nil
			}
			current = next
		case int:
			asList, ok := current.([]any)
			if !ok || typed < 0 || typed >= len(asList) {
				return nil
			}
			current = asList[typed]
		default:
			return nil
		}
	}
	return current
}

func collectRecursiveTextCandidates(value any, path string, depth int, add func(text string, path string, score int)) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			lowerKey := strings.ToLower(strings.TrimSpace(key))
			if score, ok := preferredResponseTextScore(lowerKey); ok {
				if text := extractTextPayload(child); text != "" {
					add(text, path+"."+key, score-depth)
				}
			}
			collectRecursiveTextCandidates(child, path+"."+key, depth+1, add)
		}
	case []any:
		for index, child := range typed {
			collectRecursiveTextCandidates(child, fmt.Sprintf("%s[%d]", path, index), depth+1, add)
		}
	}
}

func preferredResponseTextScore(key string) (int, bool) {
	switch key {
	case "content":
		return 96, true
	case "text":
		return 94, true
	case "output_text":
		return 92, true
	case "output":
		return 88, true
	case "message":
		return 84, true
	case "response":
		return 82, true
	case "answer":
		return 80, true
	case "result":
		return 78, true
	case "generated_text":
		return 76, true
	default:
		return 0, false
	}
}

func extractTextPayload(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := extractTextPayload(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.TrimSpace(strings.Join(parts, "\n"))
	case map[string]any:
		if text, ok := typed["text"].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
		if content, exists := typed["content"]; exists {
			if text := extractTextPayload(content); text != "" {
				return text
			}
		}
		if parts, exists := typed["parts"]; exists {
			if text := extractTextPayload(parts); text != "" {
				return text
			}
		}
		if message, exists := typed["message"]; exists {
			if text := extractTextPayload(message); text != "" {
				return text
			}
		}
		if output, exists := typed["output"]; exists {
			if text := extractTextPayload(output); text != "" {
				return text
			}
		}
		if outputText, ok := typed["output_text"].(string); ok && strings.TrimSpace(outputText) != "" {
			return strings.TrimSpace(outputText)
		}
	}

	return ""
}

func extractAIErrorMessage(responseBody []byte) string {
	trimmedBody := strings.TrimSpace(string(responseBody))
	if trimmedBody == "" {
		return ""
	}

	if !json.Valid([]byte(trimmedBody)) {
		return trimmedBody
	}

	var root any
	if err := json.Unmarshal([]byte(trimmedBody), &root); err != nil {
		return trimmedBody
	}

	commonPaths := [][]any{
		{"error", "message"},
		{"error", "msg"},
		{"error", "detail"},
		{"message"},
		{"msg"},
		{"detail"},
		{"details"},
	}
	for _, path := range commonPaths {
		if text := extractTextPayload(lookupJSONPath(root, path...)); text != "" {
			return text
		}
	}

	var recursive string
	collectRecursiveErrorMessage(root, &recursive)
	if recursive != "" {
		return recursive
	}

	return trimmedBody
}

func extractAIExplicitErrorMessage(responseBody []byte) string {
	trimmedBody := strings.TrimSpace(string(responseBody))
	if trimmedBody == "" || !json.Valid([]byte(trimmedBody)) {
		return ""
	}

	var root any
	if err := json.Unmarshal([]byte(trimmedBody), &root); err != nil {
		return ""
	}

	for _, path := range [][]any{
		{"error", "message"},
		{"error", "msg"},
		{"error", "detail"},
		{"error_description"},
	} {
		if text := extractTextPayload(lookupJSONPath(root, path...)); text != "" {
			return text
		}
	}

	if rootMap, ok := root.(map[string]any); ok {
		if text := extractTextPayload(rootMap["error"]); text != "" {
			return text
		}
	}

	return ""
}

func collectRecursiveErrorMessage(value any, found *string) {
	if found == nil || *found != "" {
		return
	}

	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			switch strings.ToLower(strings.TrimSpace(key)) {
			case "message", "msg", "detail", "details", "error_description":
				if text := extractTextPayload(child); text != "" {
					*found = text
					return
				}
			}
			collectRecursiveErrorMessage(child, found)
			if *found != "" {
				return
			}
		}
	case []any:
		for _, child := range typed {
			collectRecursiveErrorMessage(child, found)
			if *found != "" {
				return
			}
		}
	}
}
