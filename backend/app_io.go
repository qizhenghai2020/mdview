package backend

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
	"os"
	"strings"
	"unicode/utf8"
)

// ReadFile reads the content of a file
func (a *App) ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	content, encoding, err := decodeTextData(data)
	if err != nil {
		return "", fmt.Errorf("不支持的二进制或文本编码: %w", err)
	}

	a.mu.Lock()
	a.filePath = path
	a.fileEncoding = encoding
	a.mu.Unlock()
	return content, nil
}

// ReadTextFileContent reads a text file without changing the active document state.
func (a *App) ReadTextFileContent(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}

	content, _, err := decodeTextData(data)
	if err != nil {
		return "", fmt.Errorf("不支持的二进制或文本编码: %w", err)
	}

	return content, nil
}

// WriteFile writes content to a file
func (a *App) WriteFile(path string, content string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	encoding := "utf-8"
	if strings.EqualFold(a.filePath, path) && a.fileEncoding != "" {
		encoding = a.fileEncoding
	}
	data, err := encodeTextData(content, encoding)
	if err != nil {
		return fmt.Errorf("按原编码保存失败: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}

	if info, err := os.Stat(path); err == nil {
		if strings.EqualFold(a.filePath, path) {
			a.lastModTime = info.ModTime()
			a.lastFileSize = info.Size()
			a.lastFileHash = sha256.Sum256(data)
		}
	}

	return nil
}

// WriteBase64File writes a base64 string or data URI to a binary file.
func (a *App) WriteBase64File(path string, content string) error {
	trimmed := strings.TrimSpace(content)
	if commaIndex := strings.Index(trimmed, ","); commaIndex >= 0 && strings.Contains(trimmed[:commaIndex], "base64") {
		trimmed = trimmed[commaIndex+1:]
	}

	data, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return fmt.Errorf("解析导出内容失败: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("写入导出文件失败: %w", err)
	}

	return nil
}

func decodeTextData(data []byte) (string, string, error) {
	if len(data) == 0 {
		return "", "utf-8", nil
	}
	if bytes.HasPrefix(data, []byte{0xef, 0xbb, 0xbf}) {
		return string(data[3:]), "utf-8-bom", nil
	}
	if bytes.HasPrefix(data, []byte{0xff, 0xfe}) {
		decoded, err := textunicode.UTF16(textunicode.LittleEndian, textunicode.ExpectBOM).NewDecoder().Bytes(data)
		return string(decoded), "utf-16le", err
	}
	if bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
		decoded, err := textunicode.UTF16(textunicode.BigEndian, textunicode.ExpectBOM).NewDecoder().Bytes(data)
		return string(decoded), "utf-16be", err
	}
	if utf8.Valid(data) && looksLikeDecodedText(string(data)) {
		return string(data), "utf-8", nil
	}

	if looksLikeUTF16(data, true) {
		decoded, err := textunicode.UTF16(textunicode.LittleEndian, textunicode.IgnoreBOM).NewDecoder().Bytes(data)
		if err == nil && looksLikeDecodedText(string(decoded)) {
			return string(decoded), "utf-16le-no-bom", nil
		}
	}
	if looksLikeUTF16(data, false) {
		decoded, err := textunicode.UTF16(textunicode.BigEndian, textunicode.IgnoreBOM).NewDecoder().Bytes(data)
		if err == nil && looksLikeDecodedText(string(decoded)) {
			return string(decoded), "utf-16be-no-bom", nil
		}
	}

	decoded, err := simplifiedchinese.GB18030.NewDecoder().Bytes(data)
	if err == nil && looksLikeDecodedText(string(decoded)) {
		return string(decoded), "gb18030", nil
	}
	return "", "", fmt.Errorf("文件包含无法识别的二进制内容")
}

func encodeTextData(content, encoding string) ([]byte, error) {
	switch encoding {
	case "utf-8-bom":
		return append([]byte{0xef, 0xbb, 0xbf}, []byte(content)...), nil
	case "utf-16le":
		return textunicode.UTF16(textunicode.LittleEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16be":
		return textunicode.UTF16(textunicode.BigEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16le-no-bom":
		return textunicode.UTF16(textunicode.LittleEndian, textunicode.IgnoreBOM).NewEncoder().Bytes([]byte(content))
	case "utf-16be-no-bom":
		return textunicode.UTF16(textunicode.BigEndian, textunicode.IgnoreBOM).NewEncoder().Bytes([]byte(content))
	case "gb18030":
		return simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(content))
	default:
		return []byte(content), nil
	}
}

func looksLikeUTF16(data []byte, littleEndian bool) bool {
	if len(data) < 4 {
		return false
	}
	limit := len(data) - len(data)%2
	zeroCount := 0
	for i := 0; i < limit; i += 2 {
		index := i + 1
		if !littleEndian {
			index = i
		}
		if data[index] == 0 {
			zeroCount++
		}
	}
	return zeroCount*2 >= limit/2
}

func looksLikeDecodedText(content string) bool {
	if content == "" {
		return true
	}
	controlCount := 0
	runeCount := 0
	for _, char := range content {
		runeCount++
		if char == '\u0000' {
			return false
		}
		if char < 0x20 && char != '\n' && char != '\r' && char != '\t' && char != '\f' {
			controlCount++
		}
	}
	return runeCount == 0 || controlCount*100/runeCount < 2
}
