package backend

import (
	"bytes"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildFileWorkspaceIncludesTextAndSkipsBinary(t *testing.T) {
	tempDir := t.TempDir()
	nestedDir := filepath.Join(tempDir, "docs", "nested")
	ignoredDir := filepath.Join(tempDir, "node_modules", "package")
	if err := os.MkdirAll(nestedDir, 0755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	if err := os.MkdirAll(ignoredDir, 0755); err != nil {
		t.Fatalf("create ignored directory: %v", err)
	}

	files := map[string][]byte{
		filepath.Join(tempDir, "docs", "readme.md"): []byte("# Readme"),
		filepath.Join(nestedDir, "config.json"):     []byte(`{"ok":true}`),
		filepath.Join(tempDir, "docs", "image.png"): {0x89, 0x50, 0x4e, 0x47, 0x00},
		filepath.Join(ignoredDir, "ignored.js"):     []byte("ignored"),
	}
	for path, content := range files {
		if err := os.WriteFile(path, content, 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	workspace, err := NewApp().BuildFileWorkspace([]string{tempDir})
	if err != nil {
		t.Fatalf("build workspace: %v", err)
	}
	if workspace.FileCount != 2 {
		t.Fatalf("file count = %d, want 2", workspace.FileCount)
	}
	if len(workspace.Roots) != 1 || !workspace.Roots[0].IsDir {
		t.Fatalf("unexpected workspace roots: %#v", workspace.Roots)
	}
	if workspaceContainsPath(workspace.Roots, filepath.Join(ignoredDir, "ignored.js")) {
		t.Fatal("ignored directory content was included")
	}
	if workspaceContainsPath(workspace.Roots, filepath.Join(tempDir, "docs", "image.png")) {
		t.Fatal("binary file was included")
	}
}

func TestReadAndWriteTextFilePreservesEncoding(t *testing.T) {
	testCases := []struct {
		name     string
		encoding string
		encode   func(string) ([]byte, error)
	}{
		{
			name:     "UTF-8 BOM",
			encoding: "utf-8-bom",
			encode: func(content string) ([]byte, error) {
				return append([]byte{0xef, 0xbb, 0xbf}, []byte(content)...), nil
			},
		},
		{
			name:     "UTF-16 LE",
			encoding: "utf-16le",
			encode: func(content string) ([]byte, error) {
				return textunicode.UTF16(textunicode.LittleEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(content))
			},
		},
		{
			name:     "GB18030",
			encoding: "gb18030",
			encode: func(content string) ([]byte, error) {
				return simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(content))
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "document.txt")
			initialBytes, err := testCase.encode("第一行\n第二行")
			if err != nil {
				t.Fatalf("encode initial content: %v", err)
			}
			if err := os.WriteFile(path, initialBytes, 0644); err != nil {
				t.Fatalf("write initial file: %v", err)
			}

			app := NewApp()
			content, err := app.ReadFile(path)
			if err != nil {
				t.Fatalf("read text file: %v", err)
			}
			if content != "第一行\n第二行" {
				t.Fatalf("decoded content = %q", content)
			}
			if app.fileEncoding != testCase.encoding {
				t.Fatalf("encoding = %q, want %q", app.fileEncoding, testCase.encoding)
			}

			if err := app.WriteFile(path, "已修改"); err != nil {
				t.Fatalf("write text file: %v", err)
			}
			writtenBytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read written bytes: %v", err)
			}
			expectedBytes, err := testCase.encode("已修改")
			if err != nil {
				t.Fatalf("encode expected content: %v", err)
			}
			if !bytes.Equal(writtenBytes, expectedBytes) {
				t.Fatalf("written bytes did not preserve %s", testCase.name)
			}
		})
	}
}
