# Transactions

一款桌面端记账工具

# 简介

# 安装

# 调试

### 自行打包

下载项目后，进入`build`目录，先执行ps1脚本`clean.ps1`，再执行ps1脚本`build.ps1`

在`electron`目录下会生成`out`目录，其中存在打包后的安装程序

### 热更新调试

使用vue的热更新能力，需要以下三个步骤，打开三个powershell窗口，分别执行：

1. `kernel`目录下执行`go run main.go`，启动`go`服务
2. `app`目录下执行`npm run dev`，启动`vue`服务
3. `electron`目录下执行`npm run dev`，启动`electron`服务
