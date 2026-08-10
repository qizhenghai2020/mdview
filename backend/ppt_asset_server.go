package backend

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const pptEditorAssetPrefix = "/ppt-editor/"

var pptArtifactKeyPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var pptLegacyRuntimeScriptPattern = regexp.MustCompile(`(?is)<script\b[^>]*\bid=["']md-ppt-editor-runtime["'][^>]*>[\s\S]*?</script\s*>`)

// Older generated decks contain an unbounded DOM refresh loop. Remove that
// optional chrome layer while serving them; the embedded Bento document stays
// intact and can be migrated by the current editor on the next save.
func repairLegacyPptEditorRuntime(content []byte) []byte {
	if !bytes.Contains(content, []byte("window.setTimeout(waitForBridge, 25)")) {
		return content
	}
	return pptLegacyRuntimeScriptPattern.ReplaceAll(content, nil)
}

func validatePptArtifactVolumeIndex(volumeIndex int) error {
	if volumeIndex < 0 || volumeIndex >= 20 {
		return errors.New("PPT 分卷序号无效")
	}
	return nil
}

func (a *App) pptArtifactVolumePathByKey(key string, volumeIndex int) (string, error) {
	if !pptArtifactKeyPattern.MatchString(key) {
		return "", errors.New("PPT 文件标识无效")
	}
	if err := validatePptArtifactVolumeIndex(volumeIndex); err != nil {
		return "", err
	}
	dir, err := a.ensurePptArtifactDir()
	if err != nil {
		return "", err
	}
	base := filepath.Join(dir, key)
	if volumeIndex == 0 {
		return base + ".bento.html", nil
	}
	return fmt.Sprintf("%s.volume-%02d.bento.html", base, volumeIndex+1), nil
}

// GetPptArtifactEditorURL returns a same-origin asset URL for the saved Bento
// document. Large Bento documents must be loaded by the WebView as a resource
// rather than copied into iframe.srcdoc.
func (a *App) GetPptArtifactEditorURL(sourcePath string, volumeIndex int) (string, error) {
	cleanPath := normalizePptSourcePath(sourcePath)
	if cleanPath == "" {
		return "", errors.New("PPT 来源路径为空")
	}
	if err := validatePptArtifactVolumeIndex(volumeIndex); err != nil {
		return "", err
	}
	path, err := a.pptArtifactVolumePathByKey(pptArtifactKey(cleanPath), volumeIndex)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", errors.New("PPT 文件尚未生成")
	}
	if err != nil {
		return "", fmt.Errorf("读取 PPT 文件失败: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxPresentationOutput {
		return "", errors.New("PPT 文件无效")
	}
	return fmt.Sprintf("%s%s?volume=%d&version=%d", pptEditorAssetPrefix, pptArtifactKey(cleanPath), volumeIndex, info.ModTime().UnixNano()), nil
}

// PptArtifactAssetHandler serves only saved PPT artifacts. It deliberately
// writes a fresh 200 response for every request because WebView2 can hang when
// an asset handler returns a 304 response.
func PptArtifactAssetHandler(app *App) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.Header().Set("Allow", http.MethodGet)
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !strings.HasPrefix(request.URL.Path, pptEditorAssetPrefix) {
			http.NotFound(writer, request)
			return
		}
		if app == nil {
			http.Error(writer, "PPT 服务未初始化", http.StatusInternalServerError)
			return
		}

		key := strings.TrimPrefix(request.URL.Path, pptEditorAssetPrefix)
		if strings.Contains(key, "/") || !pptArtifactKeyPattern.MatchString(key) {
			http.Error(writer, "PPT 文件标识无效", http.StatusBadRequest)
			return
		}
		volumeIndex := 0
		if rawVolume := strings.TrimSpace(request.URL.Query().Get("volume")); rawVolume != "" {
			parsed, err := strconv.Atoi(rawVolume)
			if err != nil {
				http.Error(writer, "PPT 分卷序号无效", http.StatusBadRequest)
				return
			}
			volumeIndex = parsed
		}
		path, err := app.pptArtifactVolumePathByKey(key, volumeIndex)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusBadRequest)
			return
		}
		content, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			http.NotFound(writer, request)
			return
		}
		if err != nil {
			http.Error(writer, "读取 PPT 文件失败", http.StatusInternalServerError)
			return
		}
		content = repairLegacyPptEditorRuntime(content)
		if len(content) == 0 || int64(len(content)) > maxPresentationOutput {
			http.Error(writer, "PPT 文件无效", http.StatusUnprocessableEntity)
			return
		}

		writer.Header().Set("Cache-Control", "no-store, max-age=0")
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		writer.Header().Set("Content-Length", strconv.Itoa(len(content)))
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write(content)
	})
}
