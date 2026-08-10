package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	wailsassetserver "github.com/wailsapp/wails/v2/pkg/assetserver"
	assetserveroptions "github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"
)

func minimalBentoHTML(jsonText string) string {
	return `<html><head><script type="application/bento+json" id="bento-doc">` + jsonText + `</script></head><body></body></html>`
}

type testPptRuntimeAssets struct{}

func (testPptRuntimeAssets) DesktopIPC() []byte       { return nil }
func (testPptRuntimeAssets) WebsocketIPC() []byte     { return nil }
func (testPptRuntimeAssets) RuntimeDesktopJS() []byte { return nil }

func mockPptStoryboardResponse(prompt string) string {
	count := 6
	if match := regexp.MustCompile(`规划恰好\s*(\d+)\s*页`).FindStringSubmatch(prompt); len(match) == 2 {
		if parsed, err := strconv.Atoi(match[1]); err == nil {
			count = parsed
		}
	}
	slides := make([]map[string]any, 0, count)
	for index := 0; index < count; index++ {
		visualType := "insight"
		if index == 0 {
			visualType = "cover"
		} else if index == count-1 {
			visualType = "action"
		}
		slides = append(slides, map[string]any{
			"title": fmt.Sprintf("测试第 %d 页", index+1), "purpose": "验证 AI 策划流程", "keyMessage": "这是可呈现的测试信息",
			"content": []string{"保留关键信息", "用结构化方式表达"}, "evidence": []string{"测试事实"},
			"visualType": visualType, "visualBrief": "用简洁结构表达页面重点", "layoutIntent": "左侧结论，右侧结构化信息", "speakerNotes": "测试备注",
		})
	}
	content, _ := json.Marshal(map[string]any{
		"title": "测试演示", "audience": "测试用户", "objective": "验证生成流程", "narrative": "从问题到行动",
		"keyFacts": []string{"测试事实"},
		"design":   map[string]any{"visualDirection": "清晰中文信息设计", "palette": []string{"#173B53", "#E65C4F"}, "layoutRhythm": []string{"结论", "结构", "行动"}},
		"slides":   slides,
	})
	return string(content)
}

func TestBentoJSONValidation(t *testing.T) {
	valid := `{"format":"bento/slides","version":1,"docId":"doc-1","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","background":"#fff","transition":"fade","notes":"","elements":[{"id":"text-1","type":"text","x":40,"y":40,"w":500,"h":100,"html":"<b>标题</b>"}]}]}`
	if _, err := extractAndValidateBentoJSON(valid); err != nil {
		t.Fatalf("valid document rejected: %v", err)
	}
	unsafe := strings.Replace(valid, `<b>标题</b>`, `<script>alert(1)</script>`, 1)
	if _, err := extractAndValidateBentoJSON(unsafe); err == nil {
		t.Fatal("unsafe document was accepted")
	}
}

func TestPptArtifactRoundTrip(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	jsonText := `{"format":"bento/slides","version":1,"docId":"doc-1","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","background":"#fff","transition":"fade","notes":"","elements":[]}]}`
	html := minimalBentoHTML(jsonText)
	if err := app.SavePptArtifact("C:/docs/readme.md", "hash-1", "readme.bento.html", html); err != nil {
		t.Fatalf("save failed: %v", err)
	}
	record, err := app.GetPptArtifact("C:/docs/readme.md")
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if record == nil || record.SourceHash != "hash-1" || record.HTML != html {
		t.Fatalf("unexpected artifact: %#v", record)
	}
}

func TestChatCompletionMessageMarshalsReferenceImagesAsMultimodalContent(t *testing.T) {
	payload, err := json.Marshal(chatCompletionRequest{
		Model: "vision-model",
		Messages: []chatCompletionMessage{
			{Role: "system", Content: "系统"},
			{Role: "user", Content: "请参考图片", ImageDataURLs: []string{"data:image/png;base64,abc"}},
		},
	})
	if err != nil {
		t.Fatalf("marshal multimodal request failed: %v", err)
	}
	var root map[string]any
	if err := json.Unmarshal(payload, &root); err != nil {
		t.Fatalf("multimodal request is invalid JSON: %v", err)
	}
	messages := root["messages"].([]any)
	if _, ok := messages[0].(map[string]any)["content"].(string); !ok {
		t.Fatal("text-only messages should keep string content")
	}
	parts, ok := messages[1].(map[string]any)["content"].([]any)
	if !ok || len(parts) != 2 {
		t.Fatalf("reference image content was not encoded as parts: %#v", messages[1])
	}
	if parts[0].(map[string]any)["type"] != "image_url" || parts[1].(map[string]any)["type"] != "text" {
		t.Fatalf("reference image parts should send images before text: %#v", parts)
	}
}

func TestReadReferenceImageDataURLsPreservesRemoteURLs(t *testing.T) {
	const remoteURL = "https://example.com/reference.png"
	got, err := readReferenceImageDataURLs([]string{remoteURL})
	if err != nil {
		t.Fatalf("remote reference URL should not be read as a local path: %v", err)
	}
	if len(got) != 1 || got[0] != remoteURL {
		t.Fatalf("remote reference URL was rewritten: %#v", got)
	}
}

func TestPptReferenceRequestMessagesUsesSingleUserMessage(t *testing.T) {
	messages := pptReferenceRequestMessages("system instructions", "analyze the image", []string{"data:image/png;base64,abc"})
	if len(messages) != 1 || messages[0].Role != "user" {
		t.Fatalf("multimodal reference requests should use one user message: %#v", messages)
	}
	if !strings.Contains(messages[0].Content, "system instructions") || !strings.Contains(messages[0].Content, "analyze the image") {
		t.Fatalf("merged reference prompt lost instructions: %#v", messages[0])
	}
	plainMessages := pptReferenceRequestMessages("system instructions", "text only", nil)
	if len(plainMessages) != 2 || plainMessages[0].Role != "system" || plainMessages[1].Role != "user" {
		t.Fatalf("text-only requests should preserve normal chat roles: %#v", plainMessages)
	}
}

func TestPrepareAIRequestMatchesRemoteVisionPayloadShape(t *testing.T) {
	const remoteURL = "https://example.com/reference.png"
	_, body, err := prepareAIRequest(AIModelConfig{BaseURL: "http://localhost:1234/v1", Model: "vision"}, aiRequestContext{
		Kind: "reference-test", ModelName: "vision", Temperature: 0.2,
		SystemPrompt: "system instructions", UserPrompt: "analyze the image",
		ReferenceImages: []string{remoteURL},
		Messages:        pptReferenceRequestMessages("system instructions", "analyze the image", []string{remoteURL}),
	})
	if err != nil {
		t.Fatalf("prepare remote vision request failed: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("prepared request is invalid JSON: %v", err)
	}
	messages, ok := payload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one multimodal user message: %#v", payload["messages"])
	}
	content, ok := messages[0].(map[string]any)["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected image and text content parts: %#v", messages[0])
	}
	imagePart := content[0].(map[string]any)
	imageURL := imagePart["image_url"].(map[string]any)["url"]
	if imagePart["type"] != "image_url" || imageURL != remoteURL || content[1].(map[string]any)["type"] != "text" {
		t.Fatalf("prepared request does not match remote vision payload shape: %#v", content)
	}
}

