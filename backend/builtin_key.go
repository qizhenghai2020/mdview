package backend

import "strings"

var builtinDefaultAPIKey string

const builtinDefaultBaseURL = "https://token.sensenova.cn/v1"
const builtinDefaultModelName = "sensenova-6.7-flash-lite"

func withBuiltinDefaultAPIKey(model AIModelConfig) AIModelConfig {
	if strings.TrimSpace(model.APIKey) != "" || !isBuiltinDefaultAIModel(model) {
		return model
	}

	if key := strings.TrimSpace(builtinDefaultAPIKey); key != "" {
		model.APIKey = key
	}
	return model
}

func isBuiltinDefaultAIModel(model AIModelConfig) bool {
	baseURL := strings.TrimRight(strings.TrimSpace(model.BaseURL), "/")
	return strings.EqualFold(baseURL, builtinDefaultBaseURL) &&
		strings.TrimSpace(model.Model) == builtinDefaultModelName
}
