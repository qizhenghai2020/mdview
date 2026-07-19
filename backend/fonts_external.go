package backend

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (a *App) ListExternalFonts() ([]ExternalFontInfo, error) {
	directories := externalFontDirectories()
	if len(directories) > 0 {
		_ = os.MkdirAll(directories[0], 0o755)
	}

	return listExternalFontsFromDirectories(directories)
}

func externalFontDirectories() []string {
	seen := map[string]struct{}{}
	directories := make([]string, 0, 2)

	addDirectory := func(path string) {
		cleanPath := filepath.Clean(path)
		key := strings.ToLower(cleanPath)
		if cleanPath == "" {
			return
		}
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		directories = append(directories, cleanPath)
	}

	if executablePath, err := os.Executable(); err == nil {
		addDirectory(filepath.Join(filepath.Dir(executablePath), "fonts"))
	}
	if workingDirectory, err := os.Getwd(); err == nil {
		addDirectory(filepath.Join(workingDirectory, "fonts"))
	}

	return directories
}

func listExternalFontsFromDirectories(directories []string) ([]ExternalFontInfo, error) {
	type fontFormat struct {
		MIME string
		CSS  string
	}
	type fontFileEntry struct {
		Path    string
		Name    string
		Size    int64
		ModTime int64
		Format  fontFormat
	}

	formats := map[string]fontFormat{
		".ttf":   {MIME: "font/ttf", CSS: "truetype"},
		".otf":   {MIME: "font/otf", CSS: "opentype"},
		".woff":  {MIME: "font/woff", CSS: "woff"},
		".woff2": {MIME: "font/woff2", CSS: "woff2"},
	}

	fontFiles := make([]fontFileEntry, 0, 8)
	signatureParts := make([]string, 0, 8)
	fonts := make([]ExternalFontInfo, 0, 8)
	seen := map[string]struct{}{}

	for _, directory := range directories {
		entries, err := os.ReadDir(directory)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("读取字体目录失败: %w", err)
		}

		sort.SliceStable(entries, func(indexA, indexB int) bool {
			return strings.ToLower(entries[indexA].Name()) < strings.ToLower(entries[indexB].Name())
		})

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			extension := strings.ToLower(filepath.Ext(entry.Name()))
			format, supported := formats[extension]
			if !supported {
				continue
			}

			fontPath := filepath.Join(directory, entry.Name())
			info, err := entry.Info()
			if err != nil {
				return nil, fmt.Errorf("读取字体信息失败: %w", err)
			}
			if info.Size() > maxExternalFontBytes {
				continue
			}

			modTime := info.ModTime().UnixNano()
			fontFiles = append(fontFiles, fontFileEntry{
				Path:    fontPath,
				Name:    entry.Name(),
				Size:    info.Size(),
				ModTime: modTime,
				Format:  format,
			})
			signatureParts = append(signatureParts, fmt.Sprintf("%s|%s|%d|%d", directory, entry.Name(), info.Size(), modTime))
		}
	}

	signature := strings.Join(signatureParts, "\n")
	externalFontCache.Lock()
	if externalFontCache.signature == signature && externalFontCache.fonts != nil {
		cachedFonts := append([]ExternalFontInfo(nil), externalFontCache.fonts...)
		externalFontCache.Unlock()
		return cachedFonts, nil
	}
	externalFontCache.Unlock()

	for _, fontFile := range fontFiles {
		family := prettifyExternalFontName(fontFile.Name)
		value := buildExternalFontValue(family)
		if _, exists := seen[value]; exists {
			continue
		}

		data, err := os.ReadFile(fontFile.Path)
		if err != nil {
			return nil, fmt.Errorf("读取字体文件失败: %w", err)
		}

		seen[value] = struct{}{}
		fonts = append(fonts, ExternalFontInfo{
			Value:   value,
			Label:   family + "（外部）",
			Family:  family,
			Stack:   buildExternalFontStack(family),
			DataURL: "data:" + fontFile.Format.MIME + ";base64," + base64.StdEncoding.EncodeToString(data),
			Source:  fontFile.Format.CSS,
		})
	}

	externalFontCache.Lock()
	externalFontCache.signature = signature
	externalFontCache.fonts = append([]ExternalFontInfo(nil), fonts...)
	externalFontCache.Unlock()

	return fonts, nil
}

func prettifyExternalFontName(fileName string) string {
	name := strings.TrimSpace(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "External Font"
	}
	return name
}

func buildExternalFontValue(family string) string {
	return "external:" + url.PathEscape(strings.TrimSpace(family))
}

func buildExternalFontStack(family string) string {
	escaped := strings.ReplaceAll(strings.TrimSpace(family), `"`, `\"`)
	if escaped == "" {
		return "inherit"
	}
	return `"` + escaped + `", ` + guessExternalFontFallback(family)
}

func guessExternalFontFallback(family string) string {
	lowerName := strings.ToLower(strings.TrimSpace(family))
	if strings.Contains(lowerName, "serif") ||
		strings.Contains(lowerName, "song") ||
		strings.Contains(lowerName, "宋") ||
		strings.Contains(lowerName, "仿宋") ||
		strings.Contains(lowerName, "楷") {
		return "serif"
	}
	return "sans-serif"
}
