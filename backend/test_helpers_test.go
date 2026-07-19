package backend

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func writeChatCompletion(t *testing.T, responseWriter http.ResponseWriter, content string) {
	t.Helper()
	responseWriter.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(responseWriter).Encode(map[string]any{
		"choices": []map[string]any{
			{"message": map[string]string{"role": "assistant", "content": content}},
		},
	}); err != nil {
		t.Errorf("write chat completion: %v", err)
	}
}

func workspaceContainsPath(nodes []FileTreeNode, targetPath string) bool {
	for _, node := range nodes {
		if strings.EqualFold(node.Path, targetPath) || workspaceContainsPath(node.Children, targetPath) {
			return true
		}
	}
	return false
}
