package backend

import (
	"context"
	"crypto/sha256"
	"fmt"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"time"
)

// StartFileWatch starts watching the current file for changes
func (a *App) StartFileWatch() {
	a.mu.Lock()
	a.stopFileWatchLocked()

	path := a.filePath
	appCtx := a.ctx
	if path == "" {
		a.mu.Unlock()
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		a.mu.Unlock()
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		a.mu.Unlock()
		return
	}
	a.lastModTime = info.ModTime()
	a.lastFileSize = info.Size()
	a.lastFileHash = sha256.Sum256(data)

	watchCtx, cancel := context.WithCancel(context.Background())
	a.watchCancel = cancel
	generation := a.watchGeneration
	a.mu.Unlock()

	go func(watchedPath string, watchedGeneration uint64) {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		var candidateHash [sha256.Size]byte
		candidateSeen := false

		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				data, err := os.ReadFile(watchedPath)
				if err != nil {
					continue
				}
				info, err := os.Stat(watchedPath)
				if err != nil {
					continue
				}
				currentHash := sha256.Sum256(data)

				a.mu.Lock()
				if a.watchGeneration != watchedGeneration || a.filePath != watchedPath {
					a.mu.Unlock()
					return
				}

				if currentHash == a.lastFileHash {
					a.lastModTime = info.ModTime()
					a.lastFileSize = info.Size()
					candidateSeen = false
					a.mu.Unlock()
					continue
				}

				// Wait for the same content twice so an editor's in-progress write is not loaded.
				if !candidateSeen || currentHash != candidateHash {
					candidateHash = currentHash
					candidateSeen = true
					a.mu.Unlock()
					continue
				}

				if currentHash != a.lastFileHash {
					a.lastModTime = info.ModTime()
					a.lastFileSize = info.Size()
					a.lastFileHash = currentHash
					candidateSeen = false
					a.mu.Unlock()

					if appCtx != nil {
						runtime.EventsEmit(appCtx, "file-changed", watchedPath)
					}
					continue
				}

				a.mu.Unlock()
			}
		}
	}(path, generation)
}

// StopFileWatch stops watching the current file
func (a *App) StopFileWatch() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopFileWatchLocked()
}

func (a *App) stopFileWatchLocked() {
	a.watchGeneration++
	if a.watchCancel != nil {
		a.watchCancel()
		a.watchCancel = nil
	}
}

// ReadFileAndUpdateWatch reads file and starts watching it
func (a *App) ReadFileAndUpdateWatch(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	content, encoding, err := decodeTextData(data)
	if err != nil {
		return "", fmt.Errorf("不支持的二进制或文本编码: %w", err)
	}

	var modTime time.Time
	if info, err := os.Stat(path); err == nil {
		modTime = info.ModTime()
	}

	// 只有读取成功后才替换 watcher，避免外部编辑器原子写入期间丢失监听。
	a.StopFileWatch()

	a.mu.Lock()
	a.filePath = path
	a.fileEncoding = encoding
	if !modTime.IsZero() {
		a.lastModTime = modTime
	}
	a.lastFileSize = int64(len(data))
	a.lastFileHash = sha256.Sum256(data)
	a.mu.Unlock()

	// 开始监听
	a.StartFileWatch()

	return content, nil
}