func writePptReferencePNG(t *testing.T) string {
	t.Helper()
	picture := image.NewNRGBA(image.Rect(0, 0, 80, 40))
	for y := 0; y < 40; y++ {
		for x := 0; x < 80; x++ {
			value := color.NRGBA{R: 16, G: 35, B: 62, A: 255}
			if x >= 54 {
				value = color.NRGBA{R: 230, G: 92, B: 79, A: 255}
			}
			picture.SetNRGBA(x, y, value)
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "reference.png")
	if err := os.WriteFile(path, encoded.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func requestHasImageURL(payload map[string]any) bool {
	messages, _ := payload["messages"].([]any)
	for _, rawMessage := range messages {
		message, _ := rawMessage.(map[string]any)
		parts, _ := message["content"].([]any)
		for _, rawPart := range parts {
			part, _ := rawPart.(map[string]any)
			if part["type"] == "image_url" {
				return true
			}
		}
	}
	return false
}

func lastRequestText(payload map[string]any) string {
	messages, _ := payload["messages"].([]any)
	for index := len(messages) - 1; index >= 0; index-- {
		message, _ := messages[index].(map[string]any)
		if content, ok := message["content"].(string); ok {
			return content
		}
		parts, _ := message["content"].([]any)
		var text strings.Builder
		for _, rawPart := range parts {
			part, _ := rawPart.(map[string]any)
			if part["type"] == "text" {
				text.WriteString(fmt.Sprint(part["text"]))
			}
		}
		if text.Len() > 0 {
			return text.String()
		}
	}
	return ""
}

func TestAnalyzePptReferencesLocallyExtractsStyleSignals(t *testing.T) {
	spec, encoded, err := analyzePptReferencesLocally([]string{writePptReferencePNG(t)})
	if err != nil {
		t.Fatalf("local reference analysis failed: %v", err)
	}
	if len(spec.Palette) == 0 || !strings.Contains(encoded, "palette") {
		t.Fatalf("local analysis did not produce a palette: %#v", spec)
	}
	if !strings.Contains(spec.BackgroundStrategy, "深色") {
		t.Fatalf("dark reference was not reflected in background strategy: %s", spec.BackgroundStrategy)
	}
}

func TestNormalizePptReferenceSpecAcceptsSingleStringLists(t *testing.T) {
	spec, err := normalizePptReferenceSpec(`{
		"visualDirection":"克制的信息设计",
		"palette":"#123456, #ABCDEF",
		"backgroundStrategy":"浅色背景",
		"typography":"无衬线字体",
		"cardTreatment":"低圆角卡片",
		"imageTreatment":"图文并置",
		"layoutRhythm":"封面保留留白；内容页使用稳定栅格",
		"contentSignals":"清晰标题层级",
		"avoid":"不复制品牌文字"
	}`)
	if err != nil {
		t.Fatalf("single-string reference spec should be accepted: %v", err)
	}
	if got, want := spec.Palette, []string{"#123456", "#ABCDEF"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("palette = %#v, want %#v", got, want)
	}
	if got, want := spec.LayoutRhythm, []string{"封面保留留白", "内容页使用稳定栅格"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("layout rhythm = %#v, want %#v", got, want)
	}
	if got := spec.ContentSignals; len(got) != 1 || got[0] != "清晰标题层级" {
		t.Fatalf("content signals were not preserved: %#v", got)
	}
	if got := spec.Avoid; len(got) != 1 || got[0] != "不复制品牌文字" {
		t.Fatalf("avoid values were not preserved: %#v", got)
	}
}

func TestPptReferenceDiagnosticsLogPayloadShape(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	shape := pptReferencePayloadShape(`{"palette":["#123456"],"layoutRhythm":"封面留白","contentSignals":[],"avoid":[]}`)
	if !strings.Contains(shape, "layoutRhythm=string") {
		t.Fatalf("payload shape did not identify the string layout rhythm: %s", shape)
	}
	app.appendPptDiagnostic("reference-analysis job=test-job response %s", shape)
	content, err := os.ReadFile(filepath.Join(app.pptArtifactDir, pptDiagnosticLogName))
	if err != nil {
		t.Fatalf("diagnostic log was not written: %v", err)
	}
	if !strings.Contains(string(content), pptDiagnosticBuildID) || !strings.Contains(string(content), "layoutRhythm=string") {
		t.Fatalf("diagnostic log did not contain the expected markers: %s", content)
	}
}

func TestUnsupportedPptImageMessageErrorDetection(t *testing.T) {
	unsupported := fmt.Errorf("Failed to deserialize the JSON body into the target type: messages[1]: unknown variant `image_url`, expected `text`")
	if !isUnsupportedPptImageMessageError(unsupported) {
		t.Fatal("known image_url compatibility error was not detected")
	}
	dataURLUnsupported := fmt.Errorf("Invalid image URL: data:image/png;base64,...; only HTTPS image URLs are supported")
	if !isUnsupportedPptImageMessageError(dataURLUnsupported) {
		t.Fatal("known data URL compatibility error was not detected")
	}
	if isUnsupportedPptImageMessageError(fmt.Errorf("模型返回超时")) {
		t.Fatal("unrelated error was incorrectly classified as image compatibility failure")
	}
}

func TestPptPlanningFallsBackWhenImageMessagesAreRejected(t *testing.T) {
	var imageRequestCount atomic.Int32
	var textRequestCount atomic.Int32
	var retryPrompt string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		if requestHasImageURL(payload) {
			imageRequestCount.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]any{"message": "Failed to deserialize the JSON body into the target type: messages[1]: unknown variant `image_url`, expected `text`"}})
			return
		}
		textRequestCount.Add(1)
		retryPrompt = lastRequestText(payload)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": mockPptStoryboardResponse(retryPrompt)}}},
		})
	}))
	defer server.Close()

	request := AIPresentationGenerationRequest{
		Markdown:   "# 参考图测试\n\n第一页内容\n\n## 第二页\n\n第二页内容",
		SourcePath: "C:/docs/reference.md", SourceHash: "reference-hash", FileName: "reference.md",
		Density: "standard", TargetSlides: 2, BatchSize: 2,
		ReferenceImages: []string{writePptReferencePNG(t)}, ReferenceMode: "smart", ReferenceUsage: "style", ReferenceStrength: "balanced",
		Model: AIModelConfig{BaseURL: server.URL, Model: "mock", FormatTimeout: 60},
	}
	plans, err := buildPptSlidePlansWithTarget(request.Markdown, request.Density, request.FileName, request.TargetSlides)
	if err != nil {
		t.Fatal(err)
	}
	runtime := &pptGenerationRuntime{
		record:  createPptGenerationRecord(request, plans),
		request: request,
		plans:   plans,
	}
	app := &App{pptArtifactDir: t.TempDir()}
	if err := app.planPptStory(context.Background(), runtime); err != nil {
		t.Fatalf("planning did not recover from image compatibility failure: %v", err)
	}
	snapshot := runtime.snapshot()
	if !snapshot.ReferenceFallback || snapshot.ReferenceSpecJSON == "" {
		t.Fatalf("local reference fallback was not persisted: %#v", snapshot)
	}
	if imageRequestCount.Load() != 1 || textRequestCount.Load() != 1 {
		t.Fatalf("unexpected fallback request counts: image=%d text=%d", imageRequestCount.Load(), textRequestCount.Load())
	}
	if !strings.Contains(retryPrompt, "本地提取") {
		t.Fatalf("fallback planning prompt did not include local reference hints: %s", retryPrompt)
	}
}

