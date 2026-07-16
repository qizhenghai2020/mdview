# MD查看器

一款轻量级的 Markdown 与纯文本查看编辑器，基于 Wails (Go + Vue 3) 构建。

## 功能特性

- **实时预览** - 支持 Markdown 实时渲染
- **分屏编辑** - 编辑与预览同屏显示，支持滚动同步
- **目录导航** - 自动生成文档目录，支持点击跳转
- **文件目录树** - 可打开整个文件夹，逐级展开目录并点击切换文本文件
- **多文件浏览** - 支持打开或拖入多个文件，在左侧文件树中快速切换
- **文本文件支持** - 支持 Markdown、TXT、日志、配置、代码等常见文本格式
- **多主题切换** - 内置亮色、暗色、雅致三种主题
- **代码高亮** - 支持多种编程语言语法高亮
- **图表渲染** - 支持 Mermaid 流程图、时序图等
- **图片支持** - 自动解析相对路径图片
- **文件关联** - 可设置为 .md 文件默认打开程序
- **缩放功能** - 支持 50%-200% 内容缩放，也支持 `Ctrl+滚轮` 整体界面缩放
- **字体配置** - 内置阿里巴巴普惠体 3.0、思源黑体风格、思源宋体风格，并支持 Windows 常用字体
- **快捷键** - Ctrl+O 打开文件，Ctrl+S 保存

## 截图

![预览模式](screenshots/preview.png)
![分屏编辑](screenshots/split.png)
![计划任务](screenshots/task.png)

## 安装

### 下载

前往 [Releases](https://github.com/qizhenghai2020/mdview/releases) 页面下载最新版本。

### 从源码构建

**前置要求：**
- Go 1.18+
- Node.js 16+
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

**构建步骤：**

```bash
# 克隆仓库
git clone https://github.com/qizhenghai2020/mdview.git
cd mdview

# 安装依赖
cd frontend && npm install && cd ..

# 构建
wails build

# 生成的 exe 文件位于 build/bin/ 目录
```

## 使用说明

### 打开文件

- 点击工具栏「打开」按钮选择一个或多个文本文件
- 点击工具栏「文件夹」按钮打开包含多层目录的文本项目
- 使用快捷键 `Ctrl+O`
- 拖放一个或多个文本文件，或直接拖入文件夹
- 设置文件关联后双击 .md 文件

### 编辑与保存

- 点击工具栏「编辑」按钮切换到分屏编辑模式
- 编辑后左侧会显示「保存」按钮
- 使用 `Ctrl+S` 快捷键保存

### 文件与大纲导航

- 点击工具栏「导航」按钮显示/隐藏左侧栏
- 左侧「文件」页签可展开或收起文件夹，点击文件立即切换当前内容
- Markdown 文档可切换到「大纲」页签，点击标题跳转到对应章节
- 拖动目录边框调整宽度

### 主题切换

点击工具栏右侧主题按钮，循环切换：
- **亮色主题** - 经典白色背景
- **暗色主题** - 深色护眼模式
- **雅致主题** - 仿纸质阅读体验

## 技术栈

- **后端**: Go + Wails v2
- **前端**: Vue 3 + Vite
- **Markdown 解析**: marked
- **代码高亮**: highlight.js
- **图表渲染**: mermaid

## 许可证

[MIT License](LICENSE)

## 作者
qizhenghai
