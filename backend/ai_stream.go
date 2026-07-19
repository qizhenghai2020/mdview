package backend

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

type aiStreamProgress struct {
	ContentChars int
	DeltaChars   int
}

func isAIStreamResponseMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), "stream")
}

func applyAIResponseModeToRequestBody(body []byte, responseMode string) ([]byte, error) {
	if !isAIStreamResponseMode(responseMode) {
		return body, nil
	}

	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return body, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, fmt.Errorf("为流式模式设置请求参数失败: %w", err)
	}

	payload["stream"] = true
	nextBody, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("生成流式请求失败: %w", err)
	}

	return nextBody, nil
}

func readAIStreamResponse(body io.Reader, limit int64, onProgress func(aiStreamProgress)) ([]byte, error) {
	scanner := bufio.NewScanner(io.LimitReader(body, limit+1))
	maxTokenSize := int(limit)
	if maxTokenSize < 64*1024 {
		maxTokenSize = 64 * 1024
	}
	if maxTokenSize > 16*1024*1024 {
		maxTokenSize = 16 * 1024 * 1024
	}
	scanner.Buffer(make([]byte, 0, 64*1024), maxTokenSize)

	var raw bytes.Buffer
	var content strings.Builder
	contentChars := 0

	for scanner.Scan() {
		line := scanner.Text()
		raw.WriteString(line)
		raw.WriteByte('\n')
		if int64(raw.Len()) > limit {
			return nil, fmt.Errorf("模型返回内容超过限制")
		}

		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, ":") {
			continue
		}
		if !strings.HasPrefix(trimmed, "data:") {
			continue
		}

		payload := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			break
		}

		delta := extractAIStreamDelta([]byte(payload))
		if delta == "" {
			continue
		}

		content.WriteString(delta)
		deltaChars := utf8.RuneCountInString(delta)
		contentChars += deltaChars
		if onProgress != nil {
			onProgress(aiStreamProgress{
				ContentChars: contentChars,
				DeltaChars:   deltaChars,
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	if strings.TrimSpace(content.String()) != "" {
		return []byte(content.String()), nil
	}

	rawResponse := bytes.TrimSpace(raw.Bytes())
	if len(rawResponse) == 0 {
		return nil, fmt.Errorf("模型返回内容为空")
	}

	return rawResponse, nil
}

func extractAIStreamDelta(payload []byte) string {
	trimmed := strings.TrimSpace(string(payload))
	if trimmed == "" {
		return ""
	}
	if !json.Valid([]byte(trimmed)) {
		return strings.TrimSpace(stripOuterMarkdownFence(trimmed))
	}

	var root any
	if err := json.Unmarshal([]byte(trimmed), &root); err != nil {
		return ""
	}

	for _, path := range [][]any{
		{"choices", 0, "delta", "content"},
		{"choices", 0, "message", "content"},
		{"choices", 0, "text"},
		{"delta", "content"},
		{"output_text"},
		{"message", "content"},
		{"content"},
		{"data", 0, "text"},
	} {
		if text := extractAIStreamTextPayload(lookupJSONPath(root, path...)); text != "" {
			return text
		}
	}

	return ""
}

func extractAIStreamTextPayload(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case []any:
		var builder strings.Builder
		for _, item := range typed {
			builder.WriteString(extractAIStreamTextPayload(item))
		}
		return builder.String()
	case map[string]any:
		if text, ok := typed["text"].(string); ok {
			return text
		}
		if content, exists := typed["content"]; exists {
			if text := extractAIStreamTextPayload(content); text != "" {
				return text
			}
		}
		if parts, exists := typed["parts"]; exists {
			if text := extractAIStreamTextPayload(parts); text != "" {
				return text
			}
		}
		if message, exists := typed["message"]; exists {
			if text := extractAIStreamTextPayload(message); text != "" {
				return text
			}
		}
		if output, exists := typed["output"]; exists {
			if text := extractAIStreamTextPayload(output); text != "" {
				return text
			}
		}
		if outputText, ok := typed["output_text"].(string); ok {
			return outputText
		}
	}

	return ""
}
