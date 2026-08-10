package backend

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	maxPptReferenceImages     = 8
	maxPptReferenceImageBytes = 4 * 1024 * 1024
)

// ReadImageAsBase64 reads a local or remote image resource and returns it as a base64 data URI.
func (a *App) ReadImageAsBase64(imagePath string) string {
	resource := strings.TrimSpace(imagePath)
	if resource == "" {
		return ""
	}

	var (
		data     []byte
		mimeType string
		err      error
	)

	if isRemoteImageResource(resource) {
		data, mimeType, err = readRemoteImageResource(resource)
	} else {
		data, mimeType, err = readLocalImageResource(resource)
	}
	if err != nil || len(data) == 0 || mimeType == "" {
		return ""
	}

	return fmt.Sprintf("data:%s;base64,%s", mimeType, encodeBase64(data))
}

func attachReferenceImages(requestContext aiRequestContext) (aiRequestContext, error) {
	if len(requestContext.ReferenceImages) == 0 {
		return requestContext, nil
	}
	dataURLs, err := readReferenceImageDataURLs(requestContext.ReferenceImages)
	if err != nil {
		return requestContext, err
	}
	requestContext.ReferenceImages = nil
	requestContext.Messages = append([]chatCompletionMessage(nil), requestContext.Messages...)
	lastUser := -1
	for index := range requestContext.Messages {
		if strings.EqualFold(requestContext.Messages[index].Role, "user") {
			lastUser = index
		}
	}
	if lastUser < 0 {
		requestContext.Messages = append(requestContext.Messages, chatCompletionMessage{Role: "user"})
		lastUser = len(requestContext.Messages) - 1
	}
	requestContext.Messages[lastUser].ImageDataURLs = dataURLs
	return requestContext, nil
}

func readReferenceImageDataURLs(paths []string) ([]string, error) {
	if len(paths) > maxPptReferenceImages {
		return nil, fmt.Errorf("参考图最多支持 %d 张", maxPptReferenceImages)
	}
	result := make([]string, 0, len(paths))
	seen := make(map[string]bool)
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true
		if strings.HasPrefix(strings.ToLower(path), "data:image/") {
			result = append(result, path)
			continue
		}
		if isRemoteImageResource(path) {
			result = append(result, path)
			continue
		}
		data, mimeType, err := readLocalImageResource(path)
		if err != nil {
			return nil, fmt.Errorf("读取参考图失败（%s）：%w", filepath.Base(path), err)
		}
		if int64(len(data)) > maxPptReferenceImageBytes {
			return nil, fmt.Errorf("参考图过大（%s），单张不能超过 %d MB", filepath.Base(path), maxPptReferenceImageBytes/(1024*1024))
		}
		result = append(result, fmt.Sprintf("data:%s;base64,%s", mimeType, encodeBase64(data)))
	}
	return result, nil
}

func (a *App) OpenImageFilesDialog() []string {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "选择参考图片",
		Filters: imageFileDialogFilters(),
	})
	if err != nil {
		return nil
	}
	return paths
}

func (a *App) ListImageFiles(directory string) []string {
	root := strings.TrimSpace(directory)
	if root == "" {
		return nil
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil
	}
	paths := make([]string, 0)
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if isSupportedImagePath(path) {
			paths = append(paths, path)
			if len(paths) >= maxPptReferenceImages {
				return filepath.SkipAll
			}
		}
		return nil
	})
	sort.SliceStable(paths, func(left, right int) bool {
		return strings.ToLower(paths[left]) < strings.ToLower(paths[right])
	})
	return paths
}

func isSupportedImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".avif":
		return true
	default:
		return false
	}
}

func imageFileDialogFilters() []runtime.FileFilter {
	return []runtime.FileFilter{
		{DisplayName: "常规图片", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg;*.ico;*.avif"},
		{DisplayName: "所有文件", Pattern: "*.*"},
	}
}

func isRemoteImageResource(resource string) bool {
	lower := strings.ToLower(strings.TrimSpace(resource))
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}

func readLocalImageResource(imagePath string) ([]byte, string, error) {
	info, err := os.Stat(imagePath)
	if err != nil {
		return nil, "", err
	}
	if info.Size() > maxInlineImageBytes {
		return nil, "", fmt.Errorf("image exceeds inline size limit")
	}

	data, err := os.ReadFile(imagePath)
	if err != nil {
		return nil, "", err
	}

	mimeType := detectImageMimeType(imagePath, "", data)
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, "", fmt.Errorf("resource is not a supported image")
	}

	return data, mimeType, nil
}

func readRemoteImageResource(resource string) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resource, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "mdviewer/1.0")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("image request failed: HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxInlineImageBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > maxInlineImageBytes {
		return nil, "", fmt.Errorf("image exceeds inline size limit")
	}

	mimeType := detectImageMimeType(resource, resp.Header.Get("Content-Type"), data)
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, "", fmt.Errorf("resource is not a supported image")
	}

	return data, mimeType, nil
}

func detectImageMimeType(resourcePath, contentType string, data []byte) string {
	if mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])); mediaType != "" {
		switch mediaType {
		case "image/jpeg", "image/gif", "image/png", "image/svg+xml", "image/webp", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon", "image/avif":
			if mediaType == "image/vnd.microsoft.icon" {
				return "image/x-icon"
			}
			return mediaType
		}
	}

	pathForExt := resourcePath
	if parsedURL, err := url.Parse(resourcePath); err == nil && parsedURL.Scheme != "" {
		pathForExt = parsedURL.Path
	}

	switch strings.ToLower(filepath.Ext(pathForExt)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".ico":
		return "image/x-icon"
	case ".avif":
		return "image/avif"
	case ".png":
		return "image/png"
	}

	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(data), ";")[0]))
	if detected == "text/xml" || detected == "application/xml" {
		trimmed := bytes.TrimSpace(data)
		if bytes.HasPrefix(trimmed, []byte("<svg")) || bytes.Contains(trimmed, []byte("<svg")) {
			return "image/svg+xml"
		}
	}
	if strings.HasPrefix(detected, "image/") {
		return detected
	}

	return ""
}

// ResolveImagePath resolves a relative image path against the current markdown file's directory
func (a *App) ResolveImagePath(imagePath string) string {
	a.mu.Lock()
	currentFilePath := a.filePath
	a.mu.Unlock()

	if currentFilePath == "" {
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
	dir := filepath.Dir(currentFilePath)
	resolved := filepath.Join(dir, imagePath)
	return resolved
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
