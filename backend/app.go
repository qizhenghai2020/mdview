package backend

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sync"
	"time"
)

// App struct
type App struct {
	ctx             context.Context
	filePath        string
	fileEncoding    string
	startupArg      string
	startupMode     string
	designExportArg string
	designDraftDir  string
	pptArtifactDir  string
	lastModTime     time.Time
	lastFileSize    int64
	lastFileHash    [sha256.Size]byte
	watchCancel     context.CancelFunc
	watchGeneration uint64
	pptJobs         map[string]*pptGenerationRuntime
	mu              sync.Mutex
}

type AIModelConfig struct {
	Name            string            `json:"name"`
	BaseURL         string            `json:"baseUrl"`
	APIKey          string            `json:"apiKey"`
	Model           string            `json:"model"`
	Timeout         int               `json:"timeout"`
	FormatTimeout   int               `json:"formatTimeout"`
	Headers         []AIRequestHeader `json:"headers"`
	RequestTemplate string            `json:"requestTemplate"`
	ResponseMode    string            `json:"responseMode,omitempty"`
}

type AIRequestHeader struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type AIFormatRequest struct {
	Markdown    string        `json:"markdown"`
	Instruction string        `json:"instruction"`
	Format      string        `json:"format"`
	Model       AIModelConfig `json:"model"`
}

type AIThemeRequest struct {
	Preference   string        `json:"preference"`
	CurrentTheme string        `json:"currentTheme"`
	Model        AIModelConfig `json:"model"`
}

type AIGenerateContentRequest struct {
	Kind     string        `json:"kind"`
	Language string        `json:"language,omitempty"`
	Prompt   string        `json:"prompt"`
	Template string        `json:"template,omitempty"`
	Model    AIModelConfig `json:"model"`
}

type AIPresentationRequest struct {
	Markdown      string        `json:"markdown"`
	AssetManifest string        `json:"assetManifest,omitempty"`
	Instruction   string        `json:"instruction,omitempty"`
	Model         AIModelConfig `json:"model"`
}

type AIPresentationSlideRequest struct {
	Slide           map[string]any `json:"slide"`
	Context         map[string]any `json:"context,omitempty"`
	Instruction     string         `json:"instruction,omitempty"`
	ReferenceImages []string       `json:"referenceImages,omitempty"`
	Model           AIModelConfig  `json:"model"`
}

type AIFormatProgressEvent struct {
	Kind            string `json:"kind"`
	Stage           string `json:"stage"`
	Message         string `json:"message"`
	Detail          string `json:"detail,omitempty"`
	Endpoint        string `json:"endpoint,omitempty"`
	StatusCode      int    `json:"statusCode,omitempty"`
	RequestBytes    int    `json:"requestBytes,omitempty"`
	ResponseBytes   int    `json:"responseBytes,omitempty"`
	ContentChars    int    `json:"contentChars,omitempty"`
	DeltaChars      int    `json:"deltaChars,omitempty"`
	ContentPath     string `json:"contentPath,omitempty"`
	ElapsedMs       int64  `json:"elapsedMs,omitempty"`
	JobID           string `json:"jobId,omitempty"`
	BatchID         string `json:"batchId,omitempty"`
	VolumeIndex     int    `json:"volumeIndex,omitempty"`
	CurrentSlide    int    `json:"currentSlide,omitempty"`
	CompletedSlides int    `json:"completedSlides,omitempty"`
	TotalSlides     int    `json:"totalSlides,omitempty"`
	Attempt         int    `json:"attempt,omitempty"`
	Retryable       bool   `json:"retryable,omitempty"`
}

type chatCompletionMessage struct {
	Role          string   `json:"role"`
	Content       string   `json:"-"`
	ImageDataURLs []string `json:"-"`
}

func (message chatCompletionMessage) MarshalJSON() ([]byte, error) {
	content := any(message.Content)
	if len(message.ImageDataURLs) > 0 {
		parts := make([]map[string]any, 0, len(message.ImageDataURLs)+1)
		for _, imageURL := range message.ImageDataURLs {
			if imageURL == "" {
				continue
			}
			parts = append(parts, map[string]any{
				"type": "image_url",
				"image_url": map[string]any{
					"url": imageURL,
				},
			})
		}
		if message.Content != "" {
			parts = append(parts, map[string]any{"type": "text", "text": message.Content})
		}
		if len(parts) > 0 {
			content = parts
		}
	}
	return json.Marshal(struct {
		Role    string `json:"role"`
		Content any    `json:"content"`
	}{Role: message.Role, Content: content})
}

func (message *chatCompletionMessage) UnmarshalJSON(data []byte) error {
	var raw struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	message.Role = raw.Role
	message.Content = ""
	if len(raw.Content) == 0 || string(raw.Content) == "null" {
		return nil
	}
	if err := json.Unmarshal(raw.Content, &message.Content); err == nil {
		return nil
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw.Content, &parts); err != nil {
		return err
	}
	for _, part := range parts {
		if part.Type == "text" && part.Text != "" {
			if message.Content != "" {
				message.Content += "\n"
			}
			message.Content += part.Text
		}
	}
	return nil
}

type chatCompletionRequest struct {
	Model       string                  `json:"model"`
	Messages    []chatCompletionMessage `json:"messages"`
	Temperature float64                 `json:"temperature"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message chatCompletionMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// FileTreeNode is a text file or directory shown in the frontend explorer.
type FileTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"isDir"`
	Children []FileTreeNode `json:"children"`
}

// FileWorkspace is a bounded tree built from selected files and directories.
type FileWorkspace struct {
	Roots        []FileTreeNode `json:"roots"`
	FileCount    int            `json:"fileCount"`
	SkippedCount int            `json:"skippedCount"`
	Truncated    bool           `json:"truncated"`
}