func TestSlideRegenerationUsesLocalReferenceStyleOnly(t *testing.T) {
	var imageRequestCount atomic.Int32
	var textRequestCount atomic.Int32
	var receivedPrompt string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		if requestHasImageURL(payload) {
			imageRequestCount.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]any{"message": "unknown variant `image_url`, expected `text`"}})
			return
		}
		textRequestCount.Add(1)
		receivedPrompt = lastRequestText(payload)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": `{"id":"wrong-id","background":"#fff","transition":"fade","notes":"参考图里的备注","elements":[{"id":"title","type":"text","x":80,"y":80,"w":760,"h":90,"rotation":0,"opacity":1,"html":"<b>参考图独有标题</b>"}]}`}}},
		})
	}))
	defer server.Close()

	app := &App{}
	response, err := app.RegeneratePresentationSlideWithAI(AIPresentationSlideRequest{
		Slide: map[string]any{"id": "slide-original", "background": "#fff", "transition": "fade", "notes": "原始备注", "elements": []any{
			map[string]any{"id": "source-title", "type": "text", "x": 80.0, "y": 80.0, "w": 760.0, "h": 90.0, "rotation": 0.0, "opacity": 1.0, "html": "<b>当前文档标题</b>"},
		}},
		Context:         map[string]any{"size": map[string]any{"width": 1280.0, "height": 720.0}},
		ReferenceImages: []string{writePptReferencePNG(t)},
		Model:           AIModelConfig{BaseURL: server.URL, Model: "mock", FormatTimeout: 60},
	})
	if err != nil {
		t.Fatalf("slide regeneration did not recover from image compatibility failure: %v", err)
	}
	if !strings.Contains(response, `"id":"slide-original"`) {
		t.Fatalf("regenerated slide did not preserve its id: %s", response)
	}
	if imageRequestCount.Load() != 0 || textRequestCount.Load() != 1 {
		t.Fatalf("reference image should not be sent to the model: image=%d text=%d", imageRequestCount.Load(), textRequestCount.Load())
	}
	if !strings.Contains(receivedPrompt, "当前幻灯片 JSON 与页面上下文是本页主题") || !strings.Contains(receivedPrompt, "本地提取的无文字视觉摘要") {
		t.Fatalf("style-only source constraints were missing from request: %s", receivedPrompt)
	}
	if !strings.Contains(receivedPrompt, "本页已开启内容锁定") || !strings.Contains(receivedPrompt, "[[PPT_TEXT_001]]") {
		t.Fatalf("content lock was missing from request: %s", receivedPrompt)
	}
	if !strings.Contains(response, "当前文档标题") || strings.Contains(response, "参考图独有标题") || strings.Contains(response, "参考图里的备注") {
		t.Fatalf("reference content was not removed from regenerated slide: %s", response)
	}
}

