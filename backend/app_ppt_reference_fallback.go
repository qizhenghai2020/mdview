package backend

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"sort"
	"strings"
)

const maxLocalReferenceSamples = 6000

type pptLocalReferenceMetrics struct {
	sampleCount   int
	redSum        float64
	greenSum      float64
	blueSum       float64
	lumaSum       float64
	lumaSquare    float64
	saturationSum float64
	wideCount     int
	tallCount     int
	squareCount   int
	buckets       map[uint16]int
}

func isUnsupportedPptImageMessageError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	mentionsImageInput := false
	for _, marker := range []string{
		"image_url",
		"image url",
		"image input",
		"data:image/",
		"data url",
		"data-url",
		"base64 image",
	} {
		if strings.Contains(message, marker) {
			mentionsImageInput = true
			break
		}
	}
	if !mentionsImageInput {
		return false
	}
	for _, marker := range []string{
		"unknown variant",
		"unsupported",
		"not support",
		"does not support",
		"expected `text`",
		"expected \"text\"",
		"only support text",
		"data url",
		"data-url",
		"base64",
		"must be an http",
		"must be a http",
		"must use http",
		"only http",
		"only https",
		"remote image",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func analyzePptReferencesLocally(resources []string) (pptReferenceSpec, string, error) {
	if len(resources) == 0 {
		return pptReferenceSpec{}, "", fmt.Errorf("参考图列表为空")
	}

	metrics := pptLocalReferenceMetrics{buckets: make(map[uint16]int)}
	readableCount := 0
	for _, resource := range resources {
		data, err := readPptReferenceImageBytes(resource)
		if err != nil || len(data) == 0 {
			continue
		}
		picture, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			continue
		}
		readableCount++
		collectPptReferenceMetrics(&metrics, picture)
	}

	spec := buildLocalPptReferenceSpec(metrics, len(resources), readableCount)
	encoded, err := jsonMarshalPptReferenceSpec(spec)
	if err != nil {
		return pptReferenceSpec{}, "", err
	}
	return spec, encoded, nil
}

func readPptReferenceImageBytes(resource string) ([]byte, error) {
	resource = strings.TrimSpace(resource)
	if resource == "" {
		return nil, fmt.Errorf("参考图路径为空")
	}
	if strings.HasPrefix(strings.ToLower(resource), "data:image/") {
		return decodePptReferenceDataURL(resource)
	}
	if isRemoteImageResource(resource) {
		data, _, err := readRemoteImageResource(resource)
		return data, err
	}
	data, _, err := readLocalImageResource(resource)
	return data, err
}

func decodePptReferenceDataURL(value string) ([]byte, error) {
	separator := strings.IndexByte(value, ',')
	if separator < 0 {
		return nil, fmt.Errorf("参考图 Data URL 格式无效")
	}
	header := strings.ToLower(strings.TrimSpace(value[:separator]))
	if !strings.HasPrefix(header, "data:image/") || !strings.Contains(header, ";base64") {
		return nil, fmt.Errorf("参考图 Data URL 不是 Base64 图片")
	}
	payload := strings.TrimSpace(value[separator+1:])
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		data, err = base64.RawStdEncoding.DecodeString(payload)
	}
	if err != nil {
		return nil, fmt.Errorf("参考图 Base64 解码失败: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("参考图内容为空")
	}
	return data, nil
}

func collectPptReferenceMetrics(metrics *pptLocalReferenceMetrics, picture image.Image) {
	if metrics == nil || picture == nil {
		return
	}
	bounds := picture.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return
	}
	ratio := float64(width) / float64(height)
	switch {
	case ratio >= 1.25:
		metrics.wideCount++
	case ratio <= 0.8:
		metrics.tallCount++
	default:
		metrics.squareCount++
	}

	stride := 1
	area := float64(width * height)
	if area > maxLocalReferenceSamples {
		stride = int(math.Ceil(math.Sqrt(area / maxLocalReferenceSamples)))
	}
	for y := bounds.Min.Y; y < bounds.Max.Y; y += stride {
		for x := bounds.Min.X; x < bounds.Max.X; x += stride {
			pixel, ok := color.NRGBAModel.Convert(picture.At(x, y)).(color.NRGBA)
			if !ok || pixel.A < 38 {
				continue
			}
			r := float64(pixel.R)
			g := float64(pixel.G)
			b := float64(pixel.B)
			maxChannel := math.Max(r, math.Max(g, b))
			minChannel := math.Min(r, math.Min(g, b))
			saturation := 0.0
			if maxChannel > 0 {
				saturation = (maxChannel - minChannel) / maxChannel
			}
			luma := (0.2126*r + 0.7152*g + 0.0722*b) / 255
			metrics.sampleCount++
			metrics.redSum += r
			metrics.greenSum += g
			metrics.blueSum += b
			metrics.lumaSum += luma
			metrics.lumaSquare += luma * luma
			metrics.saturationSum += saturation
			key := uint16(int(pixel.R/32)<<8 | int(pixel.G/32)<<4 | int(pixel.B/32))
			metrics.buckets[key]++
		}
	}
}

