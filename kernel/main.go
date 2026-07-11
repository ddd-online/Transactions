package main

import (
	"os"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/api"
	"github.com/billadm/logger"
	"github.com/billadm/server"
	"github.com/billadm/util"
)

func main() {
	logrus.Warnf("Args: %v", os.Args)
	var err error
	// 解析命令行选项
	err = util.NewBilladmConfigFromFlags()
	if err != nil {
		logrus.Fatalf("解析命令行选项 %v", err)
	}
	// 设置日志级别
	err = logger.Init(util.Config.LogLevel)
	if err != nil {
		logrus.Fatalf("初始化日志模块失败 %v", err)
	}
	// 启动服务器
	logrus.Info("--------- 启动Billadm ---------")
	gin.SetMode(util.Config.Mode)
	ginServer := server.NewGinServer()
	// 初始化依赖注入 — 返回注入好的 handlers
	handlers := server.InitServices()
	// 注册接口
	api.ServeAPI(ginServer, handlers)
	if err := ginServer.Run("127.0.0.1:" + util.Config.Port); err != nil {
		logrus.Errorf("启动Billadm失败 %v", err)
		return
	}
}
