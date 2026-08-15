package workspace

import (
	"sync"

	"github.com/sirupsen/logrus"

	"github.com/transactions/logger"
)

const (
	ErrOpenedWorkspaceNotFound = "未打开工作空间"
)

func NewWsManager() *WsManager {
	return &WsManager{}
}

type WsManager struct {
	workspace *Workspace
	lock      sync.Mutex
}

// OpenWorkspace opens a workspace at the given directory.
// If a workspace is already open, it will be closed first.
func (wm *WsManager) OpenWorkspace(directory string) error {
	wm.lock.Lock()
	defer wm.lock.Unlock()

	// Close existing workspace if any
	if wm.workspace != nil {
		wm.workspace.Close()
	}

	ws, err := NewWorkspace(directory)
	if err != nil {
		logrus.Errorf("打开工作空间失败 %v", err)
		return err
	}

	// 日志重定向到工作目录（后台模式 stdout 不可见，写文件便于排障）
	if err := logger.RedirectToFile(directory); err != nil {
		logrus.Warnf("重定向日志到工作目录失败: %v", err)
	}

	wm.workspace = ws
	return nil
}

func (wm *WsManager) OpenedWorkspace() *Workspace {
	wm.lock.Lock()
	defer wm.lock.Unlock()

	return wm.workspace
}

func (wm *WsManager) Close() {
	wm.lock.Lock()
	defer wm.lock.Unlock()

	if wm.workspace != nil {
		wm.workspace.Close()
		wm.workspace = nil
	}
	// 应用退出：关闭日志文件句柄，恢复纯 stdout
	logger.CloseFile()
}
