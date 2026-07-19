package backend

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileWatchDetectsExternalChange(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "watch.md")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	changedTime := time.Now().Add(2 * time.Second)
	if err := os.WriteFile(path, []byte("after"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, changedTime, changedTime); err != nil {
		t.Fatalf("set changed time: %v", err)
	}
	changedInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat changed file: %v", err)
	}
	changedTime = changedInfo.ModTime()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastModTime.Equal(changedTime)
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect the external change")
}

func TestReadFileRestartsWatcherForNewPath(t *testing.T) {
	tempDir := t.TempDir()
	firstPath := filepath.Join(tempDir, "first.md")
	secondPath := filepath.Join(tempDir, "second.md")

	if err := os.WriteFile(firstPath, []byte("first"), 0644); err != nil {
		t.Fatalf("write first file: %v", err)
	}
	if err := os.WriteFile(secondPath, []byte("second"), 0644); err != nil {
		t.Fatalf("write second file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(firstPath); err != nil {
		t.Fatalf("watch first file: %v", err)
	}
	app.mu.Lock()
	firstGeneration := app.watchGeneration
	app.mu.Unlock()

	if _, err := app.ReadFileAndUpdateWatch(secondPath); err != nil {
		t.Fatalf("watch second file: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	app.mu.Lock()
	defer app.mu.Unlock()
	if app.filePath != secondPath {
		t.Fatalf("watching %q, want %q", app.filePath, secondPath)
	}
	if app.watchGeneration <= firstGeneration {
		t.Fatalf("watch generation did not advance: got %d, previous %d", app.watchGeneration, firstGeneration)
	}
}

func TestFileWatchDetectsSizeChangeWhenTimestampIsPreserved(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "same-time.md")
	if err := os.WriteFile(path, []byte("short"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	initialInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	if err := os.WriteFile(path, []byte("content with a different size"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, initialInfo.ModTime(), initialInfo.ModTime()); err != nil {
		t.Fatalf("restore modified time: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastFileSize != initialInfo.Size()
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect the size change")
}

func TestFileWatchDetectsContentChangeWhenSizeAndTimestampArePreserved(t *testing.T) {
	tempDir := t.TempDir()
	path := filepath.Join(tempDir, "same-metadata.md")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	initialInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat initial file: %v", err)
	}

	app := NewApp()
	if _, err := app.ReadFileAndUpdateWatch(path); err != nil {
		t.Fatalf("start file watch: %v", err)
	}
	t.Cleanup(app.StopFileWatch)

	initialHash := app.lastFileHash
	if err := os.WriteFile(path, []byte("after!"), 0644); err != nil {
		t.Fatalf("write changed file: %v", err)
	}
	if err := os.Chtimes(path, initialInfo.ModTime(), initialInfo.ModTime()); err != nil {
		t.Fatalf("restore modified time: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.mu.Lock()
		detected := app.lastFileHash != initialHash
		app.mu.Unlock()

		if detected {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("file watcher did not detect same-size content change")
}
