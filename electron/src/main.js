const { app, BrowserWindow, ipcMain, dialog, net, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { shell } = require('electron');

process.noAsar = false;

const isDev = !app.isPackaged;
const appPath = isDev ? path.dirname(__dirname) : app.getAppPath();

const API_PORT = isDev ? '28080' : '31943';
const API_SERVER = `http://127.0.0.1:${API_PORT}`;

const getUiServer = () => {
    if (isDev) {
        return 'http://localhost:31945/static';
    } else {
        return `${API_SERVER}/static/index.html`;
    }
};

// 应用日志
const logDir = path.join(appPath, 'logs');
const logFile = path.join(logDir, 'app.log');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const log = (message) => {
    const time = new Date().toISOString();
    logStream.write(`[${time}] ${message}\n`);
};

let transactionsCfg = {
    width: 1400, height: 1000, x: undefined, y: undefined, workspaceDir: '',
    closeBehavior: '',
};

function transactionsCfgPath() {
    const homeDir = os.homedir();
    return path.join(homeDir, isDev ? '.transactions-dev.json' : '.transactions.json');
}

function readTransactionsCfg() {
    const filePath = transactionsCfgPath();
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const tmpObj = JSON.parse(fileContent);
        transactionsCfg = { ...transactionsCfg, ...tmpObj };
    } catch (err) {
        log(`读取配置文件失败: ${err.message}`);
    }
    log(`窗口 ${transactionsCfg.width}x${transactionsCfg.height} workspace ${transactionsCfg.workspaceDir}`);
}

function saveTransactionsCfg() {
    const filePath = transactionsCfgPath();
    try {
        if (typeof transactionsCfg !== 'object' || transactionsCfg === null) {
            log('transactionsCfg 无效，无法保存');
            return;
        }
        fs.writeFileSync(filePath, JSON.stringify(transactionsCfg, null, 2), 'utf8');
        log(`配置已保存至 ${filePath}`);
    } catch (err) {
        log(`保存配置失败: ${err.message}`);
    }
}


// 内核
let kernelProcess = null;
let tray = null;

const startKernel = () => {
    if (isDev) return;
    const kernelExe = path.join(appPath, 'transactions.exe');
    log(`Starting kernel: ${kernelExe}`);
    const cp = require("child_process");
    kernelProcess = cp.spawn(kernelExe, ['-mode', 'release', '-port', API_PORT], {
        detached: false,
    });

    kernelProcess.stdout.on('data', (data) => {
        log(`[Kernel STDOUT]: ${data.toString()}`);
    });

    kernelProcess.stderr.on('data', (data) => {
        log(`[Kernel STDERR]: ${data.toString()}`);
    });

    kernelProcess.on('close', (code) => {
        if (kernelProcess) {
            log(`[Kernel Process] kernel [pid=${kernelProcess.pid}] closed with code ${code}`);
        } else {
            log(`[Kernel Process] kernel closed with code ${code}`);
        }
        kernelProcess = null;
    });

    kernelProcess.on('exit', (code) => {
        const pid = kernelProcess ? kernelProcess.pid : 'unknown';
        log(`[Kernel Process] kernel [pid=${pid}] exited with code ${code}`);
        if (code !== 0 && code !== null) {
            dialog.showMessageBox({
                type: 'error',
                title: '后台服务异常退出',
                message: `后台服务异常退出，退出码: ${code}\n请重启应用`,
            });
        }
        kernelProcess = null;
    });

    kernelProcess.on('error', (err) => {
        log('[Kernel Process] Failed to start:', err);
    });
};

// 系统托盘
const createTray = () => {
    try {
        const iconPath = path.join(appPath, 'assets', 'Transactions.ico');
        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            log('托盘图标创建失败：图标为空');
            return;
        }
        tray = new Tray(icon.resize({ width: 16, height: 16 }));
        tray.setToolTip(app.getName());

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示主窗口', click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.setSkipTaskbar(false);
                        mainWindow.focus();
                    }
                },
            },
            { type: 'separator' },
            {
                label: '关闭程序', click: async () => {
                    await stopKernel();
                    saveTransactionsCfg();
                    app.quit();
                },
            },
        ]);
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.setSkipTaskbar(false);
                mainWindow.focus();
            }
        });
    } catch (e) {
        log(`创建托盘图标失败: ${e.message}`);
    }
};

