package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	winoptions "github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	// 检查命令行参数，获取要打开的文件路径
	args := os.Args
	if len(args) > 1 {
		filePath := strings.Trim(args[1], "\"")
		app.SetStartupArg(filePath)
	}

	err := wails.Run(&options.App{
		Title:            "MD 查看器",
		Width:            1200,
		Height:           800,
		MinWidth:         800,
		MinHeight:        600,
		Frameless:        true,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		Windows: &winoptions.Options{
			Theme:                             winoptions.SystemDefault,
			IsZoomControlEnabled:              true,
			DisableFramelessWindowDecorations: false,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
		StartHidden: true,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
