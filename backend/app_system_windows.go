package backend

import (
	"fmt"
	"golang.org/x/sys/windows/registry"
	"os"
	"os/exec"
	"syscall"
)

// GetExePath returns the path of the current executable
func (a *App) GetExePath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}

// IsFileAssociationSet checks if .md files are associated with this app
func (a *App) IsFileAssociationSet() bool {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Classes\mdviewer.mdfile\shell\open\command`, registry.READ)
	if err != nil {
		return false
	}
	defer key.Close()
	return true
}

// RegisterFileAssociation registers .md file association with this app
func (a *App) RegisterFileAssociation() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取程序路径: %w", err)
	}

	// 使用管理员权限执行注册
	cmd := exec.Command("powershell", "-Command", fmt.Sprintf(`
		# 注册应用程序
		New-Item -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\Applications\mdviewer.exe\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 注册文件类型
		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile' -Value 'Markdown 文档' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\DefaultIcon' -Value '"%s",0' | Out-Null

		New-Item -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Force | Out-Null
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\mdviewer.mdfile\shell\open\command' -Value '"%s" "%%1"' | Out-Null

		# 关联 .md 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.md\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		# 关联 .markdown 文件
		Set-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown' -Value 'mdviewer.mdfile' -ErrorAction SilentlyContinue | Out-Null
		New-ItemProperty -Path 'HKLM:\SOFTWARE\Classes\.markdown\OpenWithProgids' -Name 'mdviewer.mdfile' -Value '' -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null

		Write-Host "success"
	`, exePath, exePath, exePath))
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("注册失败: %w, 输出: %s", err, string(output))
	}

	return nil
}
