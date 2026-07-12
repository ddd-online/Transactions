package workspace

import (
	"sync"

	"github.com/sirupsen/logrus"
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
}