// 通用 IPC 处理器
const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
    if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return Math.round(bytesPerSec) + ' B/s';
};

const registerCommonHandlers = () => {
    ipcMain.handle('dialog:open', async (event, options) => {
        try {
            return await dialog.showOpenDialog({
                properties: ['openDirectory'], ...options,
            });
        } catch (err) {
            log(`Dialog error: ${err.message}`);
            return { canceled: true, filePaths: [], error: err.message };
        }
    });

    ipcMain.handle('file:save', async (event, relativePath) => {
        try {
            const srcPath = path.join(transactionsCfg.workspaceDir, 'data', 'assets', relativePath);
            log(`file:save source: ${srcPath}`);

            if (!fs.existsSync(srcPath)) {
                return { success: false, error: '源文件不存在' };
            }

            const ext = path.extname(relativePath);
            const baseName = path.basename(relativePath, ext);
            const result = await dialog.showSaveDialog({
                defaultPath: baseName + ext,
                filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'] }],
            });

            if (result.canceled) {
                return { success: false, canceled: true };
            }

            fs.copyFileSync(srcPath, result.filePath);
            log(`file:save saved to: ${result.filePath}`);
            return { success: true };
        } catch (err) {
            log(`file:save error: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.on('workspace:set', (event, workspaceDir) => {
        transactionsCfg.workspaceDir = workspaceDir;
        saveTransactionsCfg();
    });

    ipcMain.handle('workspace:get', () => {
        return transactionsCfg.workspaceDir;
    });

    ipcMain.handle('app', async (event, field) => {
        switch (field) {
            case 'name':
                return app.getName();
            case 'version':
                return app.getVersion();
            case 'apiServer':
                return API_SERVER;
            default:
                return '';
        }
    });

    ipcMain.on('devtools:toggle', (event, enabled) => {
        if (mainWindow) {
            if (enabled) {
                mainWindow.webContents.openDevTools({ mode: 'bottom' });
            } else {
                mainWindow.webContents.closeDevTools();
            }
        }
    });

    ipcMain.handle('config:get-close-behavior', () => {
        return transactionsCfg.closeBehavior || '';
    });

    ipcMain.handle('config:set-close-behavior', (event, behavior) => {
        transactionsCfg.closeBehavior = behavior;
        saveTransactionsCfg();
    });

    // ── 更新 ──
    let downloadRequest = null;
    let downloadWriteStream = null;
    let downloadFilePath = null;
    let downloadCancelled = false;

    ipcMain.handle('update:check', async () => {
        try {
            const data = await new Promise((resolve, reject) => {
                const url = 'https://api.github.com/repos/ddd-online/Transactions/releases/latest';
                const req = net.request({
                    method: 'GET',
                    url,
                });
                req.setHeader('User-Agent', 'Transactions-App');
                req.setHeader('Accept', 'application/vnd.github+json');

                const timeout = setTimeout(() => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                }, 15000);

                req.on('response', (res) => {
                    clearTimeout(timeout);
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 400) {
                            reject(new Error(`GitHub API returned status ${res.statusCode}: ${body.slice(0, 200)}`));
                            return;
                        }
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    });
                    res.on('error', reject);
                });
                req.on('error', (e) => {
                    clearTimeout(timeout);
                    reject(e);
                });
                req.end();
            });

            if (data.prerelease) {
                return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '' };
            }

            const latestVersion = (data.tag_name || '').replace(/^v/, '');
            const currentVersion = app.getVersion().replace(/^v/, '');

            const partsLatest = latestVersion.split('.').map(Number);
            const partsCurrent = currentVersion.split('.').map(Number);
            let hasUpdate = false;
            for (let i = 0; i < Math.max(partsLatest.length, partsCurrent.length); i++) {
                const a = partsLatest[i] || 0;
                const b = partsCurrent[i] || 0;
                if (a > b) { hasUpdate = true; break; }
                if (a < b) { break; }
            }

            if (!hasUpdate) {
                return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '' };
            }

            const asset = data.assets?.find(a => a.browser_download_url?.endsWith('.exe'));
            const downloadUrl = asset?.browser_download_url || '';
            return {
                hasUpdate: true,
                latestVersion,
                downloadUrl,
                body: data.body || '',
            };
        } catch (e) {
            log(`update:check error: ${e.message}`);
            return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '', error: e.message };
        }
    });

    ipcMain.handle('update:download', async (event, downloadUrl) => {
        try {
            downloadCancelled = false;
            // 中断上一次未完成的下载并清理
            if (downloadRequest) {
                downloadRequest.destroy();
                downloadRequest = null;
            }
            if (downloadWriteStream) {
                downloadWriteStream.destroy();
                downloadWriteStream = null;
            }

            const urlObj = new URL(downloadUrl);
            const fileName = path.basename(urlObj.pathname);
            downloadFilePath = path.join(os.tmpdir(), fileName);
            const tmpPath = downloadFilePath + '.part';

            // 已下载完成的文件直接复用
            if (fs.existsSync(downloadFilePath)) {
                mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                return { success: true };
            }

            // 流式写入磁盘，避免把整个安装包缓存在内存中
            const writeStream = fs.createWriteStream(tmpPath);
            downloadWriteStream = writeStream;

            await new Promise((resolve, reject) => {
                let settled = false;
                const fail = (err) => {
                    if (settled) return;
                    settled = true;
                    downloadRequest = null;
                    downloadWriteStream = null;
                    // Windows 下流未完全关闭时 unlink 会报 EBUSY，等 close 后再清理
                    writeStream.once('close', () => {
                        try { fs.unlinkSync(tmpPath); } catch (e) { /* 已清理或不存在 */ }
                    });
                    writeStream.destroy();
                    if (downloadCancelled) {
                        resolve(); // 用户主动取消：静默结束
                        return;
                    }
                    reject(err);
                };
                const succeed = () => {
                    if (settled) return;
                    settled = true;
                    downloadRequest = null;
                    downloadWriteStream = null;
                    fs.renameSync(tmpPath, downloadFilePath);
                    mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                    resolve();
                };

                const req = net.request({
                    method: 'GET',
                    url: downloadUrl,
                });
                downloadRequest = req;

                req.on('response', (res) => {
                    // net.request 默认跟随重定向，走到这里通常已是 200
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        fail(new Error('Redirect not supported; use direct URL'));
                        return;
                    }

                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let downloaded = 0;
                    const startTime = Date.now();

                    res.on('data', (chunk) => {
                        downloaded += chunk.length;
                        if (!writeStream.write(chunk)) {
                            res.pause();
                            writeStream.once('drain', () => res.resume());
                        }
                        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0 ? formatSpeed(downloaded / elapsed) : '0 B/s';

                        mainWindow.webContents.send('update:download-progress', {
                            percent,
                            downloaded,
                            total,
                            speed,
                        });
                    });

                    res.on('end', () => {
                        writeStream.end(() => succeed());
                    });

                    res.on('error', fail);
                });

                req.on('error', (e) => {
                    if (downloadRequest === null) {
                        resolve(); // Cancelled silently
                    } else {
                        fail(e);
                    }
                });

                req.end();
            });

            return { success: true };
        } catch (e) {
            log(`update:download error: ${e.message}`);
            if (downloadCancelled) {
                return { success: false, error: 'cancelled' };
            }
            if (downloadFilePath && fs.existsSync(downloadFilePath)) {
                try { fs.unlinkSync(downloadFilePath); } catch { }
            }
            downloadFilePath = null;
            downloadRequest = null;
            downloadWriteStream = null;
            mainWindow.webContents.send('update:download-error', { message: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.on('update:cancel', () => {
        downloadCancelled = true;
        if (downloadRequest) {
            downloadRequest.destroy();
            downloadRequest = null;
        }
        if (downloadWriteStream) {
            const stream = downloadWriteStream;
            downloadWriteStream = null;
            stream.once('close', () => {
                try { fs.unlinkSync(stream.path); } catch { }
            });
            try { stream.destroy(); } catch { }
        }
        if (downloadFilePath) {
            try {
                fs.unlinkSync(downloadFilePath);
                fs.unlinkSync(downloadFilePath + '.part');
            } catch { }
        }
        downloadFilePath = null;
    });

    ipcMain.handle('update:install', async () => {
        if (!downloadFilePath || !fs.existsSync(downloadFilePath)) {
            return { success: false, error: '安装文件不存在' };
        }
        try {
            await shell.openPath(downloadFilePath);
            setImmediate(() => app.quit());
            return { success: true };
        } catch (e) {
            log(`update:install error: ${e.message}`);
            return { success: false, error: e.message };
        }
    });
};

app.on('second-instance', () => {
    const win = mainWindow || initWindow;
    if (win) {
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) {
            win.show();
            win.setSkipTaskbar(false);
        }
        win.focus();
    }
});

let mainWindow = null;

const handleWindowClose = async () => {
    const bounds = mainWindow.getBounds();
    transactionsCfg = { ...transactionsCfg, ...bounds };

    if (!transactionsCfg.closeBehavior) {
        const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: '关闭选项',
            message: '请选择关闭行为',
            detail: '您希望点击关闭按钮时执行什么操作？',
            buttons: ['直接关闭', '缩小到托盘'],
            defaultId: 0,
            checkboxLabel: '下次不再提醒',
            checkboxChecked: false,
        });

        const behavior = response === 0 ? 'quit' : 'tray';
        if (checkboxChecked) {
            transactionsCfg.closeBehavior = behavior;
            saveTransactionsCfg();
        }

        if (behavior === 'quit') {
            await quitApp();
            mainWindow.close();
        } else {
            saveTransactionsCfg();
            mainWindow.hide();
            mainWindow.setSkipTaskbar(true);
        }
    } else if (transactionsCfg.closeBehavior === 'tray') {
        saveTransactionsCfg();
        mainWindow.hide();
        mainWindow.setSkipTaskbar(true);
    } else {
        await quitApp();
        mainWindow.close();
    }
};

// 优雅停止内核：先请求 /api/v1/app/exit 让其保存并退出，超时再强制结束，
// 避免直接 kill 导致 SQLite WAL 未正常 checkpoint。
const stopKernel = async () => {
    if (!kernelProcess) return;
    try {
        await net.fetch(API_SERVER + "/api/v1/app/exit", { method: "POST" });
    } catch (e) {
        log(`请求kernel关闭失败 ${e}`);
    }
    const deadline = Date.now() + 3000;
    while (kernelProcess && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (kernelProcess) {
        try {
            kernelProcess.kill();
        } catch (e) {
            log(`强制结束kernel失败: ${e}`);
        }
    }
};

const quitApp = async () => {
    await stopKernel();
};

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
        width: transactionsCfg.width,
        height: transactionsCfg.height,
        x: transactionsCfg.x,
        y: transactionsCfg.y,
        frame: false,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js'),
        },
    });

    // 清除 HTTP 缓存，确保升级后加载最新前端资源
    // Chromium 可能在 Cache-Control: no-store 生效前就返回了磁盘缓存的 index.html，
    // 导致旧 index.html 引用旧 hash 的 JS/CSS 资源，整个 UI 停留在旧版本
    mainWindow.webContents.session.clearCache().then(() => {
        mainWindow.loadURL(getUiServer());
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    ipcMain.on('window-control', async (event, command) => {
        switch (command) {
            case 'minimize':
                mainWindow.minimize();
                break;
            case 'maximize':
                mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
                break;
            case 'close':
                await handleWindowClose();
                break;
        }
    });

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-changed', { maximized: true });
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-changed', { maximized: false });
    });
};

let initWindow = null;

const createInitWindow = () => {
    initWindow = new BrowserWindow({
        width: 600,
        height: 560,
        resizable: false,
        frame: false,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js'),
        },
    });

    const initHtmlPath = path.join(__dirname, 'init.html');
    initWindow.loadFile(initHtmlPath);

    log(`Init window created: ${initHtmlPath}`);

    ipcMain.on('workspace:init', (event, workspaceDir) => {
        transactionsCfg.workspaceDir = workspaceDir;
        saveTransactionsCfg();
        if (initWindow) {
            initWindow.close();
            initWindow = null;
        }
        createMainWindow();
    });
};

// 单实例锁：确保同一台电脑只能运行一个程序实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}

app.whenReady().then(() => {
    readTransactionsCfg();
    startKernel();
    registerCommonHandlers();
    createTray();

    if (!transactionsCfg.workspaceDir) {
        createInitWindow();
    } else {
        createMainWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            if (!transactionsCfg.workspaceDir) {
                createInitWindow();
            } else {
                createMainWindow();
            }
        }
    });
});

app.on('before-quit', () => {
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        saveTransactionsCfg();
        (async () => {
            await stopKernel();
            app.quit();
        })();
    }
});
