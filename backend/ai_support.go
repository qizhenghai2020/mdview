package backend

import (
	"regexp"
	"sync"
)

const maxExternalFontBytes int64 = 20 * 1024 * 1024

var templatePlaceholderPattern = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`)

var externalFontCache = struct {
	sync.Mutex
	signature string
	fonts     []ExternalFontInfo
}{}

type ExternalFontInfo struct {
	Value   string `json:"value"`
	Label   string `json:"label"`
	Family  string `json:"family"`
	Stack   string `json:"stack"`
	DataURL string `json:"dataUrl"`
	Source  string `json:"source"`
}

type AIModelTestResult struct {
	Success         bool                `json:"success"`
	Message         string              `json:"message"`
	Content         string              `json:"content,omitempty"`
	ContentPath     string              `json:"contentPath,omitempty"`
	Endpoint        string              `json:"endpoint,omitempty"`
	Method          string              `json:"method,omitempty"`
	RequestHeaders  map[string]string   `json:"requestHeaders,omitempty"`
	RequestBody     string              `json:"requestBody,omitempty"`
	StatusCode      int                 `json:"statusCode,omitempty"`
	ResponseHeaders map[string][]string `json:"responseHeaders,omitempty"`
	ResponseBody    string              `json:"responseBody,omitempty"`
}

type aiRequestContext struct {
	Kind         string
	ModelName    string
	Temperature  float64
	Messages     []chatCompletionMessage
	SystemPrompt string
	UserPrompt   string
	Markdown     string
	Instruction  string
	Preference   string
	CurrentTheme string
}

type aiExecutionResult struct {
	Endpoint        string
	Method          string
	RequestHeaders  map[string]string
	RequestBody     string
	StatusCode      int
	ResponseHeaders map[string][]string
	ResponseBody    []byte
}

type aiTextCandidate struct {
	Text  string
	Path  string
	Score int
}
