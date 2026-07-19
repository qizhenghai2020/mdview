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
	"strings"
	"time"
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
