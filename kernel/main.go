package main

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/transactions/api"
	"github.com/transactions/logger"
	"github.com/transactions/server"
	"github.com/transactions/util"
	"github.com/transactions/workspace"
)

func main() {
	var err error
	err = util.NewTransactionsConfigFromFlags()
	if err != nil {
		logrus.Fatalf("解析命令行选项 %v", err)
	}
	err = logger.Init(util.Config.LogLevel)
	if err != nil {
		logrus.Fatalf("初始化日志模块失败 %v", err)
	}
	logrus.Info("--------- 启动Transactions ---------")
	gin.SetMode(util.Config.Mode)
	ginServer := server.NewGinServer(util.Config.APIToken)
	mgr := workspace.NewWsManager()
	handlers := server.InitServices(mgr)
	api.ServeAPI(ginServer, handlers)

	// 优雅退出：收到 Ctrl+C / 系统关机 / taskkill（无 /F）时，
	// 也先关闭工作空间数据库（WAL checkpoint），而不是直接终止进程。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var closeOnce sync.Once
	gracefulExit := func(reason string) {
		closeOnce.Do(func() {
			logrus.Infof("--------- 退出Transactions (%s) ---------", reason)
			mgr.Close()
			// 给 HTTP 响应与在途请求一点收尾时间
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		})
	}

	go func() {
		<-ctx.Done()
		gracefulExit("收到退出信号")
	}()

	if err := ginServer.Run("127.0.0.1:" + util.Config.Port); err != nil {
		logrus.Errorf("启动Transactions失败 %v", err)
		gracefulExit("HTTP 服务退出")
	}
}
