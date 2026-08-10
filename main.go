package main

import (
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	winoptions "github.com/wailsapp/wails/v2/pkg/options/windows"
	"mdviewer/backend"
	"os"
	"strings"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := backend.NewApp()

	args := os.Args[1:]
	isDesignExportWindow := false
	for i := 0; i < len(args); i++ {
		arg := strings.Trim(args[i], "\"")
		if arg == "--design-export" && i+1 < len(args) {
			isDesignExportWindow = true
			app.SetDesignExportStartupArg(strings.Trim(args[i+1], "\""))
			i++
			continue
		}
		if strings.HasPrefix(arg, "--") {
			continue
		}
		if !isDesignExportWindow {
			app.SetStartupArg(arg)
		}
	}

	title := "MD 查看器"
	width := 1200
	height := 800
	minWidth := 800
	minHeight := 600
	if isDesignExportWindow {
		title = "HTML设计器"
		width = 1280
		height = 820
		minWidth = 960
		minHeight = 640
	}

	err := wails.Run(&options.App{
		Title:     title,
		Width:     width,
		Height:    height,
		MinWidth:  minWidth,
		MinHeight: minHeight,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: backend.PptArtifactAssetHandler(app),
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		Windows: &winoptions.Options{
			Theme:                             winoptions.SystemDefault,
			IsZoomControlEnabled:              true,
			DisableFramelessWindowDecorations: false,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		OnStartup:  backend.StartupHandler(app),
		OnShutdown: backend.ShutdownHandler(app),
		Bind: []interface{}{
			app,
		},
		StartHidden: true,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
