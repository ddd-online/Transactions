const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => {
        ipcRenderer.send('window-control', 'minimize');
    },
    maximizeWindow: () => {
        ipcRenderer.send('window-control', 'maximize');
    },
    closeWindow: () => {
        ipcRenderer.send('window-control', 'close');
    },
    openDialog: async (options) => {
        return await ipcRenderer.invoke('dialog:open', options);
    },
    setWorkspace: (workspaceDir) => {
        ipcRenderer.send('workspace:set', workspaceDir);
    },
    getWorkspace: async () => {
        return await ipcRenderer.invoke('workspace:get');
    },
    initWorkspace: (workspaceDir) => {
        ipcRenderer.send('workspace:init', workspaceDir);
    },
    getAppInfo: async (field) => {
        return await ipcRenderer.invoke('app', field);
    },
    getApiServer: async () => {
        return await ipcRenderer.invoke('app', 'apiServer');
    },
    toggleDevTools: (enabled) => {
        ipcRenderer.send('devtools:toggle', enabled);
    },

    getCloseBehavior: async () => {
        return await ipcRenderer.invoke('config:get-close-behavior');
    },
    setCloseBehavior: async (behavior) => {
        return await ipcRenderer.invoke('config:set-close-behavior', behavior);
    },

    // ── 更新 ──
    checkUpdate: async () => {
        return await ipcRenderer.invoke('update:check');
    },
    downloadUpdate: async (url) => {
        return await ipcRenderer.invoke('update:download', url);
    },
    cancelDownload: () => {
        ipcRenderer.send('update:cancel');
    },
    installUpdate: async () => {
        return await ipcRenderer.invoke('update:install');
    },
    onDownloadProgress: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-progress', handler);
        return () => ipcRenderer.removeListener('update:download-progress', handler);
    },
    onDownloadComplete: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-complete', handler);
        return () => ipcRenderer.removeListener('update:download-complete', handler);
    },
    onDownloadError: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-error', handler);
        return () => ipcRenderer.removeListener('update:download-error', handler);
    },

    onWindowStateChanged: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('window-state-changed', handler);
        return () => ipcRenderer.removeListener('window-state-changed', handler);
    },
});