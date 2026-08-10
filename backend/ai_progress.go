package backend

import (
	"context"
	"fmt"
	"time"
)

type aiProgressReporter struct {
	app                    *App
	kind                   string
	startedAt              time.Time
	endpoint               string
	requestBytes           int
	lastStreamContentChars int
	lastStreamProgressAt   int64
	jobID                  string
	batchID                string
	volumeIndex            int
	currentSlide           int
	completedSlides        int
	totalSlides            int
	attempt                int
}

func newAIProgressReporter(app *App, kind string) *aiProgressReporter {
	return &aiProgressReporter{
		app:       app,
		kind:      kind,
		startedAt: time.Now(),
	}
}

func newPptProgressReporter(app *App, jobID, batchID string, volumeIndex, currentSlide, completedSlides, totalSlides, attempt int) *aiProgressReporter {
	reporter := newAIProgressReporter(app, "presentation")
	reporter.jobID = jobID
	reporter.batchID = batchID
	reporter.volumeIndex = volumeIndex
	reporter.currentSlide = currentSlide
	reporter.completedSlides = completedSlides
	reporter.totalSlides = totalSlides
	reporter.attempt = attempt
	return reporter
}

type aiContentLifecycleOptions struct {
	requestContext             context.Context
	streamMessage              string
	requestFailureMessage      string
	requestErrorPrefix         string
	timeoutError               func(int) error
	interfaceFailureMessage    string
	explicitFailureMessage     string
	httpErrorFormat            string
	parsingMessage             string
	contentParseFailureMessage string
	contentExtractedMessage    string
	extractContent             func(aiExecutionResult) (string, string, error)
}

func (r *aiProgressReporter) elapsedMs() int64 {
	if r == nil {
		return 0
	}
	return time.Since(r.startedAt).Milliseconds()
}

func (r *aiProgressReporter) endpointFor(execution *aiExecutionResult) string {
	if execution != nil && execution.Endpoint != "" {
		return execution.Endpoint
	}
	return r.endpoint
}

func (r *aiProgressReporter) statusFor(execution *aiExecutionResult) int {
	if execution == nil {
		return 0
	}
	return execution.StatusCode
}

func (r *aiProgressReporter) responseBytesFor(execution *aiExecutionResult) int {
	if execution == nil {
		return 0
	}
	return len(execution.ResponseBody)
}

func (r *aiProgressReporter) emit(event AIFormatProgressEvent) {
	if r == nil {
		return
	}
	event.Kind = r.kind
	event.JobID = r.jobID
	event.BatchID = r.batchID
	event.VolumeIndex = r.volumeIndex
	event.CurrentSlide = r.currentSlide
	event.CompletedSlides = r.completedSlides
	event.TotalSlides = r.totalSlides
	event.Attempt = r.attempt
	r.app.emitAIFormatProgress(event)
}

func (r *aiProgressReporter) emitStarted(message, detail string) {
	r.emit(AIFormatProgressEvent{
		Stage:     "started",
		Message:   message,
		Detail:    detail,
		ElapsedMs: 0,
	})
}

func (r *aiProgressReporter) emitFailure(message, detail string, execution *aiExecutionResult) {
	r.emit(AIFormatProgressEvent{
		Stage:         "failed",
		Message:       message,
		Detail:        detail,
		Endpoint:      r.endpointFor(execution),
		StatusCode:    r.statusFor(execution),
		ResponseBytes: r.responseBytesFor(execution),
		ElapsedMs:     r.elapsedMs(),
	})
}

func (r *aiProgressReporter) emitRequestPrepared(endpoint string, requestBytes int) {
	r.endpoint = endpoint
	r.requestBytes = requestBytes
	r.emit(AIFormatProgressEvent{
		Stage:        "request-prepared",
		Message:      "请求体已生成",
		Detail:       fmt.Sprintf("接口：%s", endpoint),
		Endpoint:     endpoint,
		RequestBytes: requestBytes,
		ElapsedMs:    r.elapsedMs(),
	})
}

func (r *aiProgressReporter) emitRequestDispatched(detail string) {
	r.emit(AIFormatProgressEvent{
		Stage:     "request-dispatched",
		Message:   "已发出请求，等待模型响应",
		Detail:    detail,
		Endpoint:  r.endpoint,
		ElapsedMs: r.elapsedMs(),
	})
}

