package logger

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sirupsen/logrus"
)

func TestRedirectToFile(t *testing.T) {
	dir := t.TempDir()

	if err := RedirectToFile(dir); err != nil {
		t.Fatalf("RedirectToFile 失败: %v", err)
	}
	defer CloseFile()

	// 写入一条日志
	logrus.Info("hello log file")

	// 文件应存在且包含内容
	path := filepath.Join(dir, logFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("读取日志文件失败: %v", err)
	}
	if !strings.Contains(string(data), "hello log file") {
		t.Fatalf("日志文件应包含消息, 实际: %s", string(data))
	}
}

func TestRedirectToFileEmptyDir(t *testing.T) {
	// 空目录不报错、不切换输出
	if err := RedirectToFile(""); err != nil {
		t.Fatalf("空目录应无操作, 实际报错: %v", err)
	}
}

func TestRedirectToFileSwitch(t *testing.T) {
	// 切换目录：新目录应有日志，旧文件句柄被关闭
	dir1 := t.TempDir()
	dir2 := t.TempDir()

	if err := RedirectToFile(dir1); err != nil {
		t.Fatalf("首次重定向失败: %v", err)
	}
	logrus.Info("first dir")

	if err := RedirectToFile(dir2); err != nil {
		t.Fatalf("二次重定向失败: %v", err)
	}
	logrus.Info("second dir")
	defer CloseFile()

	path2 := filepath.Join(dir2, logFileName)
	data2, err := os.ReadFile(path2)
	if err != nil {
		t.Fatalf("读取新日志文件失败: %v", err)
	}
	if !strings.Contains(string(data2), "second dir") {
		t.Fatalf("新目录日志应包含消息, 实际: %s", string(data2))
	}
}
