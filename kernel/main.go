package main

import (
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/api"
	"github.com/billadm/logger"
	"github.com/billadm/server"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
)

func main() {
	var err error
	err = util.NewBilladmConfigFromFlags()
	if err != nil {
		logrus.Fatalf("解析命令行选项 %v", err)
	}
	err = logger.Init(util.Config.LogLevel)
	if err != nil {
		logrus.Fatalf("初始化日志模块失败 %v", err)
	}
	logrus.Info("--------- 启动Billadm ---------")
	gin.SetMode(util.Config.Mode)
	ginServer := server.NewGinServer()
	mgr := workspace.NewWsManager()
	handlers := server.InitServices(mgr)
	api.ServeAPI(ginServer, handlers)
	if err := ginServer.Run("127.0.0.1:" + util.Config.Port); err != nil {
		logrus.Errorf("启动Billadm失败 %v", err)
		return
	}
}
