# Transactions

一款桌面端记账工具

# 简介

# 安装

# 调试

### 构建脚本

项目在 `build/` 目录下提供三个 PowerShell 脚本，按顺序使用：

| 脚本 | 用途 | 产物 |
|------|------|------|
| `.\build\clean.ps1` | 清理所有构建产物和临时文件 | — |
| `.\build\build.ps1` | 一键构建：Vue 前端 → Go 后端 → Electron 打包 | `build\target\Transactions-*-v{version}.exe` |
| `.\build\release.ps1` | 将打包产物发布到 GitHub Release | 创建 Git tag + GitHub Release |

**典型工作流：**
```powershell
.\build\clean.ps1    # 清理旧的构建产物
.\build\build.ps1    # 构建 + 打包（Vue + Go + Electron）
.\build\release.ps1  # 发布到 GitHub Release（需先安装 gh CLI 并登录）
```

> `release.ps1` 不负责构建，只发布已存在的产物。如果产物不存在，脚本会提示先运行 `build.ps1`。

### 热更新调试

使用vue的热更新能力，推荐使用一键启动方式：

```powershell
npm run dev    # 在项目根目录执行，同时启动 Go 后端 + Vue 前端 + Electron
```

Go 后端没有热重载，修改 Go 代码后需要 Ctrl+C 重新 `npm run dev`。

也可以分开启动（三个终端窗口）：

1. `kernel`目录下执行`go run main.go`，启动`go`服务
2. `app`目录下执行`npm run dev`，启动`vue`服务
3. `electron`目录下执行`npm run dev`，启动`electron`服务
