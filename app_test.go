package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
)

func writeChatCompletion(t *testing.T, responseWriter http.ResponseWriter, content string) {
	t.Helper()
	responseWriter.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(responseWriter).Encode(map[string]any{
		"choices": []map[string]any{
			{"message": map[string]string{"role": "assistant", "content": content}},
		},
	}); err != nil {
		t.Errorf("write chat completion: %v", err)
	}
}

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
	if !strings.Contains(gotPayload.Messages[0].Content, "不能导致内容增删、改写或虚构") {
		t.Errorf("system content guard was not included: %q", gotPayload.Messages[0].Content)
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

func TestFileWatchDetectsExternalChange(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "watch.md")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	changedTime := time.Now().Add(2 * time.Second)
	if err := os.WriteFile(path, []byte("after"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, changedTime, changedTime); err != nil {
		t.Fatalf("set changed time: %v", err)
	}
	changedInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat changed file: %v", err)
	}
	changedTime = changedInfo.ModTime()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastModTime.Equal(changedTime)
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect the external change")
}

func TestReadFileRestartsWatcherForNewPath(t *testing.T) {
	tempDir := t.TempDir()
	firstPath := filepath.Join(tempDir, "first.md")
	secondPath := filepath.Join(tempDir, "second.md")

	if err := os.WriteFile(firstPath, []byte("first"), 0644); err != nil {
		t.Fatalf("write first file: %v", err)
	}
	if err := os.WriteFile(secondPath, []byte("second"), 0644); err != nil {
		t.Fatalf("write second file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(firstPath); err != nil {
		t.Fatalf("watch first file: %v", err)
	}
	app.mu.Lock()
	firstGeneration := app.watchGeneration
	app.mu.Unlock()

	if _, err := app.ReadFileAndUpdateWatch(secondPath); err != nil {
		t.Fatalf("watch second file: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	app.mu.Lock()
	defer app.mu.Unlock()
	if app.filePath != secondPath {
		t.Fatalf("watching %q, want %q", app.filePath, secondPath)
	}
	if app.watchGeneration <= firstGeneration {
		t.Fatalf("watch generation did not advance: got %d, previous %d", app.watchGeneration, firstGeneration)
	}
}

func TestFileWatchDetectsSizeChangeWhenTimestampIsPreserved(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "same-time.md")
	if err := os.WriteFile(path, []byte("short"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	initialInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	if err := os.WriteFile(path, []byte("content with a different size"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, initialInfo.ModTime(), initialInfo.ModTime()); err != nil {
		t.Fatalf("restore modified time: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastFileSize != initialInfo.Size()
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect the size change")
}

func TestFileWatchDetectsContentChangeWhenSizeAndTimestampArePreserved(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "same-metadata.md")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	initialInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	initialHash := app.lastFileHash
	if err := os.WriteFile(path, []byte("after!"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, initialInfo.ModTime(), initialInfo.ModTime()); err != nil {
		t.Fatalf("restore modified time: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastFileHash != initialHash
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect same-size content change")
}

func TestBuildFileWorkspaceIncludesTextAndSkipsBinary(t *testing.T) {
	tempDir := t.TempDir()
	nestedDir := filepath.Join(tempDir, "docs", "nested")
	ignoredDir := filepath.Join(tempDir, "node_modules", "package")
	if err := os.MkdirAll(nestedDir, 0755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	if err := os.MkdirAll(ignoredDir, 0755); err != nil {
		t.Fatalf("create ignored directory: %v", err)
	}

	files := map[string][]byte{
		filepath.Join(tempDir, "docs", "readme.md"): []byte("# Readme"),
		filepath.Join(nestedDir, "config.json"):     []byte(`{"ok":true}`),
		filepath.Join(tempDir, "docs", "image.png"): {0x89, 0x50, 0x4e, 0x47, 0x00},
		filepath.Join(ignoredDir, "ignored.js"):     []byte("ignored"),
	}
	for path, content := range files {
		if err := os.WriteFile(path, content, 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	workspace, err := NewApp().BuildFileWorkspace([]string{tempDir})
	if err != nil {
		t.Fatalf("build workspace: %v", err)
	}
	if workspace.FileCount != 2 {
		t.Fatalf("file count = %d, want 2", workspace.FileCount)
	}
	if len(workspace.Roots) != 1 || !workspace.Roots[0].IsDir {
		t.Fatalf("unexpected workspace roots: %#v", workspace.Roots)
	}
	if workspaceContainsPath(workspace.Roots, filepath.Join(ignoredDir, "ignored.js")) {
		t.Fatal("ignored directory content was included")
	}
	if workspaceContainsPath(workspace.Roots, filepath.Join(tempDir, "docs", "image.png")) {
		t.Fatal("binary file was included")
	}
}

func TestReadAndWriteTextFilePreservesEncoding(t *testing.T) {
	testCases := []struct {
		name     string
		encoding string
		encode   func(string) ([]byte, error)
	}{
		{
			name:     "UTF-8 BOM",
			encoding: "utf-8-bom",
			encode: func(content string) ([]byte, error) {
				return append([]byte{0xef, 0xbb, 0xbf}, []byte(content)...), nil
			},
		},
		{
			name:     "UTF-16 LE",
			encoding: "utf-16le",
			encode: func(content string) ([]byte, error) {
				return textunicode.UTF16(textunicode.LittleEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
			},
		},
		{
			name:     "GB18030",
			encoding: "gb18030",
			encode: func(content string) ([]byte, error) {
				return simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(content))
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "document.txt")
			initialBytes, err := testCase.encode("第一行\n第二行")
			if err != nil {
				t.Fatalf("encode initial content: %v", err)
			}
			if err := os.WriteFile(path, initialBytes, 0644); err != nil {
				t.Fatalf("write initial file: %v", err)
			}

			app := NewApp()
			content, err := app.ReadFile(path)
			if err != nil {
				t.Fatalf("read text file: %v", err)
			}
			if content != "第一行\n第二行" {
				t.Fatalf("decoded content = %q", content)
			}
			if app.fileEncoding != testCase.encoding {
				t.Fatalf("encoding = %q, want %q", app.fileEncoding, testCase.encoding)
			}

			if err := app.WriteFile(path, "已修改"); err != nil {
				t.Fatalf("write text file: %v", err)
			}
			writtenBytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read written bytes: %v", err)
			}
			expectedBytes, err := testCase.encode("已修改")
			if err != nil {
				t.Fatalf("encode expected content: %v", err)
			}
			if !bytes.Equal(writtenBytes, expectedBytes) {
				t.Fatalf("written bytes did not preserve %s", testCase.name)
			}
		})
	}
}

func workspaceContainsPath(nodes []FileTreeNode, targetPath string) bool {
	for _, node := range nodes {
		if strings.EqualFold(node.Path, targetPath) || workspaceContainsPath(node.Children, targetPath) {
			return true
		}
	}
	return false
}
