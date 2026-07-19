package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAIModelSendsEnabledCustomHeaders(t *testing.T) {
	var gotAPIKey string
	var gotAuthorization string
	var gotDisabled string

	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		gotAPIKey = request.Header.Get("X-API-Key")
		gotAuthorization = request.Header.Get("Authorization")
		gotDisabled = request.Header.Get("X-Disabled")
		writeChatCompletion(t, responseWriter, "OK")
	}))
	t.Cleanup(server.Close)

	result, err := NewApp().TestAIModel(AIModelConfig{
		BaseURL: server.URL,
		APIKey:  "legacy-key",
		Model:   "test-model",
		Timeout: 5,
		Headers: []AIRequestHeader{
			{Name: "X-API-Key", Value: "custom-key", Enabled: true},
			{Name: "Authorization", Value: "Basic custom-auth", Enabled: true},
			{Name: "X-Disabled", Value: "must-not-be-sent", Enabled: false},
		},
	})
	if err != nil {
		t.Fatalf("test model: %v", err)
	}
	if result != "OK" {
		t.Fatalf("test result = %q, want OK", result)
	}
	if gotAPIKey != "custom-key" {
		t.Errorf("X-API-Key = %q, want custom-key", gotAPIKey)
	}
	if gotAuthorization != "Basic custom-auth" {
		t.Errorf("Authorization = %q, want custom override", gotAuthorization)
	}
	if gotDisabled != "" {
		t.Errorf("disabled header was sent: %q", gotDisabled)
	}
}

func TestFormatMarkdownWithAISendsCustomHeaders(t *testing.T) {
	var gotClient string
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		gotClient = request.Header.Get("X-Client")
		writeChatCompletion(t, responseWriter, "# Formatted")
	}))
	t.Cleanup(server.Close)

	result, err := NewApp().FormatMarkdownWithAI(AIFormatRequest{
		Markdown: "# Formatted",
		Model: AIModelConfig{
			BaseURL:       server.URL,
			Model:         "test-model",
			FormatTimeout: 30,
			Headers: []AIRequestHeader{
				{Name: "X-Client", Value: "markdown-viewer", Enabled: true},
			},
		},
	})
	if err != nil {
		t.Fatalf("format Markdown: %v", err)
	}
	if result != "# Formatted" {
		t.Fatalf("format result = %q, want # Formatted", result)
	}
	if gotClient != "markdown-viewer" {
		t.Errorf("X-Client = %q, want markdown-viewer", gotClient)
	}
}

func TestFormatMarkdownWithAIIncludesCustomInstruction(t *testing.T) {
	var gotPayload chatCompletionRequest
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		if err := json.NewDecoder(request.Body).Decode(&gotPayload); err != nil {
			t.Errorf("decode format request: %v", err)
		}
		writeChatCompletion(t, responseWriter, "# 标题")
	}))
	t.Cleanup(server.Close)

	_, err := NewApp().FormatMarkdownWithAI(AIFormatRequest{
		Markdown:    "# 标题",
		Instruction: "任务清单优先突出，表格保持紧凑",
		Model: AIModelConfig{
			BaseURL:       server.URL,
			Model:         "test-model",
			FormatTimeout: 30,
		},
	})
	if err != nil {
		t.Fatalf("format Markdown: %v", err)
	}
	if len(gotPayload.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(gotPayload.Messages))
	}
	if !strings.Contains(gotPayload.Messages[1].Content, "任务清单优先突出，表格保持紧凑") {
		t.Errorf("custom instruction was not included: %q", gotPayload.Messages[1].Content)
	}
	if !strings.Contains(gotPayload.Messages[0].Content, "用户的排版要求是本次任务的主要目标") {
		t.Errorf("custom instruction priority was not included: %q", gotPayload.Messages[0].Content)
	}
	if !strings.Contains(gotPayload.Messages[0].Content, "- [ ] 表示待办") {
		t.Errorf("task checklist guidance was not included: %q", gotPayload.Messages[0].Content)
	}
}

func TestFormatMarkdownWithAIUsesHTMLPromptForHTMLFormat(t *testing.T) {
	var gotPayload chatCompletionRequest
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		if err := json.NewDecoder(request.Body).Decode(&gotPayload); err != nil {
			t.Errorf("decode format request: %v", err)
		}
		writeChatCompletion(t, responseWriter, "<!doctype html><html><body><h1>标题</h1></body></html>")
	}))
	t.Cleanup(server.Close)

	_, err := NewApp().FormatMarkdownWithAI(AIFormatRequest{
		Markdown:    "<!doctype html><html><body><h1>标题</h1></body></html>",
		Instruction: "优化视觉层次",
		Format:      "html",
		Model: AIModelConfig{
			BaseURL:       server.URL,
			Model:         "test-model",
			FormatTimeout: 30,
		},
	})
	if err != nil {
		t.Fatalf("format HTML: %v", err)
	}
	if len(gotPayload.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(gotPayload.Messages))
	}
	if !strings.Contains(gotPayload.Messages[0].Content, "HTML 页面设计和排版助手") {
		t.Errorf("HTML system prompt was not used: %q", gotPayload.Messages[0].Content)
	}
	if strings.Contains(gotPayload.Messages[0].Content, "只能返回整理后的 Markdown") {
		t.Errorf("Markdown-only system prompt leaked into HTML mode: %q", gotPayload.Messages[0].Content)
	}
	if !strings.Contains(gotPayload.Messages[1].Content, "<html_input>") {
		t.Errorf("HTML input wrapper was not included: %q", gotPayload.Messages[1].Content)
	}
	if !strings.Contains(gotPayload.Messages[1].Content, "优化视觉层次") {
		t.Errorf("custom HTML instruction was not included: %q", gotPayload.Messages[1].Content)
	}
}

