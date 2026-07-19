package backend

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func normalizeDesignDraftSourcePath(sourcePath string) (string, string, error) {
	trimmed := strings.TrimSpace(sourcePath)
	if trimmed == "" {
		return "", "", nil
	}

	if filepath.IsAbs(trimmed) || strings.ContainsAny(trimmed, `/\`) {
		absPath, err := filepath.Abs(trimmed)
		if err != nil {
			return "", "", err
		}

		cleanPath := filepath.Clean(absPath)
		return cleanPath, "path::" + strings.ToLower(cleanPath), nil
	}

	return trimmed, "name::" + strings.ToLower(trimmed), nil
}

func sanitizeDesignDraftFileSegment(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "draft"
	}

	var builder strings.Builder
	builder.Grow(len(trimmed))
	for _, char := range trimmed {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= 'A' && char <= 'Z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-' || char == '_':
			builder.WriteRune(char)
		default:
			builder.WriteByte('_')
		}
		if builder.Len() >= 48 {
			break
		}
	}

	result := strings.Trim(builder.String(), "_")
	if result == "" {
		return "draft"
	}
	return result
}

func buildDesignDraftFileBasePath(dir string, normalizedKey string, sourcePath string) string {
	sum := sha256.Sum256([]byte(normalizedKey))
	baseName := sanitizeDesignDraftFileSegment(filepath.Base(sourcePath))
	return filepath.Join(dir, fmt.Sprintf("%s-%x", baseName, sum[:8]))
}

func buildDesignDraftHTMLPath(dir string, normalizedKey string, sourcePath string) string {
	return buildDesignDraftFileBasePath(dir, normalizedKey, sourcePath) + ".html"
}

func buildDesignDraftMetaPath(dir string, normalizedKey string, sourcePath string) string {
	return buildDesignDraftFileBasePath(dir, normalizedKey, sourcePath) + ".meta.json"
}

func buildDesignDraftLegacyJSONPath(dir string, normalizedKey string, sourcePath string) string {
	return buildDesignDraftFileBasePath(dir, normalizedKey, sourcePath) + ".json"
}

func (a *App) ensureDesignDraftDir() (string, error) {
	a.mu.Lock()
	existingDir := a.designDraftDir
	a.mu.Unlock()
	if strings.TrimSpace(existingDir) != "" {
		return existingDir, nil
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("无法定位程序目录: %w", err)
	}

	sessionDirName := fmt.Sprintf("session-%d", os.Getpid())
	candidates := []string{
		filepath.Join(filepath.Dir(exePath), "data", "html", sessionDirName),
		filepath.Join(os.TempDir(), "mdviewer", "html", sessionDirName),
	}

	var lastErr error
	for _, candidate := range candidates {
		if err := os.MkdirAll(candidate, 0o755); err != nil {
			lastErr = err
			continue
		}

		a.mu.Lock()
		if a.designDraftDir == "" {
			a.designDraftDir = candidate
		}
		dir := a.designDraftDir
		a.mu.Unlock()
		return dir, nil
	}

	if lastErr == nil {
		lastErr = errors.New("无法创建设计草稿目录")
	}
	return "", lastErr
}

func (a *App) SaveDesignDraft(sourcePath string, fileName string, html string) error {
	cleanSourcePath, normalizedKey, err := normalizeDesignDraftSourcePath(sourcePath)
	if err != nil {
		return fmt.Errorf("设计草稿路径无效: %w", err)
	}
	if cleanSourcePath == "" {
		return errors.New("设计草稿路径为空")
	}

	dir, err := a.ensureDesignDraftDir()
	if err != nil {
		return fmt.Errorf("设计草稿目录创建失败: %w", err)
	}

	record := DesignDraftRecord{
		SourcePath: cleanSourcePath,
		FileName:   strings.TrimSpace(fileName),
		HTML:       html,
		UpdatedAt:  time.Now().UnixMilli(),
	}
	if record.FileName == "" {
		record.FileName = filepath.Base(cleanSourcePath)
	}

	metaPayload, err := json.Marshal(designDraftMetaRecord{
		SourcePath: record.SourcePath,
		FileName:   record.FileName,
		UpdatedAt:  record.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("设计草稿生成失败: %w", err)
	}

	htmlPath := buildDesignDraftHTMLPath(dir, normalizedKey, cleanSourcePath)
	metaPath := buildDesignDraftMetaPath(dir, normalizedKey, cleanSourcePath)
	if err := os.WriteFile(htmlPath, []byte(record.HTML), 0o644); err != nil {
		return fmt.Errorf("设计草稿 HTML 写入失败: %w", err)
	}
	if err := os.WriteFile(metaPath, metaPayload, 0o644); err != nil {
		return fmt.Errorf("设计草稿写入失败: %w", err)
	}

	return nil
}

func (a *App) GetDesignDraft(sourcePath string) (*DesignDraftRecord, error) {
	cleanSourcePath, normalizedKey, err := normalizeDesignDraftSourcePath(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("设计草稿路径无效: %w", err)
	}
	if cleanSourcePath == "" {
		return nil, nil
	}

	a.mu.Lock()
	dir := a.designDraftDir
	a.mu.Unlock()
	if strings.TrimSpace(dir) == "" {
		return nil, nil
	}

	htmlPath := buildDesignDraftHTMLPath(dir, normalizedKey, cleanSourcePath)
	metaPath := buildDesignDraftMetaPath(dir, normalizedKey, cleanSourcePath)
	htmlPayload, htmlErr := os.ReadFile(htmlPath)
	if htmlErr == nil {
		record := &DesignDraftRecord{
			SourcePath: cleanSourcePath,
			FileName:   filepath.Base(cleanSourcePath),
			HTML:       string(htmlPayload),
		}

		if info, err := os.Stat(htmlPath); err == nil {
			record.UpdatedAt = info.ModTime().UnixMilli()
		}

		if metaPayload, err := os.ReadFile(metaPath); err == nil {
			var meta designDraftMetaRecord
			if err := json.Unmarshal(metaPayload, &meta); err != nil {
				return nil, fmt.Errorf("设计草稿元数据解析失败: %w", err)
			}

			metaSourcePath, metaNormalizedKey, err := normalizeDesignDraftSourcePath(meta.SourcePath)
			if err != nil {
				return nil, fmt.Errorf("设计草稿来源路径异常: %w", err)
			}
			if metaNormalizedKey != "" && !strings.EqualFold(metaNormalizedKey, normalizedKey) {
				return nil, nil
			}
			if metaSourcePath != "" {
				record.SourcePath = metaSourcePath
			}
			if strings.TrimSpace(meta.FileName) != "" {
				record.FileName = strings.TrimSpace(meta.FileName)
			}
			if meta.UpdatedAt > 0 {
				record.UpdatedAt = meta.UpdatedAt
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("设计草稿元数据读取失败: %w", err)
		}

		return record, nil
	}
	if htmlErr != nil && !errors.Is(htmlErr, os.ErrNotExist) {
		return nil, fmt.Errorf("设计草稿 HTML 读取失败: %w", htmlErr)
	}

	legacyPath := buildDesignDraftLegacyJSONPath(dir, normalizedKey, cleanSourcePath)
	payload, err := os.ReadFile(legacyPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("设计草稿读取失败: %w", err)
	}

	var record DesignDraftRecord
	if err := json.Unmarshal(payload, &record); err != nil {
		return nil, fmt.Errorf("设计草稿解析失败: %w", err)
	}

	recordSourcePath, recordNormalizedKey, err := normalizeDesignDraftSourcePath(record.SourcePath)
	if err != nil {
		return nil, fmt.Errorf("设计草稿来源路径异常: %w", err)
	}
	if recordNormalizedKey == "" || !strings.EqualFold(recordNormalizedKey, normalizedKey) {
		return nil, nil
	}
	record.SourcePath = recordSourcePath
	if strings.TrimSpace(record.FileName) == "" {
		record.FileName = filepath.Base(cleanSourcePath)
	}

	return &record, nil
}

func (a *App) DeleteDesignDraft(sourcePath string) error {
	cleanSourcePath, normalizedKey, err := normalizeDesignDraftSourcePath(sourcePath)
	if err != nil {
		return fmt.Errorf("设计草稿路径无效: %w", err)
	}
	if cleanSourcePath == "" {
		return nil
	}

	a.mu.Lock()
	dir := a.designDraftDir
	a.mu.Unlock()
	if strings.TrimSpace(dir) == "" {
		return nil
	}

	htmlPath := buildDesignDraftHTMLPath(dir, normalizedKey, cleanSourcePath)
	metaPath := buildDesignDraftMetaPath(dir, normalizedKey, cleanSourcePath)
	legacyPath := buildDesignDraftLegacyJSONPath(dir, normalizedKey, cleanSourcePath)
	for _, draftPath := range []string{htmlPath, metaPath, legacyPath} {
		if err := os.Remove(draftPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("设计草稿删除失败: %w", err)
		}
	}
	return nil
}

func (a *App) cleanupDesignSessionArtifacts() {
	a.mu.Lock()
	draftDir := a.designDraftDir
	a.designDraftDir = ""
	designExportArg := strings.TrimSpace(a.designExportArg)
	a.mu.Unlock()

	if draftDir != "" {
		_ = os.RemoveAll(draftDir)
	}
	if designExportArg != "" {
		_ = os.Remove(designExportArg)
	}
}

func (a *App) OpenDesignExportWindow(html string, fileName string) error {
	if strings.TrimSpace(html) == "" {
		return errors.New("设计导出内容为空")
	}

	payload := DesignExportPayload{
		HTML:     html,
		FileName: strings.TrimSpace(fileName),
	}
	if payload.FileName == "" {
		payload.FileName = "markdown-preview.html"
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("设计导出数据生成失败: %w", err)
	}

	tempFile, err := os.CreateTemp("", "mdviewer-design-export-*.json")
	if err != nil {
		return fmt.Errorf("设计导出临时文件创建失败: %w", err)
	}
	payloadPath := tempFile.Name()
	if _, err := tempFile.Write(payloadBytes); err != nil {
		tempFile.Close()
		os.Remove(payloadPath)
		return fmt.Errorf("设计导出临时文件写入失败: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		os.Remove(payloadPath)
		return fmt.Errorf("设计导出临时文件关闭失败: %w", err)
	}

	exePath, err := os.Executable()
	if err != nil {
		os.Remove(payloadPath)
		return fmt.Errorf("无法定位当前程序: %w", err)
	}

	cmd := exec.Command(exePath, "--design-export", payloadPath)
	cmd.Dir = filepath.Dir(exePath)
	if err := cmd.Start(); err != nil {
		os.Remove(payloadPath)
		return fmt.Errorf("HTML设计器窗口启动失败: %w", err)
	}
	if err := cmd.Process.Release(); err != nil {
		return fmt.Errorf("HTML设计器窗口启动失败: %w", err)
	}

	return nil
}