type DesignExportPayload struct {
	HTML     string `json:"html"`
	FileName string `json:"fileName"`
}

type DesignDraftRecord struct {
	SourcePath string `json:"sourcePath"`
	FileName   string `json:"fileName"`
	HTML       string `json:"html"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type PptArtifactRecord struct {
	SourcePath    string                    `json:"sourcePath"`
	SourceHash    string                    `json:"sourceHash"`
	FileName      string                    `json:"fileName"`
	HTML          string                    `json:"html"`
	UpdatedAt     int64                     `json:"updatedAt"`
	ShellVersion  string                    `json:"shellVersion"`
	PromptVersion string                    `json:"promptVersion"`
	Volumes       []PptArtifactVolumeRecord `json:"volumes,omitempty"`
}

type PptArtifactVolumeRecord struct {
	Index     int    `json:"index"`
	FileName  string `json:"fileName"`
	HTML      string `json:"html"`
	UpdatedAt int64  `json:"updatedAt"`
}

type designDraftMetaRecord struct {
	SourcePath string `json:"sourcePath"`
	FileName   string `json:"fileName"`
	UpdatedAt  int64  `json:"updatedAt"`
}

const maxWorkspaceFiles = 10000

const maxAIFormatResponseBytes int64 = 8 * 1024 * 1024

const maxAIThemeResponseBytes int64 = 256 * 1024

const maxAITestResponseBytes int64 = 128 * 1024

const maxInlineImageBytes int64 = 12 * 1024 * 1024

const startupModeDesignExport = "design-export"

var textFileExtensions = map[string]struct{}{
	".adoc": {}, ".asc": {}, ".asm": {}, ".astro": {}, ".bat": {}, ".bash": {},
	".c": {}, ".cc": {}, ".cfg": {}, ".clj": {}, ".cljs": {}, ".cmd": {}, ".conf": {},
	".cpp": {}, ".cs": {}, ".css": {}, ".csv": {}, ".cxx": {}, ".dart": {}, ".diff": {},
	".editorconfig": {}, ".env": {}, ".fish": {}, ".fs": {}, ".fsx": {}, ".go": {},
	".gql": {}, ".graphql": {}, ".groovy": {}, ".h": {}, ".hpp": {}, ".htm": {}, ".html": {},
	".ini": {}, ".java": {}, ".jl": {}, ".js": {}, ".json": {}, ".jsonl": {}, ".jsx": {},
	".kt": {}, ".kts": {}, ".less": {}, ".log": {}, ".lua": {}, ".md": {}, ".markdown": {},
	".mdown": {}, ".mkd": {}, ".mkdn": {}, ".mdwn": {}, ".mjs": {}, ".mm": {}, ".org": {},
	".patch": {}, ".php": {}, ".pl": {}, ".properties": {}, ".ps1": {}, ".py": {}, ".r": {},
	".rb": {}, ".rs": {}, ".rst": {}, ".sass": {}, ".scala": {}, ".scss": {}, ".sh": {},
	".sql": {}, ".svelte": {}, ".svg": {}, ".swift": {}, ".tex": {}, ".toml": {}, ".ts": {},
	".tsv": {}, ".tsx": {}, ".txt": {}, ".vue": {}, ".xml": {}, ".yaml": {}, ".yml": {},
	".zsh": {},
}

var binaryFileExtensions = map[string]struct{}{
	".7z": {}, ".avi": {}, ".bin": {}, ".bmp": {}, ".class": {}, ".db": {}, ".dll": {},
	".doc": {}, ".docx": {}, ".dylib": {}, ".eot": {}, ".exe": {}, ".gif": {}, ".gz": {},
	".ico": {}, ".jar": {}, ".jpeg": {}, ".jpg": {}, ".lockb": {}, ".mov": {}, ".mp3": {},
	".mp4": {}, ".o": {}, ".obj": {}, ".otf": {}, ".pdf": {}, ".png": {}, ".ppt": {},
	".pptx": {}, ".rar": {}, ".so": {}, ".sqlite": {}, ".tar": {}, ".tif": {}, ".tiff": {},
	".ttf": {}, ".wav": {}, ".webm": {}, ".webp": {}, ".woff": {}, ".woff2": {}, ".xls": {},
	".xlsx": {}, ".xz": {}, ".zip": {},
}

var ignoredWorkspaceDirectories = map[string]struct{}{
	".git": {}, ".idea": {}, ".svn": {}, ".vs": {}, ".vscode": {}, "build": {},
	"coverage": {}, "dist": {}, "node_modules": {}, "target": {}, "vendor": {},
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{pptJobs: make(map[string]*pptGenerationRuntime)}
}

func StartupHandler(app *App) func(context.Context) {
	return app.startup
}

func ShutdownHandler(app *App) func(context.Context) {
	return app.shutdown
}

// SetStartupArg sets the file path passed from command line
func (a *App) SetStartupArg(arg string) {
	a.startupArg = arg
}

func (a *App) SetDesignExportStartupArg(arg string) {
	a.startupMode = startupModeDesignExport
	a.designExportArg = arg
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	runtime.WindowMaximise(ctx)
	runtime.WindowShow(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	a.StopFileWatch()
	a.cancelAllPptGenerationJobs()
	a.cleanupDesignSessionArtifacts()
}

// GetStartupFile returns the file path passed at startup
func (a *App) GetStartupFile() string {
	return a.startupArg
}

func (a *App) GetStartupMode() string {
	return a.startupMode
}

func (a *App) GetDesignExportPayloadPath() string {
	return a.designExportArg
}

// GetAppVersion returns the application version
func (a *App) GetAppVersion() string {
	return "1.0.4"
}