func buildLocalPptReferenceSpec(metrics pptLocalReferenceMetrics, sourceCount, readableCount int) pptReferenceSpec {
	if metrics.sampleCount == 0 {
		return pptReferenceSpec{
			VisualDirection:    "采用克制、可编辑的信息设计，保留参考图的整体意图，不假设图片中的具体内容",
			BackgroundStrategy: "使用中性背景和清晰的信息层级，避免未经识别的图片内容成为事实",
			Typography:         "标题与正文保持明确字号层级，优先使用易读的无衬线字体",
			CardTreatment:      "使用轻边界和适度留白组织信息，避免堆叠大面积装饰卡片",
			ImageTreatment:     "将参考图视为风格线索，不直接复制图片中的文字、品牌或人物",
			LayoutRhythm:       []string{"封面突出主题", "内容页保持稳定栅格", "结尾页收束行动"},
			ContentSignals:     []string{fmt.Sprintf("已接收 %d 张参考图，其中 %d 张可读取", sourceCount, readableCount)},
			Avoid:              []string{"不复制图片文字、Logo、品牌或具体事实", "不根据未识别内容臆造数据"},
		}
	}

	count := float64(metrics.sampleCount)
	averageLuma := metrics.lumaSum / count
	averageSaturation := metrics.saturationSum / count
	variance := math.Max(0, metrics.lumaSquare/count-averageLuma*averageLuma)
	contrast := math.Sqrt(variance)
	dark := averageLuma < 0.46
	bright := averageLuma > 0.68
	contrastLabel := "柔和"
	if contrast >= 0.18 {
		contrastLabel = "鲜明"
	}
	colorLabel := "低饱和"
	if averageSaturation >= 0.42 {
		colorLabel = "高饱和"
	}
	toneLabel := "中性明亮"
	if dark {
		toneLabel = "深色"
	} else if bright {
		toneLabel = "明亮"
	}

	background := "以浅色背景为主，使用深色文字和少量强调色"
	typography := "使用深色无衬线标题与舒适行距，重点文字保持清晰对比"
	if dark {
		background = "以深色背景为主，使用高明度文字和少量强调色"
		typography = "使用高明度无衬线标题与克制正文，保持文字和背景的高对比"
	}
	if !dark && !bright {
		background = "使用中性背景与分层色块，保持内容区域有足够留白"
	}

	cardTreatment := "使用轻边界、低圆角和充足留白组织信息"
	if contrast >= 0.18 {
		cardTreatment = "使用明确的色块对比和低圆角容器建立信息层级"
	}
	imageTreatment := "优先采用横向主视觉和稳定栅格，保持页面节奏清晰"
	if metrics.tallCount > metrics.wideCount && metrics.tallCount >= metrics.squareCount {
		imageTreatment = "采用纵向视觉焦点与分栏构图，避免内容拥挤"
	} else if metrics.squareCount > metrics.wideCount && metrics.squareCount > metrics.tallCount {
		imageTreatment = "采用模块化构图和均衡留白，适合卡片与重点信息并置"
	}

	return pptReferenceSpec{
		VisualDirection:    fmt.Sprintf("以%s、%s和%s为视觉基调，强调明确主次、留白和可编辑的信息结构", toneLabel, colorLabel, contrastLabel),
		Palette:            localPptReferencePalette(metrics),
		BackgroundStrategy: background,
		Typography:         typography,
		CardTreatment:      cardTreatment,
		ImageTreatment:     imageTreatment,
		LayoutRhythm:       []string{"封面保留主视觉呼吸空间", "内容页沿稳定栅格组织信息", "重点页用高对比焦点强化结论"},
		ContentSignals:     []string{fmt.Sprintf("本地提取了 %d 张图片的色彩、明暗和构图线索", readableCount), "不将图片文字或品牌内容作为事实"},
		Avoid:              []string{"不复制图片中的文字、Logo、品牌或人物身份", "不根据图片内容臆造数据或来源"},
	}
}

func localPptReferencePalette(metrics pptLocalReferenceMetrics) []string {
	type colorBucket struct {
		key   uint16
		count int
	}
	buckets := make([]colorBucket, 0, len(metrics.buckets))
	for key, count := range metrics.buckets {
		buckets = append(buckets, colorBucket{key: key, count: count})
	}
	sort.SliceStable(buckets, func(left, right int) bool {
		if buckets[left].count == buckets[right].count {
			return buckets[left].key < buckets[right].key
		}
		return buckets[left].count > buckets[right].count
	})

	palette := make([]string, 0, 6)
	chosen := make([][3]int, 0, 6)
	for _, bucket := range buckets {
		r := int((bucket.key>>8)&0x0F) * 32
		g := int((bucket.key>>4)&0x0F) * 32
		b := int(bucket.key&0x0F) * 32
		candidate := [3]int{r, g, b}
		tooClose := false
		for _, colorValue := range chosen {
			if localPptColorDistance(candidate, colorValue) < 42 {
				tooClose = true
				break
			}
		}
		if tooClose {
			continue
		}
		chosen = append(chosen, candidate)
		palette = append(palette, fmt.Sprintf("#%02X%02X%02X", r, g, b))
		if len(palette) >= 6 {
			break
		}
	}
	return palette
}

func localPptColorDistance(left, right [3]int) float64 {
	red := float64(left[0] - right[0])
	green := float64(left[1] - right[1])
	blue := float64(left[2] - right[2])
	return math.Sqrt(red*red + green*green + blue*blue)
}

func jsonMarshalPptReferenceSpec(spec pptReferenceSpec) (string, error) {
	encoded, err := json.Marshal(spec)
	if err != nil {
		return "", fmt.Errorf("本地参考图分析结果编码失败: %w", err)
	}
	return string(encoded), nil
}
