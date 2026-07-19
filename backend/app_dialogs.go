package backend

import (
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"path/filepath"
	"strings"
)

// OpenFileDialog opens a file dialog and returns the selected file path
func (a *App) OpenFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "打开文本文件",
		Filters: textFileDialogFilters(),
	})
	if err != nil {
		return ""
	}
	return path
}

// OpenFilesDialog opens a file dialog that allows selecting multiple text files.
func (a *App) OpenFilesDialog() []string {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "打开一个或多个文本文件",
		Filters: textFileDialogFilters(),
	})
	if err != nil {
		return nil
	}
	return paths
}

// OpenDirectoryDialog lets the user select a directory for the file explorer.
func (a *App) OpenDirectoryDialog() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开文本目录",
	})
	if err != nil {
		return ""
	}
	return path
}

func textFileDialogFilters() []runtime.FileFilter {
	return []runtime.FileFilter{
		{
			DisplayName: "文本与代码文件",
			Pattern:     "*.md;*.markdown;*.txt;*.log;*.json;*.jsonl;*.yaml;*.yml;*.toml;*.ini;*.cfg;*.conf;*.csv;*.tsv;*.xml;*.html;*.css;*.js;*.jsx;*.ts;*.tsx;*.vue;*.go;*.py;*.java;*.c;*.h;*.cpp;*.hpp;*.cs;*.rs;*.sql;*.sh;*.bat;*.cmd;*.ps1",
		},
		{
			DisplayName: "Markdown 文件",
			Pattern:     "*.md;*.markdown;*.mdown;*.mkdn;*.mkd;*.mdwn",
		},
		{
			DisplayName: "所有文件（自动检测文本）",
			Pattern:     "*.*",
		},
	}
}

// GetFileName returns the base name of the current file
func (a *App) GetFileName() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.filePath == "" {
		return "未打开文件"
	}
	return filepath.Base(a.filePath)
}

// GetFilePath returns the full path of the current file
func (a *App) GetFilePath() string {
	a.mu.Lock()
	defer a.mu.Unlock()
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

// SaveExportFileDialog opens a save dialog with an export-specific file filter.
func (a *App) SaveExportFileDialog(defaultName string, displayName string, pattern string) string {
	if strings.TrimSpace(displayName) == "" {
		displayName = "导出文件"
	}
	if strings.TrimSpace(pattern) == "" {
		pattern = "*.*"
	}

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出文件",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{
				DisplayName: displayName,
				Pattern:     pattern,
			},
		},
	})
	if err != nil {
		return ""
	}
	return path
}
