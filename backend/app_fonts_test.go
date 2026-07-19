package backend

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListExternalFontsReadsFontsFromWorkingDirectory(t *testing.T) {
	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}

	tempDir := t.TempDir()
	fontsDir := filepath.Join(tempDir, "fonts")
	if err := os.MkdirAll(fontsDir, 0755); err != nil {
		t.Fatalf("create fonts directory: %v", err)
	}

	fontPath := filepath.Join(fontsDir, "My_Test_Font.ttf")
	if err := os.WriteFile(fontPath, []byte("dummy-font-data"), 0644); err != nil {
		t.Fatalf("write font file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fontsDir, "ignore.txt"), []byte("skip"), 0644); err != nil {
		t.Fatalf("write unsupported file: %v", err)
	}

	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("change working directory: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(workingDir)
	})

	fonts, err := NewApp().ListExternalFonts()
	if err != nil {
		t.Fatalf("list external fonts: %v", err)
	}
	if len(fonts) != 1 {
		t.Fatalf("font count = %d, want 1", len(fonts))
	}

	font := fonts[0]
	if font.Family != "My Test Font" {
		t.Fatalf("font family = %q, want %q", font.Family, "My Test Font")
	}
	if font.Value != "external:My%20Test%20Font" {
		t.Fatalf("font value = %q", font.Value)
	}
	if font.Stack != "\"My Test Font\", sans-serif" {
		t.Fatalf("font stack = %q", font.Stack)
	}
	if font.Source != "truetype" {
		t.Fatalf("font source = %q, want truetype", font.Source)
	}
	if !strings.Contains(font.Label, "外部") {
		t.Fatalf("font label = %q, want external marker", font.Label)
	}
	if !strings.HasPrefix(font.DataURL, "data:font/ttf;base64,") {
		t.Fatalf("font data url prefix mismatch: %q", font.DataURL)
	}
}
