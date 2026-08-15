// Package logger
package logger

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"

	"github.com/sirupsen/logrus"
)

// logFileMu 保护日志文件输出句柄的并发切换（工作空间打开/切换时）。
var (
	logFileMu   sync.RWMutex
	logFile     *os.File
	logFileName = "transactions.log"
)

func init() {
	logrus.StandardLogger().SetOutput(os.Stdout)
	logrus.StandardLogger().SetLevel(logrus.DebugLevel)
	logrus.StandardLogger().SetFormatter(&CustomFormatter{})
}

// Init 初始化日志配置
func Init(level string) error {
	// 设置日志级别
	logLevel, err := logrus.ParseLevel(level)
	if err != nil {
		return err
	}
	logrus.StandardLogger().SetLevel(logLevel)
	return nil
}

// RedirectToFile 将日志同时输出到工作目录下的 transactions.log 文件。
// 保留 stdout 输出（开发模式可见）；重复调用会先关闭旧文件句柄再切换，
// 工作空间切换时安全。目录不存在会自动创建。
func RedirectToFile(dir string) error {
	logFileMu.Lock()
	defer logFileMu.Unlock()

	if dir == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("创建日志目录失败: %w", err)
	}

	path := filepath.Join(dir, logFileName)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		return fmt.Errorf("打开日志文件失败: %w", err)
	}

	// 切换输出：stdout + 新文件
	if logFile != nil {
		_ = logFile.Close()
	}
	logFile = f
	logrus.StandardLogger().SetOutput(io.MultiWriter(os.Stdout, f))
	return nil
}

// CloseFile 关闭日志文件句柄并恢复纯 stdout 输出（进程退出时调用）。
func CloseFile() {
	logFileMu.Lock()
	defer logFileMu.Unlock()
	if logFile != nil {
		_ = logFile.Close()
		logFile = nil
	}
	logrus.StandardLogger().SetOutput(os.Stdout)
}

type CustomFormatter struct{}

func (f *CustomFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	timestamp := entry.Time.Format("2006-01-02 15:04:05")
	var logLine string
	if entry.HasCaller() {
		logLine = fmt.Sprintf("[%s] [%s] [goroutine-%d] [%s:%d] %s\n", timestamp, entry.Level.String(), getGoID(), entry.Caller.File, entry.Caller.Line, entry.Message)
	} else {
		logLine = fmt.Sprintf("[%s] [%s] [goroutine-%d] %s\n", timestamp, entry.Level.String(), getGoID(), entry.Message)
	}
	return []byte(logLine), nil
}

func getGoID() uint64 {
	b := make([]byte, 64)
	b = b[:runtime.Stack(b, false)]
	b = bytes.TrimPrefix(b, []byte("goroutine "))
	b = b[:bytes.IndexByte(b, ' ')]
	n, _ := strconv.ParseUint(string(b), 10, 64)
	return n
}