func (r *aiProgressReporter) buildStreamHandler(message string) func(aiStreamProgress) {
	return func(progress aiStreamProgress) {
		if progress.ContentChars <= 0 || progress.ContentChars == r.lastStreamContentChars {
			return
		}

		elapsedMs := r.elapsedMs()
		if r.lastStreamProgressAt > 0 &&
			elapsedMs-r.lastStreamProgressAt < 120 &&
			progress.ContentChars-r.lastStreamContentChars < 80 {
			return
		}

		r.lastStreamContentChars = progress.ContentChars
		r.lastStreamProgressAt = elapsedMs
		r.emit(AIFormatProgressEvent{
			Stage:        "stream-chunk",
			Message:      message,
			Detail:       fmt.Sprintf("已累计接收 %d 字", progress.ContentChars),
			Endpoint:     r.endpoint,
			RequestBytes: r.requestBytes,
			ContentChars: progress.ContentChars,
			DeltaChars:   progress.DeltaChars,
			ElapsedMs:    elapsedMs,
		})
	}
}

func (r *aiProgressReporter) emitResponseReceived(execution aiExecutionResult) {
	r.emit(AIFormatProgressEvent{
		Stage:         "response-received",
		Message:       "已收到模型响应",
		Detail:        fmt.Sprintf("HTTP %d", execution.StatusCode),
		Endpoint:      execution.Endpoint,
		StatusCode:    execution.StatusCode,
		RequestBytes:  r.requestBytes,
		ResponseBytes: len(execution.ResponseBody),
		ElapsedMs:     r.elapsedMs(),
	})
}

func (r *aiProgressReporter) emitParsing(message string, execution aiExecutionResult) {
	r.emit(AIFormatProgressEvent{
		Stage:         "parsing-response",
		Message:       message,
		Endpoint:      execution.Endpoint,
		StatusCode:    execution.StatusCode,
		ResponseBytes: len(execution.ResponseBody),
		ElapsedMs:     r.elapsedMs(),
	})
}

func (r *aiProgressReporter) emitContentExtracted(message, contentPath string, contentChars int, execution aiExecutionResult) {
	r.emit(AIFormatProgressEvent{
		Stage:         "content-extracted",
		Message:       message,
		Detail:        fmt.Sprintf("内容路径：%s", contentPath),
		Endpoint:      execution.Endpoint,
		StatusCode:    execution.StatusCode,
		ResponseBytes: len(execution.ResponseBody),
		ContentChars:  contentChars,
		ContentPath:   contentPath,
		ElapsedMs:     r.elapsedMs(),
	})
}

func (r *aiProgressReporter) emitCompleted(message, detail string, contentChars int, execution aiExecutionResult) {
	r.emit(AIFormatProgressEvent{
		Stage:        "completed",
		Message:      message,
		Detail:       detail,
		Endpoint:     execution.Endpoint,
		StatusCode:   execution.StatusCode,
		ContentChars: contentChars,
		ElapsedMs:    r.elapsedMs(),
	})
}

func (a *App) executeAIContentLifecycle(
	model AIModelConfig,
	endpoint string,
	body []byte,
	timeout int,
	limit int64,
	progress *aiProgressReporter,
	options aiContentLifecycleOptions,
) (aiExecutionResult, string, string, error) {
	if progress != nil {
		progress.emitRequestPrepared(endpoint, len(body))
		progress.emitRequestDispatched(fmt.Sprintf("超时上限：%d 秒", timeout))
	}

	extractContent := options.extractContent
	if extractContent == nil {
		extractContent = extractAIExecutionContent
	}

	var onProgress func(aiStreamProgress)
	if progress != nil {
		onProgress = progress.buildStreamHandler(options.streamMessage)
	}

	execution, err := a.executeAIRequestWithContext(
		options.requestContext,
		model,
		endpoint,
		body,
		timeout,
		limit,
		onProgress,
	)
	if err != nil {
		if progress != nil {
			progress.emitFailure(options.requestFailureMessage, err.Error(), nil)
		}
		if isTimeoutError(err) {
			if options.timeoutError != nil {
				return execution, "", "", options.timeoutError(timeout)
			}
			return execution, "", "", formatAITimeoutError(timeout)
		}
		return execution, "", "", fmt.Errorf("%s: %w", options.requestErrorPrefix, err)
	}

	if progress != nil {
		progress.emitResponseReceived(execution)
	}

	if failureMessage, failureDetail, failureErr, failed := resolveAIExecutionFailure(
		execution,
		options.interfaceFailureMessage,
		options.explicitFailureMessage,
		options.httpErrorFormat,
	); failed {
		if progress != nil {
			progress.emitFailure(failureMessage, failureDetail, &execution)
		}
		return execution, "", "", failureErr
	}

	if progress != nil {
		progress.emitParsing(options.parsingMessage, execution)
	}

	content, contentPath, err := extractContent(execution)
	if err != nil {
		if progress != nil {
			progress.emitFailure(options.contentParseFailureMessage, err.Error(), &execution)
		}
		return execution, "", "", err
	}

	if progress != nil {
		progress.emitContentExtracted(options.contentExtractedMessage, contentPath, len(content), execution)
	}

	return execution, content, contentPath, nil
}
