package backend

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// BuildFileWorkspace creates a sorted, bounded tree containing text files only.
func (a *App) BuildFileWorkspace(paths []string) (FileWorkspace, error) {
	workspace := FileWorkspace{Roots: []FileTreeNode{}}
	seen := make(map[string]struct{})

	for _, selectedPath := range paths {
		if workspace.Truncated {
			break
		}

		cleanPath, err := filepath.Abs(strings.TrimSpace(selectedPath))
		if err != nil || cleanPath == "" {
			workspace.SkippedCount++
			continue
		}

		key := strings.ToLower(filepath.Clean(cleanPath))
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		info, err := os.Stat(cleanPath)
		if err != nil {
			workspace.SkippedCount++
			continue
		}

		node, containsText := buildFileTreeNode(cleanPath, info, &workspace)
		if containsText || info.IsDir() {
			workspace.Roots = append(workspace.Roots, node)
		}
	}

	if len(workspace.Roots) == 0 && workspace.SkippedCount > 0 {
		return workspace, fmt.Errorf("所选内容中没有可打开的文本文件")
	}

	sortFileTreeNodes(workspace.Roots)
	return workspace, nil
}

func buildFileTreeNode(path string, info os.FileInfo, workspace *FileWorkspace) (FileTreeNode, bool) {
	node := FileTreeNode{
		Name:     info.Name(),
		Path:     path,
		IsDir:    info.IsDir(),
		Children: []FileTreeNode{},
	}

	if !info.IsDir() {
		if workspace.FileCount >= maxWorkspaceFiles {
			workspace.Truncated = true
			return node, false
		}
		if !isTextFile(path) {
			workspace.SkippedCount++
			return node, false
		}
		workspace.FileCount++
		return node, true
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		workspace.SkippedCount++
		return node, false
	}

	containsText := false
	for _, entry := range entries {
		if workspace.Truncated {
			break
		}
		if entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		if entry.IsDir() {
			if _, ignored := ignoredWorkspaceDirectories[strings.ToLower(entry.Name())]; ignored {
				continue
			}
		}

		childInfo, err := entry.Info()
		if err != nil {
			workspace.SkippedCount++
			continue
		}
		childPath := filepath.Join(path, entry.Name())
		child, childContainsText := buildFileTreeNode(childPath, childInfo, workspace)
		if childContainsText {
			node.Children = append(node.Children, child)
			containsText = true
		}
	}

	sortFileTreeNodes(node.Children)
	return node, containsText
}

func sortFileTreeNodes(nodes []FileTreeNode) {
	sort.SliceStable(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})
}

func isTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	if _, binary := binaryFileExtensions[ext]; binary {
		return false
	}

	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	sample := make([]byte, 8192)
	count, err := file.Read(sample)
	if err != nil && !errors.Is(err, io.EOF) {
		return false
	}
	if count == 0 {
		return true
	}

	_, _, decodeErr := decodeTextData(sample[:count])
	if decodeErr == nil {
		return true
	}
	_, knownText := textFileExtensions[ext]
	return knownText && !bytes.Contains(sample[:count], []byte{0})
}
