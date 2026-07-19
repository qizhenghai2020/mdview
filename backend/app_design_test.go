package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDesignDraftRoundTripWithFilePath(t *testing.T) {
	tempDir := t.TempDir()
	sourcePath := filepath.Join(tempDir, "doc.md")
	app := NewApp()
	app.designDraftDir = filepath.Join(tempDir, "drafts")
	if err := os.MkdirAll(app.designDraftDir, 0o755); err != nil {
		t.Fatalf("mkdir draft dir: %v", err)
	}

	html := "<!DOCTYPE html><html><body><h1>draft</h1></body></html>"
	if err := app.SaveDesignDraft(sourcePath, "doc.html", html); err != nil {
		t.Fatalf("save draft: %v", err)
	}

	cleanSourcePath, normalizedKey, err := normalizeDesignDraftSourcePath(sourcePath)
	if err != nil {
		t.Fatalf("normalize source path: %v", err)
	}
	htmlPath := buildDesignDraftHTMLPath(app.designDraftDir, normalizedKey, cleanSourcePath)
	metaPath := buildDesignDraftMetaPath(app.designDraftDir, normalizedKey, cleanSourcePath)
	if _, err := os.Stat(htmlPath); err != nil {
		t.Fatalf("draft html not written: %v", err)
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("draft metadata not written: %v", err)
	}

	record, err := app.GetDesignDraft(sourcePath)
	if err != nil {
		t.Fatalf("get draft: %v", err)
	}
	if record == nil {
		t.Fatal("get draft returned nil")
	}
	if record.SourcePath != cleanSourcePath {
		t.Fatalf("source path = %q, want %q", record.SourcePath, cleanSourcePath)
	}
	if record.FileName != "doc.html" {
		t.Fatalf("file name = %q, want doc.html", record.FileName)
	}
	if record.HTML != html {
		t.Fatalf("html = %q, want %q", record.HTML, html)
	}

	if err := app.DeleteDesignDraft(sourcePath); err != nil {
		t.Fatalf("delete draft: %v", err)
	}
	if _, err := os.Stat(htmlPath); !os.IsNotExist(err) {
		t.Fatalf("draft html still exists, err = %v", err)
	}
	if _, err := os.Stat(metaPath); !os.IsNotExist(err) {
		t.Fatalf("draft metadata still exists, err = %v", err)
	}
}

func TestDesignDraftRoundTripWithFileNameOnly(t *testing.T) {
	tempDir := t.TempDir()
	sourceName := "Example Document.html"
	app := NewApp()
	app.designDraftDir = filepath.Join(tempDir, "drafts")
	if err := os.MkdirAll(app.designDraftDir, 0o755); err != nil {
		t.Fatalf("mkdir draft dir: %v", err)
	}

	html := "<!DOCTYPE html><html><body><p>name-only</p></body></html>"
	if err := app.SaveDesignDraft(sourceName, "", html); err != nil {
		t.Fatalf("save draft: %v", err)
	}

	record, err := app.GetDesignDraft(sourceName)
	if err != nil {
		t.Fatalf("get draft: %v", err)
	}
	if record == nil {
		t.Fatal("get draft returned nil")
	}
	if record.SourcePath != sourceName {
		t.Fatalf("source path = %q, want %q", record.SourcePath, sourceName)
	}
	if record.FileName != sourceName {
		t.Fatalf("file name = %q, want %q", record.FileName, sourceName)
	}
	if record.HTML != html {
		t.Fatalf("html = %q, want %q", record.HTML, html)
	}
}
