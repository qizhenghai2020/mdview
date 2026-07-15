package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows/registry"
)

// App struct
type App struct {
	ctx           context.Context
	filePath      string
	startupArg    string
	lastModTime   time.Time
	watchStop     chan struct{}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		watchStop: make(chan struct{}),
	}
}

// SetStartupArg sets the file path passed from command line
func (a *App) SetStartupArg(arg string) {
	a.startupArg = arg
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// 窗口最大化
	runtime.WindowMaximise(ctx)
	runtime.WindowShow(ctx)
}

// GetStartupFile returns the file path passed at startup
func (a *App) GetStartupFile() string {
	return a.startupArg
}

// OpenFileDialog opens a file dialog and returns the selected file path
func (a *App) OpenFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开 Markdown 文件",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Markdown 文件",
				Pattern:     "*.md;*.markdown;*.mdown;*.mkdn;*.mkd;*.mdwn",
			},
			{
				DisplayName: "所有文件",
				Pattern:     "*.*",
			},
		},
	})
	if err != nil {
		return ""
	}
	return path
}

// ReadFile reads the content of a file
func (a *App) ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	a.filePath = path
	return string(data), nil
}

// GetFileName returns the base name of the current file
func (a *App) GetFileName() string {
	if a.filePath == "" {
		return "未打开文件"
	}
	return filepath.Base(a.filePath)
}

// GetFilePath returns the full path of the current file
func (a *App) GetFilePath() string {
	return a.filePath
}

// SaveFileDialog opens a save dialog and returns the selected path
func (a *App) SaveFileDialog(defaultName string) string {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存文件",
		DefaultFilename: defaultName,
	})
	if err != nil {
		return ""
	}
	return path
}

// WriteFile writes content to a file
func (a *App) WriteFile(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}

// ReadImageAsBase64 reads an image file and returns it as a base64 data URI
func (a *App) ReadImageAsBase64(imagePath string) string {
	data, err := os.ReadFile(imagePath)
	if err != nil {
		return ""
	}

	ext := strings.ToLower(filepath.Ext(imagePath))
	mimeType := "image/png"
	switch ext {
	case ".jpg", ".jpeg":
		mimeType = "image/jpeg"
	case ".gif":
		mimeType = "image/gif"
	case ".svg":
		mimeType = "image/svg+xml"
	case ".webp":
		mimeType = "image/webp"
	case ".bmp":
		mimeType = "image/bmp"
	case ".ico":
		mimeType = "image/x-icon"
	}

	return fmt.Sprintf("data:%s;base64,%s", mimeType, encodeBase64(data))
}

// ResolveImagePath resolves a relative image path against the current markdown file's directory
func (a *App) ResolveImagePath(imagePath string) string {
	if a.filePath == "" {
		return imagePath
	}

	// If it's already a data URI or absolute URL, return as-is
	if strings.HasPrefix(imagePath, "data:") || strings.HasPrefix(imagePath, "http://") || strings.HasPrefix(imagePath, "https://") {
		return imagePath
	}

	// If it's an absolute path, return as-is
	if filepath.IsAbs(imagePath) {
		return imagePath
	}

	// Resolve relative to the markdown file's directory
	dir := filepath.Dir(a.filePath)
	resolved := filepath.Join(dir, imagePath)
	return resolved
}

// GetAppVersion returns the application version
func (a *App) GetAppVersion() string {
	return "1.0.0"
}

// StartFileWatch starts watching the current file for changes
func (a *App) StartFileWatch() {
	if a.filePath == "" {
		return
	}

	// 获取初始修改时间
	info, err := os.Stat(a.filePath)
	if err != nil {
		return
	}
	a.lastModTime = info.ModTime()

	// 启动监听 goroutine
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-a.watchStop:
				return
			case <-ticker.C:
				if a.filePath == "" {
					continue
				}
				info, err := os.Stat(a.filePath)
				if err != nil {
					continue
				}
				if info.ModTime().After(a.lastModTime) {
					a.lastModTime = info.ModTime()
					// 通知前端文件已变更
					runtime.EventsEmit(a.ctx, "file-changed")
				}
			}
		}
	}()
}

// StopFileWatch stops watching the current file
func (a *App) StopFileWatch() {
	select {
	case a.watchStop <- struct{}{}:
	default:
	}
}

// ReadFileAndUpdateWatch reads file and starts watching it
func (a *App) ReadFileAndUpdateWatch(path string) (string, error) {
	// 停止之前的监听
	a.StopFileWatch()

	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	a.filePath = path

	// 获取修改时间
	info, err := os.Stat(path)
	if err == nil {
		a.lastModTime = info.ModTime()
	}

	// 开始监听
	a.StartFileWatch()

	return string(data), nil
}

// GetExePath returns the path of the current executable
func (a *App) GetExePath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}

// IsFileAssociationSet checks if .md files are associated with this app
func (a *App) IsFileAssociationSet() bool {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Classes\mdviewer.mdfile\shell\open\command`, registry.READ)
	if err != nil {
		return false
	}
	defer key.Close()
	return true
}

// RegisterFileAssociation registers .md file association with this app
func (a *App) RegisterFileAssociation() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取程序路径: %w", err)
	}

	// 使用管理员权限执行注册
	cmd := exec.Command("powershell", "-Command", fmt.Sprintf(`
		# 注册应用程序
		New-Item -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 注册文件类型
		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Value 'Markdown 文档' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Value '"%s",0' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 关联 .md 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		# 关联 .markdown 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		Write-Host "success"
	`, exePath, exePath, exePath))
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("注册失败: %w, 输出: %s", err, string(output))
	}

	return nil
}

// encodeBase64 encodes bytes to base64 string without importing encoding/base64
// Actually, let's just use the standard library
func encodeBase64(data []byte) string {
	const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

	result := make([]byte, 0, (len(data)+2)/3*4)

	for i := 0; i < len(data); i += 3 {
		var n uint32
		remaining := len(data) - i

		if remaining >= 3 {
			n = uint32(data[i])<<16 | uint32(data[i+1])<<8 | uint32(data[i+2])
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				base64Chars[(n>>6)&0x3F],
				base64Chars[n&0x3F],
			)
		} else if remaining == 2 {
			n = uint32(data[i])<<16 | uint32(data[i+1])<<8
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				base64Chars[(n>>6)&0x3F],
				'=',
			)
		} else {
			n = uint32(data[i]) << 16
			result = append(result,
				base64Chars[(n>>18)&0x3F],
				base64Chars[(n>>12)&0x3F],
				'=',
				'=',
			)
		}
	}

	return string(result)
}