func TestGenerateThemeWithAIReturnsJSONAndHeaders(t *testing.T) {
	var gotClient string
	var gotPayload chatCompletionRequest
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		gotClient = request.Header.Get("X-Client")
		if err := json.NewDecoder(request.Body).Decode(&gotPayload); err != nil {
			t.Errorf("decode theme request: %v", err)
		}
		writeChatCompletion(t, responseWriter, `{
			"name":"水晶晨雾",
			"description":"清透的玻璃水晶阅读主题",
			"mode":"light",
			"style":"crystal",
			"palette":{"background":"#F7FBFF","surface":"#FFFFFF","accent":"#38BDF8"}
		}`)
	}))
	t.Cleanup(server.Close)

	result, err := NewApp().GenerateThemeWithAI(AIThemeRequest{
		Preference:   "水晶主题",
		CurrentTheme: "elegant",
		Model: AIModelConfig{
			BaseURL:       server.URL,
			Model:         "test-model",
			FormatTimeout: 30,
			Headers: []AIRequestHeader{
				{Name: "X-Client", Value: "theme-generator", Enabled: true},
			},
		},
	})
	if err != nil {
		t.Fatalf("generate theme: %v", err)
	}

	var theme map[string]any
	if err := json.Unmarshal([]byte(result), &theme); err != nil {
		t.Fatalf("theme result is not JSON: %v", err)
	}
	if theme["name"] != "水晶晨雾" {
		t.Fatalf("theme name = %q, want 水晶晨雾", theme["name"])
	}
	if gotClient != "theme-generator" {
		t.Errorf("X-Client = %q, want theme-generator", gotClient)
	}
	if len(gotPayload.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(gotPayload.Messages))
	}
	if !strings.Contains(gotPayload.Messages[1].Content, "水晶主题") {
		t.Errorf("theme preference was not included: %q", gotPayload.Messages[1].Content)
	}
	if !strings.Contains(gotPayload.Messages[0].Content, "只返回 JSON") {
		t.Errorf("theme JSON guard was not included: %q", gotPayload.Messages[0].Content)
	}
}

func TestFormatMarkdownWithAIStreamModeInjectsStreamFlagAndCollectsDeltas(t *testing.T) {
	var gotStream bool
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode stream request: %v", err)
		}
		gotStream = payload["stream"] == true

		responseWriter.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(responseWriter, "data: {\"choices\":[{\"delta\":{\"content\":\"# \"}}]}\n\n")
		_, _ = fmt.Fprint(responseWriter, "data: {\"choices\":[{\"delta\":{\"content\":\"标题\"}}]}\n\n")
		_, _ = fmt.Fprint(responseWriter, "data: [DONE]\n\n")
	}))
	t.Cleanup(server.Close)

	result, err := NewApp().FormatMarkdownWithAI(AIFormatRequest{
		Markdown: "# 标题",
		Model: AIModelConfig{
			BaseURL:       server.URL,
			Model:         "test-model",
			FormatTimeout: 30,
			ResponseMode:  "stream",
		},
	})
	if err != nil {
		t.Fatalf("format Markdown stream: %v", err)
	}
	if result != "# 标题" {
		t.Fatalf("format result = %q, want # 标题", result)
	}
	if !gotStream {
		t.Fatalf("stream flag was not injected into request payload")
	}
}

func TestAIModelRejectsMalformedCustomHeaders(t *testing.T) {
	serverCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(responseWriter http.ResponseWriter, request *http.Request) {
		serverCalled = true
		writeChatCompletion(t, responseWriter, "OK")
	}))
	t.Cleanup(server.Close)

	_, err := NewApp().TestAIModel(AIModelConfig{
		BaseURL: server.URL,
		Model:   "test-model",
		Headers: []AIRequestHeader{
			{Name: "X-API-Key", Value: "safe\r\ninjected: value", Enabled: true},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "不能包含换行符") {
		t.Fatalf("malformed header error = %v", err)
	}
	if serverCalled {
		t.Fatal("request was sent despite malformed custom header")
	}
}