func TestListImageFilesRecursivelyFiltersAndSorts(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		filepath.Join(root, "zeta.JPG"),
		filepath.Join(root, "alpha.png"),
		filepath.Join(nested, "middle.jpeg"),
		filepath.Join(root, "ignore.txt"),
	} {
		if err := os.WriteFile(path, []byte("test"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	paths := (&App{}).ListImageFiles(root)
	if len(paths) != 3 {
		t.Fatalf("got %d image files, want 3: %#v", len(paths), paths)
	}
	if filepath.Base(paths[0]) != "alpha.png" || filepath.Base(paths[1]) != "middle.jpeg" || filepath.Base(paths[2]) != "zeta.JPG" {
		t.Fatalf("image files were not sorted: %#v", paths)
	}
}

func TestNormalizePptGenerationReferenceSettings(t *testing.T) {
	req, err := normalizePptGenerationRequest(AIPresentationGenerationRequest{
		Markdown:          "# 参考图测试\n\n内容",
		SourcePath:        "C:/docs/reference.md",
		SourceHash:        "hash",
		FileName:          "reference.md",
		ReferenceImages:   []string{"a.png", "a.png", "b.jpg"},
		ReferenceMode:     "invalid",
		ReferenceUsage:    "content",
		ReferenceStrength: "strong",
		Model:             AIModelConfig{BaseURL: "http://localhost:1234/v1", Model: "vision"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(req.ReferenceImages) != 2 || req.ReferenceMode != "smart" || req.ReferenceUsage != "content" || req.ReferenceStrength != "strong" {
		t.Fatalf("reference settings were not normalized: %#v", req)
	}
}

func TestPptDirectReferenceImagesOnlyUsesDirectMode(t *testing.T) {
	runtime := &pptGenerationRuntime{request: AIPresentationGenerationRequest{
		ReferenceImages: []string{"first.png", "second.jpg"},
		ReferenceMode:   "smart",
	}}
	if got := pptDirectReferenceImages(runtime); len(got) != 0 {
		t.Fatalf("smart analysis mode should not resend reference images: %#v", got)
	}
	runtime.request.ReferenceMode = "direct"
	got := pptDirectReferenceImages(runtime)
	if len(got) != 2 || got[0] != "first.png" || got[1] != "second.jpg" {
		t.Fatalf("direct mode should forward reference images: %#v", got)
	}
	got[0] = "changed.png"
	if runtime.request.ReferenceImages[0] != "first.png" {
		t.Fatalf("direct reference image list should be copied before use: %#v", runtime.request.ReferenceImages)
	}
}

func TestPptReferenceUsageGuidanceDifferentiatesModes(t *testing.T) {
	content := pptReferenceUsageGuidance("content", "balanced")
	if !strings.Contains(content, "保持文档自身的视觉风格") || !strings.Contains(content, "平衡参考") {
		t.Fatalf("content guidance is incomplete: %s", content)
	}
	style := pptReferenceUsageGuidance("style", "subtle")
	if !strings.Contains(style, "仅借鉴色彩") || !strings.Contains(style, "弱参考") {
		t.Fatalf("style guidance is incomplete: %s", style)
	}
	strong := pptReferenceUsageGuidance("style-content", "strong")
	if !strings.Contains(strong, "同时借鉴") || !strings.Contains(strong, "强参考") {
		t.Fatalf("strong guidance is incomplete: %s", strong)
	}
}

func TestMergePptReferenceDesignHonorsUsageAndStrength(t *testing.T) {
	base := pptDesignSpec{
		VisualDirection:    "原有视觉方向",
		Palette:            []string{"#123456", "#D24A3D", "#2E8D82"},
		BackgroundStrategy: "原有浅色背景",
		Typography:         "原有字体规则",
		CardTreatment:      "原有卡片规则",
		ImageTreatment:     "原有图片规则",
		LayoutRhythm:       []string{"原有节奏"},
	}
	referenceJSON := `{"visualDirection":"深色杂志风格","palette":["#101820","#F2AA4C","#E63946"],"backgroundStrategy":"深色背景","typography":"衬线标题","cardTreatment":"直角卡片","imageTreatment":"横向主视觉","layoutRhythm":["参考节奏"]}`

	subtle := mergePptReferenceDesign(base, referenceJSON, AIPresentationGenerationRequest{ReferenceUsage: "style", ReferenceStrength: "subtle"})
	if subtle.BackgroundStrategy != base.BackgroundStrategy || subtle.Typography != base.Typography {
		t.Fatalf("subtle reference should preserve base visual rules: %#v", subtle)
	}
	if len(subtle.Palette) < 2 || subtle.Palette[0] != base.Palette[0] || subtle.Palette[1] != "#101820" {
		t.Fatalf("subtle reference should only introduce one reference accent: %#v", subtle.Palette)
	}

	balanced := mergePptReferenceDesign(base, referenceJSON, AIPresentationGenerationRequest{ReferenceUsage: "style", ReferenceStrength: "balanced"})
	if balanced.BackgroundStrategy != "深色背景" || balanced.Typography != "衬线标题" || balanced.Palette[0] != "#101820" {
		t.Fatalf("balanced reference did not apply the visual system: %#v", balanced)
	}

	strong := mergePptReferenceDesign(base, referenceJSON, AIPresentationGenerationRequest{ReferenceUsage: "content", ReferenceStrength: "strong"})
	if strong.VisualDirection != "深色杂志风格" || len(strong.LayoutRhythm) != 1 || strong.LayoutRhythm[0] != "参考节奏" {
		t.Fatalf("strong reference should replace the visual direction and layout rhythm: %#v", strong)
	}

	contentOnly := mergePptReferenceDesign(base, referenceJSON, AIPresentationGenerationRequest{ReferenceUsage: "content", ReferenceStrength: "balanced"})
	if contentOnly.BackgroundStrategy != base.BackgroundStrategy || contentOnly.Palette[0] != base.Palette[0] {
		t.Fatalf("content-only reference should preserve the existing visual system: %#v", contentOnly)
	}
}

func TestPptArtifactAssetHandlerServesSavedDeck(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	sourcePath := "C:/docs/presentation.md"
	html := minimalBentoHTML(`{"format":"bento/slides","version":1,"docId":"doc-route","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","background":"#fff","transition":"fade","notes":"","elements":[]}]}`)
	if err := app.SavePptArtifact(sourcePath, "hash-route", "presentation.bento.html", html); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	url, err := app.GetPptArtifactEditorURL(sourcePath, 0)
	if err != nil {
		t.Fatalf("editor URL failed: %v", err)
	}
	if !strings.HasPrefix(url, pptEditorAssetPrefix) || !strings.Contains(url, "volume=0") {
		t.Fatalf("unexpected editor URL: %s", url)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, url, nil)
	PptArtifactAssetHandler(app).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if recorder.Header().Get("Cache-Control") != "no-store, max-age=0" {
		t.Fatalf("unexpected cache control: %q", recorder.Header().Get("Cache-Control"))
	}
	if recorder.Body.String() != html {
		t.Fatal("served PPT content differs from saved artifact")
	}

	invalidVolume := httptest.NewRecorder()
	PptArtifactAssetHandler(app).ServeHTTP(invalidVolume, httptest.NewRequest(http.MethodGet, strings.Replace(url, "volume=0", "volume=20", 1), nil))
	if invalidVolume.Code != http.StatusBadRequest {
		t.Fatalf("invalid volume status = %d, want %d", invalidVolume.Code, http.StatusBadRequest)
	}

	if _, err := app.GetPptArtifactEditorURL(sourcePath, 20); err == nil {
		t.Fatal("invalid volume should not return an editor URL")
	}
}

func TestPptArtifactAssetHandlerRepairsLegacyRuntime(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	sourcePath := "C:/docs/legacy-runtime.md"
	html := minimalBentoHTML(`{"format":"bento/slides","version":1,"docId":"doc-legacy-runtime","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","background":"#fff","transition":"fade","notes":"","elements":[]}]}`)
	html = strings.Replace(html, "</head>", `<script id="md-ppt-editor-runtime">function waitForBridge() {} window.setTimeout(waitForBridge, 25);</script></head>`, 1)
	if err := app.SavePptArtifact(sourcePath, "hash-legacy-runtime", "legacy-runtime.bento.html", html); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	url, err := app.GetPptArtifactEditorURL(sourcePath, 0)
	if err != nil {
		t.Fatalf("editor URL failed: %v", err)
	}
	recorder := httptest.NewRecorder()
	PptArtifactAssetHandler(app).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, url, nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "waitForBridge") || strings.Contains(recorder.Body.String(), "md-ppt-editor-runtime") {
		t.Fatal("legacy runtime was not removed from served artifact")
	}
	if !strings.Contains(recorder.Body.String(), "doc-legacy-runtime") {
		t.Fatal("Bento document was removed with the legacy runtime")
	}
}

func TestWailsAssetServerFallsBackToPptArtifactHandler(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	sourcePath := "C:/docs/wails-route.md"
	html := minimalBentoHTML(`{"format":"bento/slides","version":1,"docId":"doc-wails-route","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","background":"#fff","transition":"fade","notes":"","elements":[]}]}`)
	if err := app.SavePptArtifact(sourcePath, "hash-wails-route", "wails-route.bento.html", html); err != nil {
		t.Fatalf("save failed: %v", err)
	}
	url, err := app.GetPptArtifactEditorURL(sourcePath, 0)
	if err != nil {
		t.Fatalf("editor URL failed: %v", err)
	}

	handler, err := wailsassetserver.NewAssetHandler(assetserveroptions.Options{
		Assets: fstest.MapFS{
			"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>app</body></html>")},
		},
		Handler: PptArtifactAssetHandler(app),
	}, nil)
	if err != nil {
		t.Fatalf("create Wails asset handler failed: %v", err)
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, url, nil))
	if recorder.Code != http.StatusOK || recorder.Body.String() != html {
		t.Fatalf("Wails asset fallback failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	server, err := wailsassetserver.NewAssetServerWithHandler(handler, "", false, nil, testPptRuntimeAssets{})
	if err != nil {
		t.Fatalf("create Wails asset server failed: %v", err)
	}
	recorder = httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, url, nil))
	if recorder.Code != http.StatusOK || recorder.Body.String() != html {
		t.Fatalf("Wails asset server rewrote PPT content: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestNormalizePresentationVersion(t *testing.T) {
	base := `{"format":"bento/slides","version":%s,"title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","elements":[]}]}`
	for _, version := range []string{`1`, `"1"`, `"1.0"`} {
		normalized, err := normalizePresentationResponse(fmt.Sprintf(base, version))
		if err != nil {
			t.Fatalf("version %s rejected: %v", version, err)
		}
		var root map[string]any
		if err := json.Unmarshal([]byte(normalized), &root); err != nil || root["version"] != float64(1) {
			t.Fatalf("version %s was not normalized: %s", version, normalized)
		}
	}
	withoutVersion := `{"format":"bento/slides","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","elements":[]}]}`
	if _, err := normalizePresentationResponse(withoutVersion); err != nil {
		t.Fatalf("missing version should be repaired: %v", err)
	}
	if _, err := normalizePresentationResponse(fmt.Sprintf(base, `2`)); err == nil {
		t.Fatal("version 2 should not be silently downgraded")
	}
}

func TestNormalizePresentationSlideResponse(t *testing.T) {
	raw := `{"id":"ai-slide","background":"#fff","transition":"fade","notes":"","elements":[{"id":"shape-1","type":"shape","shape":"circle","x":20,"y":20,"w":100,"h":100},{"id":"text-1","type":"text","x":40,"y":40,"w":500,"h":100,"html":"<b>新的页面</b>"}]}`
	normalized, err := normalizePresentationSlideResponse(raw, "slide-original", 1280, 720)
	if err != nil {
		t.Fatalf("valid slide rejected: %v", err)
	}
	var slide map[string]any
	if err := json.Unmarshal([]byte(normalized), &slide); err != nil {
		t.Fatalf("normalized slide is invalid JSON: %v", err)
	}
	if slide["id"] != "slide-original" {
		t.Fatalf("original slide id was not preserved: %#v", slide["id"])
	}
	elements := slide["elements"].([]any)
	if elements[0].(map[string]any)["shape"] != "ellipse" {
		t.Fatalf("shape alias was not normalized: %#v", elements[0])
	}

	unsafe := strings.Replace(raw, "<b>新的页面</b>", "<script>alert(1)</script>", 1)
	if _, err := normalizePresentationSlideResponse(unsafe, "slide-original", 1280, 720); err == nil {
		t.Fatal("unsafe slide was accepted")
	}
}

func TestBuildPptSlidePlansAndVolumes(t *testing.T) {
	var markdown strings.Builder
	markdown.WriteString("# 长文档\n\n摘要。\n")
	for index := 0; index < 65; index++ {
		markdown.WriteString(fmt.Sprintf("\n## 章节 %d\n\n这是章节 %d 的正文。\n", index+1, index+1))
	}
	plans, err := buildPptSlidePlans(markdown.String(), "standard", "long.md")
	if err != nil {
		t.Fatal(err)
	}
	if len(plans) < 66 {
		t.Fatalf("expected cover plus section slides, got %d", len(plans))
	}
	if plans[0].ID != "slide-0001" || plans[50].VolumeIndex != 1 {
		t.Fatalf("unexpected deterministic plan: first=%#v slide51=%#v", plans[0], plans[50])
	}
	batches := buildPptBatches(plans, 3)
	for _, batch := range batches {
		for _, slide := range batch.Slides {
			if slide.VolumeIndex != batch.VolumeIndex {
				t.Fatal("batch crossed a volume boundary")
			}
		}
	}
}

func TestBuildPptSlidePlansWithTarget(t *testing.T) {
	markdown := "# 自定义页数\n\n" + strings.Repeat("这是用于验证自定义拆页的正文内容。\n\n", 120)
	plans, err := buildPptSlidePlansWithTarget(markdown, "standard", "target.md", 12)
	if err != nil {
		t.Fatal(err)
	}
	if len(plans) != 12 || plans[0].ID != "slide-0001" || plans[11].ID != "slide-0012" {
		t.Fatalf("custom page count was not respected: %d plans", len(plans))
	}
	if _, err := buildPptSlidePlansWithTarget("# 太短\n\n正文", "standard", "short.md", 500); err == nil {
		t.Fatal("insufficient content should not create hundreds of empty slides")
	}
}

func TestNormalizePptStoryPlanUsesExactPageCountAndRemovesResidue(t *testing.T) {
	input := `{
		"title":"项目总结",
		"audience":"管理团队",
		"objective":"形成行动结论",
		"narrative":"从问题到行动",
		"design":{"visualDirection":"信息设计","palette":["#173B53"]},
		"slides":[
			{"title":"封面","purpose":"建立主题","keyMessage":"项目总结","content":[],"visualType":"cover","visualBrief":"标题构图","layoutIntent":"左侧标题"},
			{"title":"下一步","purpose":"收束","keyMessage":"明确行动","content":["保留关键结论","Source of truth: C:\\work\\notes.md"],"evidence":["TODO"],"visualType":"action","visualBrief":"行动优先级","layoutIntent":"行动列表"}
		]
	}`
	story, err := normalizePptStoryPlan(input, AIPresentationGenerationRequest{Markdown: "# 项目总结", FileName: "项目.md"}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(story.Slides) != 2 || story.Slides[0].ID != "slide-0001" || story.Slides[1].ID != "slide-0002" {
		t.Fatalf("unexpected normalized slides: %#v", story.Slides)
	}
	if story.Slides[0].VisualType != "cover" || story.Slides[1].VisualType != "action" {
		t.Fatalf("cover/action invariant lost: %#v", story.Slides)
	}
	if strings.Contains(strings.Join(story.Slides[1].Content, " "), "Source of truth") || len(story.Slides[1].Evidence) != 0 {
		t.Fatalf("engineering residue was not removed: %#v", story.Slides[1])
	}
}

func TestValidatePptBatchQualityRejectsTextDumpAndEngineeringResidue(t *testing.T) {
	plans := []pptSlidePlan{{ID: "slide-0001", Index: 0, VisualType: "insight"}}
	longText := strings.Repeat("过长正文", 100)
	slides := []map[string]any{{
		"elements": []any{map[string]any{"type": "text", "html": longText, "w": 1000, "h": 620}},
	}}
	if err := validatePptBatchQuality(slides, plans); err == nil {
		t.Fatal("long text dump should be rejected")
	}
	slides[0]["elements"] = []any{map[string]any{"type": "text", "html": "Source of truth: C:\\project\\notes.md", "w": 500, "h": 100}}
	if err := validatePptBatchQuality(slides, plans); err == nil {
		t.Fatal("engineering residue should be rejected")
	}
}

func TestPptLayoutCompilerCreatesBoundedVisualTemplates(t *testing.T) {
	visualTypes := []string{"cover", "section", "kpi", "comparison", "timeline", "process", "architecture", "matrix", "chart", "table", "insight", "action"}
	plans := make([]pptSlidePlan, 0, len(visualTypes))
	drafts := make([]pptSlideContentDraft, 0, len(visualTypes))
	for index, visualType := range visualTypes {
		plans = append(plans, pptSlidePlan{
			ID: fmt.Sprintf("slide-%04d", index+1), Index: index, Title: fmt.Sprintf("第 %d 页主题", index+1),
			Purpose: "验证模板版式", KeyMessage: "用结构化信息表达关键判断", VisualType: visualType,
			Content:  []string{"明确当前重点", "梳理关键条件", "形成下一步行动"},
			Evidence: []string{"覆盖率达到 32%", "处理周期缩短 18%", "计划分三阶段推进"},
		})
		drafts = append(drafts, pptSlideContentDraft{
			ID: fmt.Sprintf("slide-%04d", index+1), Headline: "用结构化信息表达关键判断", SupportingText: "先聚焦事实，再形成可执行的结论。",
			Items: []string{"明确当前重点", "梳理关键条件", "形成下一步行动"},
			VisualItems: []pptVisualItem{
				{Label: "覆盖范围", Value: "32%", Detail: "当前已完成覆盖"},
				{Label: "处理周期", Value: "18%", Detail: "相较此前缩短"},
				{Label: "推进阶段", Value: "3", Detail: "按阶段逐步落地"},
			},
		})
	}

	slides, err := compilePptBatch(plans, drafts, `{"palette":["#173B53","#E65C4F","#2C8C7C","#E8B84A"]}`)
	if err != nil {
		t.Fatal(err)
	}
	if err := validatePptBatchQuality(slides, plans); err != nil {
		t.Fatalf("compiled templates did not pass quality gate: %v", err)
	}
	if len(slides) != len(plans) {
		t.Fatalf("compiled %d slides, want %d", len(slides), len(plans))
	}

	seenChart, seenTable := false, false
	for index, slide := range slides {
		elements, ok := slide["elements"].([]any)
		if !ok || len(elements) == 0 {
			t.Fatalf("slide %d has no elements: %#v", index+1, slide)
		}
		for _, raw := range elements {
			element := raw.(map[string]any)
			x, y := element["x"].(float64), element["y"].(float64)
			w, h := element["w"].(float64), element["h"].(float64)
			if x < 0 || y < 0 || x+w > 1280 || y+h > 720 {
				t.Fatalf("slide %d contains an out-of-bounds element: %#v", index+1, element)
			}
			seenChart = seenChart || element["type"] == "chart"
			seenTable = seenTable || element["type"] == "table"
		}
	}
	if !seenChart || !seenTable {
		t.Fatalf("expected chart and table templates, chart=%t table=%t", seenChart, seenTable)
	}
}

func TestPptLayoutCompilerAppliesReferenceDesign(t *testing.T) {
	const darkCanvas = "#17283A"
	designJSON := `{
		"palette":["#17283A","#F16D5B","#4EA89B","#E0B858"],
		"backgroundStrategy":"dark canvas",
		"typography":"editorial serif",
		"cardTreatment":"flat hard edge",
		"motionStrategy":"none"
	}`
	visualTypes := []string{"cover", "section", "architecture", "action", "table"}
	plans := make([]pptSlidePlan, 0, len(visualTypes))
	drafts := make([]pptSlideContentDraft, 0, len(visualTypes))
	for index, visualType := range visualTypes {
		plans = append(plans, pptSlidePlan{
			ID: fmt.Sprintf("reference-%02d", index+1), Index: index, Title: "Reference design", Purpose: "Verify reference design", KeyMessage: "Reference choices affect compiled slides", VisualType: visualType,
			Content: []string{"Primary point", "Supporting evidence", "Recommended action"},
		})
		drafts = append(drafts, pptSlideContentDraft{
			ID: fmt.Sprintf("reference-%02d", index+1), Headline: "Reference choices affect compiled slides", SupportingText: "Dark surfaces, editorial typography, and sharp cards stay consistent.",
			Items: []string{"Primary point", "Supporting evidence", "Recommended action"},
			VisualItems: []pptVisualItem{
				{Label: "Primary point", Value: "42%", Detail: "A concise supporting detail"},
				{Label: "Supporting evidence", Value: "18%", Detail: "A second concise detail"},
				{Label: "Recommended action", Value: "3", Detail: "A final concise detail"},
			},
		})
	}

	palette := pptLayoutPaletteFromDesign(designJSON)
	if palette.Solid != darkCanvas || palette.Ink == darkCanvas || palette.Motion != "none" {
		t.Fatalf("unexpected dark reference palette: %#v", palette)
	}

	slides, err := compilePptBatch(plans, drafts, designJSON)
	if err != nil {
		t.Fatal(err)
	}
	if err := validatePptBatchQuality(slides, plans); err != nil {
		t.Fatalf("reference design output did not pass quality gate: %v", err)
	}

	elementFor := func(slide map[string]any, role string) map[string]any {
		t.Helper()
		elements, ok := slide["elements"].([]any)
		if !ok {
			t.Fatalf("slide has no elements: %#v", slide)
		}
		marker := "-" + role + "-"
		for _, raw := range elements {
			element, ok := raw.(map[string]any)
			if ok && strings.Contains(element["id"].(string), marker) {
				return element
			}
		}
		t.Fatalf("missing %s element: %#v", role, elements)
		return nil
	}

	for _, index := range []int{0, 1} {
		if got := slides[index]["background"]; got != darkCanvas {
			t.Fatalf("slide %d background = %v, want %s", index+1, got, darkCanvas)
		}
	}
	if got := elementFor(slides[2], "architecture-core")["fill"]; got != darkCanvas {
		t.Fatalf("architecture core fill = %v, want %s", got, darkCanvas)
	}
	if got := elementFor(slides[3], "action-anchor")["fill"]; got != darkCanvas {
		t.Fatalf("action anchor fill = %v, want %s", got, darkCanvas)
	}
	tableStyle := elementFor(slides[4], "table")["style"].(map[string]any)
	if got := tableStyle["headerBg"]; got != darkCanvas {
		t.Fatalf("table header background = %v, want %s", got, darkCanvas)
	}
	if got := tableStyle["radius"].(float64); got >= 10 {
		t.Fatalf("table radius = %v, want a sharp reference treatment", got)
	}

	coverTitle := elementFor(slides[0], "cover-title")
	if got := coverTitle["fontFamily"].(string); !strings.Contains(got, "Noto Serif SC") {
		t.Fatalf("cover font family = %q, want editorial serif", got)
	}
	if got := elementFor(slides[2], "architecture-layer")["radius"].(float64); got >= 14 {
		t.Fatalf("architecture layer radius = %v, want a sharp reference treatment", got)
	}
	for slideIndex, slide := range slides {
		for _, raw := range slide["elements"].([]any) {
			if _, ok := raw.(map[string]any)["fx"]; ok {
				t.Fatalf("slide %d contains animation despite motionStrategy=none: %#v", slideIndex+1, raw)
			}
		}
	}
}

func TestNormalizePptDeckBlueprintKeepsLargeDeckWithinPlannerLimits(t *testing.T) {
	input := `{
		"title":"大型项目复盘","audience":"管理团队","objective":"形成行动方案","narrative":"从现状到行动",
		"design":{"palette":["#173B53","#E65C4F"]},
		"chapters":[
			{"title":"现状","purpose":"建立共识","focus":"关键现状和问题","slideCount":24},
			{"title":"分析","purpose":"解释原因","focus":"关键原因与选择","slideCount":24},
			{"title":"行动","purpose":"形成下一步","focus":"立即行动","slideCount":2}
		]
	}`
	blueprint, err := normalizePptDeckBlueprint(input, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(blueprint.Chapters) != 3 || blueprint.Chapters[2].SlideCount != 2 {
		t.Fatalf("unexpected blueprint: %#v", blueprint)
	}
	theme := presentationThemeFromDesign(blueprint.Design)
	if theme["color"] != "#173B53" || theme["accent"] != "#E65C4F" {
		t.Fatalf("AI design palette was not reflected in Bento theme: %#v", theme)
	}
}

func TestNormalizePresentationBatch(t *testing.T) {
	plans := []pptSlidePlan{{ID: "slide-0001", Index: 0, Title: "封面"}}
	raw := `{"slides":[{"id":"wrong","transition":"unknown","elements":[{"type":"text","html":"标题","x":"80","y":100,"w":600,"h":120}]}]}`
	slides, err := normalizePresentationBatch(raw, plans)
	if err != nil {
		t.Fatal(err)
	}
	if slides[0]["id"] != "slide-0001" || slides[0]["transition"] != "fade" {
		t.Fatalf("slide was not normalized: %#v", slides[0])
	}
	elements := slides[0]["elements"].([]any)
	element := elements[0].(map[string]any)
	if element["id"] != "slide-0001-el-001" || element["fontSize"] == nil {
		t.Fatalf("element defaults missing: %#v", element)
	}
	realResponseShape := `{"slides":[{"elements":[{"type":"text","content":"<h1 style='font-size:42px'>文档资产统一存储与新管道重构执行待办清单</h1>","html":""}]}]}`
	slides, err = normalizePresentationBatch(realResponseShape, plans)
	if err != nil {
		t.Fatalf("real response shape was rejected: %v", err)
	}
	element = slides[0]["elements"].([]any)[0].(map[string]any)
	if element["html"] != "<h1 style='font-size:42px'>文档资产统一存储与新管道重构执行待办清单</h1>" {
		t.Fatalf("content was not canonicalized to html: %#v", element)
	}
	if _, exists := element["content"]; exists {
		t.Fatalf("alternate text field was not removed: %#v", element)
	}
	empty := `{"slides":[{"elements":[{"type":"text","content":"  ","html":"<br>"}]}]}`
	if _, err := normalizePresentationBatch(empty, plans); err == nil {
		t.Fatal("slide with empty canonical text was accepted")
	}
	unsafe := `{"slides":[{"elements":[{"type":"text","html":"<script>alert(1)</script>"}]}]}`
	if _, err := normalizePresentationBatch(unsafe, plans); err == nil {
		t.Fatal("unsafe batch was accepted")
	}
}

func TestPptGenerationRecordPersistence(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir(), pptJobs: make(map[string]*pptGenerationRuntime)}
	req := AIPresentationGenerationRequest{
		Markdown: "# 测试\n\n正文", SourcePath: "C:/docs/test.md", SourceHash: "hash-1",
		FileName: "test.md", Density: "standard", TargetSlides: 6, BatchSize: 3,
	}
	plans, err := buildPptSlidePlansWithTarget(req.Markdown, req.Density, req.FileName, req.TargetSlides)
	if err != nil {
		t.Fatal(err)
	}
	record := createPptGenerationRecord(req, plans)
	record.Status = "running"
	if err := app.persistPptGenerationRecord(record); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.loadPptGenerationRecord(req.SourcePath)
	if err != nil {
		t.Fatal(err)
	}
	if loaded == nil || loaded.Status != "paused" || !loaded.CanResume || loaded.JobID != record.JobID ||
		loaded.Density != "standard" || loaded.TargetSlides != 6 || loaded.BatchSize != 3 {
		t.Fatalf("unexpected recovered job: %#v", loaded)
	}
}

func TestResolveLegacyPptResumePlan(t *testing.T) {
	markdown := "# 测试\n\n" + strings.Repeat("较长正文", 3000)
	original := AIPresentationGenerationRequest{
		Markdown: markdown, SourcePath: "C:/docs/legacy.md", SourceHash: "hash-legacy",
		FileName: "legacy.md", Density: "detailed", TargetSlides: 9, BatchSize: 2,
	}
	plans, err := buildPptSlidePlansWithTarget(original.Markdown, original.Density, original.FileName, original.TargetSlides)
	if err != nil {
		t.Fatal(err)
	}
	record := createPptGenerationRecord(original, plans)
	record.Density = ""
	record.BatchSize = 0
	resume := original
	resume.Density = "standard"
	resume.TargetSlides = 5
	resume.BatchSize = 5
	recoveredPlans, err := resolvePptResumePlan(&resume, &record)
	if err != nil {
		t.Fatal(err)
	}
	if !pptPlansMatchRecord(recoveredPlans, record.Slides) || resume.Density != "detailed" || resume.TargetSlides != 9 || resume.BatchSize != 2 {
		t.Fatalf("generation settings were not recovered: density=%s target=%d batchSize=%d", resume.Density, resume.TargetSlides, resume.BatchSize)
	}
}

func TestPptArtifactPartialVolumeRoundTrip(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	doc := minimalBentoHTML(`{"format":"bento/slides","version":1,"docId":"doc-1","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","elements":[]}]}`)
	if err := app.SavePptArtifactVolume("C:/docs/partial.md", "hash-partial", "partial-01.bento.html", 0, 3, doc); err != nil {
		t.Fatal(err)
	}
	record, err := app.GetPptArtifact("C:/docs/partial.md")
	if err != nil {
		t.Fatal(err)
	}
	if record == nil || len(record.Volumes) != 3 || record.Volumes[0].HTML == "" || record.Volumes[1].HTML != "" || record.Volumes[1].UpdatedAt != 0 {
		t.Fatalf("unexpected partial volume artifact: %#v", record)
	}
}

func TestPptArtifactVolumeRoundTrip(t *testing.T) {
	app := &App{pptArtifactDir: t.TempDir()}
	doc := func(id string) string {
		return minimalBentoHTML(fmt.Sprintf(`{"format":"bento/slides","version":1,"docId":"%s","title":"测试","size":{"width":1280,"height":720},"slides":[{"id":"slide-1","elements":[]}]}`, id))
	}
	if err := app.SavePptArtifactVolume("C:/docs/large.md", "hash-2", "large-01.bento.html", 0, 2, doc("doc-1")); err != nil {
		t.Fatal(err)
	}
	if err := app.SavePptArtifactVolume("C:/docs/large.md", "hash-2", "large-02.bento.html", 1, 2, doc("doc-2")); err != nil {
		t.Fatal(err)
	}
	record, err := app.GetPptArtifact("C:/docs/large.md")
	if err != nil {
		t.Fatal(err)
	}
	if record == nil || len(record.Volumes) != 2 || !strings.Contains(record.Volumes[1].HTML, "doc-2") {
		t.Fatalf("unexpected volume artifact: %#v", record)
	}
}

func TestIncrementalPptGenerationEndToEnd(t *testing.T) {
	slideIDPattern := regexp.MustCompile(`id="(slide-\d+)"`)
	var storyboardCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload chatCompletionRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		prompt := payload.Messages[len(payload.Messages)-1].Content
		if strings.Contains(prompt, "请为下面文档规划恰好") {
			storyboardCalls.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": mockPptStoryboardResponse(prompt)}}},
			})
			return
		}
		matches := slideIDPattern.FindAllStringSubmatch(prompt, -1)
		slides := make([]map[string]any, 0, len(matches))
		for _, match := range matches {
			slides = append(slides, map[string]any{
				"id": match[1], "background": "#fff", "transition": "fade", "notes": "",
				"elements": []any{map[string]any{
					"id": match[1] + "-title", "type": "text", "x": 80, "y": 80,
					"w": 900, "h": 100, "rotation": 0, "opacity": 1, "html": "测试页面",
				}},
			})
		}
		content, _ := json.Marshal(map[string]any{"slides": slides})
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": string(content)}}},
		})
	}))
	defer server.Close()

	app := &App{pptArtifactDir: t.TempDir(), pptJobs: make(map[string]*pptGenerationRuntime)}
	req := AIPresentationGenerationRequest{
		Markdown:   "# 集成测试\n\n摘要\n\n## 一\n内容一\n\n## 二\n内容二\n\n## 三\n内容三\n\n## 四\n内容四",
		SourcePath: "C:/docs/integration.md", SourceHash: "hash-integration", FileName: "integration.md",
		Density: "standard", TargetSlides: 6, BatchSize: 2,
		Model: AIModelConfig{BaseURL: server.URL, Model: "mock", FormatTimeout: 60},
	}
	started, err := app.StartPptGeneration(req)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(8 * time.Second)
	var finished *PptGenerationJobRecord
	for time.Now().Before(deadline) {
		finished, err = app.GetPptGenerationJob(req.SourcePath)
		if err != nil {
			t.Fatal(err)
		}
		if finished != nil && finished.Status == "completed" {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if finished == nil || finished.Status != "completed" {
		t.Fatalf("job %s did not complete: %#v", started.JobID, finished)
	}
	if finished.CompletedSlides != finished.TotalSlides || finished.TotalSlides != 6 || finished.TargetSlides != 6 {
		t.Fatalf("unexpected completion counts: %#v", finished)
	}
	if storyboardCalls.Load() != 1 {
		t.Fatalf("storyboard calls = %d, want 1", storyboardCalls.Load())
	}
	for _, volume := range finished.Volumes {
		if _, err := extractAndValidateBentoJSON(volume.DocumentJSON); err != nil {
			t.Fatalf("generated volume invalid: %v", err)
		}
	}
}

func TestIncrementalPptGenerationContinuesAfterPartialFailure(t *testing.T) {
	var failFirstBatch atomic.Bool
	var storyboardCalls atomic.Int32
	failFirstBatch.Store(true)
	slideIDPattern := regexp.MustCompile(`id="(slide-\d+)"`)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload chatCompletionRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		prompt := payload.Messages[len(payload.Messages)-1].Content
		if strings.Contains(prompt, "请为下面文档规划恰好") {
			storyboardCalls.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": mockPptStoryboardResponse(prompt)}}},
			})
			return
		}
		content := `{"slides":[]}`
		if failFirstBatch.Load() && strings.Contains(prompt, `id="slide-0001"`) {
			content = "模型返回了无法解析的内容"
		} else {
			matches := slideIDPattern.FindAllStringSubmatch(prompt, -1)
			slides := make([]map[string]any, 0, len(matches))
			for _, match := range matches {
				slides = append(slides, map[string]any{
					"id": match[1], "background": "#fff", "transition": "fade", "notes": "",
					"elements": []any{map[string]any{
						"id": match[1] + "-title", "type": "text", "x": 80, "y": 80,
						"w": 900, "h": 100, "rotation": 0, "opacity": 1, "html": "测试页面",
					}},
				})
			}
			encoded, _ := json.Marshal(map[string]any{"slides": slides})
			content = string(encoded)
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": content}}},
		})
	}))
	defer server.Close()

	app := &App{pptArtifactDir: t.TempDir(), pptJobs: make(map[string]*pptGenerationRuntime)}
	req := AIPresentationGenerationRequest{
		Markdown:   "# 容错测试\n\n摘要\n\n## 一\n内容一\n\n## 二\n内容二\n\n## 三\n内容三\n\n## 四\n内容四",
		SourcePath: "C:/docs/partial.md", SourceHash: "hash-partial", FileName: "partial.md",
		Density: "standard", BatchSize: 2,
		Model: AIModelConfig{BaseURL: server.URL, Model: "mock", FormatTimeout: 60},
	}
	if _, err := app.StartPptGeneration(req); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(8 * time.Second)
	var partial *PptGenerationJobRecord
	for time.Now().Before(deadline) {
		partial, _ = app.GetPptGenerationJob(req.SourcePath)
		if partial != nil && partial.Status == "partial" {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if partial == nil || partial.Status != "partial" || partial.CompletedSlides == 0 || partial.CompletedSlides >= partial.TotalSlides {
		t.Fatalf("expected usable partial result: %#v", partial)
	}

	failFirstBatch.Store(false)
	if _, err := app.ResumePptGeneration(req); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(8 * time.Second)
	var completed *PptGenerationJobRecord
	for time.Now().Before(deadline) {
		completed, _ = app.GetPptGenerationJob(req.SourcePath)
		if completed != nil && completed.Status == "completed" {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if completed == nil || completed.Status != "completed" || completed.CompletedSlides != completed.TotalSlides {
		t.Fatalf("resume did not fill the missing pages: %#v", completed)
	}
	if storyboardCalls.Load() != 1 {
		t.Fatalf("resume unexpectedly replanned the PPT: %d storyboard calls", storyboardCalls.Load())
	}
}
