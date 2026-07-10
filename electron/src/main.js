const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
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
};

function readTransactionsCfg() {
    if (isDev) return;
    const homeDir = os.homedir();
    const filePath = path.join(homeDir, '.transactions.json');
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const tmpObj = JSON.parse(fileContent);
        transactionsCfg = { ...transactionsCfg, ...tmpObj };
    } catch (err) {
        log(`读取 .transactions.json 文件失败: ${err.message}`);
    }
    log(`窗口 ${transactionsCfg.width}x${transactionsCfg.height} workspace ${transactionsCfg.workspaceDir}`);
}

function saveTransactionsCfg() {
    if (isDev) return;
    const homeDir = os.homedir();
    const filePath = path.join(homeDir, '.transactions.json');
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

const startKernel = () => {
    if (isDev) return;
    const kernelExe = path.join(appPath, 'Billadm-Kernel.exe');
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

    // ── 更新 ──
    let downloadRequest = null;
    let downloadFilePath = null;

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
            // Cancel any existing download
            if (downloadRequest) {
                downloadRequest.destroy();
                downloadRequest = null;
            }

            const urlObj = new URL(downloadUrl);
            const fileName = path.basename(urlObj.pathname);
            downloadFilePath = path.join(os.tmpdir(), fileName);

            // If file already exists from a previous completed download, reuse it
            if (fs.existsSync(downloadFilePath)) {
                mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                return { success: true };
            }

            await new Promise((resolve, reject) => {
                const req = net.request({
                    method: 'GET',
                    url: downloadUrl,
                });
                downloadRequest = req;

                req.on('response', (res) => {
                    // Handle redirect
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        reject(new Error('Redirect not supported; use direct URL'));
                        return;
                    }

                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let downloaded = 0;
                    const startTime = Date.now();
                    const chunks = [];

                    res.on('data', (chunk) => {
                        chunks.push(chunk);
                        downloaded += chunk.length;
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
                        const buffer = Buffer.concat(chunks);
                        try {
                            fs.writeFileSync(downloadFilePath, buffer);
                            downloadRequest = null;
                            mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });

                    res.on('error', reject);
                });

                req.on('error', (e) => {
                    if (downloadRequest === null) {
                        resolve(); // Cancelled silently
                    } else {
                        reject(e);
                    }
                });

                req.end();
            });

            return { success: true };
        } catch (e) {
            log(`update:download error: ${e.message}`);
            if (downloadFilePath && fs.existsSync(downloadFilePath)) {
                try { fs.unlinkSync(downloadFilePath); } catch {}
            }
            downloadFilePath = null;
            downloadRequest = null;
            mainWindow.webContents.send('update:download-error', { message: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.on('update:cancel', () => {
        if (downloadRequest) {
            downloadRequest.destroy();
            downloadRequest = null;
        }
        if (downloadFilePath && fs.existsSync(downloadFilePath)) {
            try { fs.unlinkSync(downloadFilePath); } catch {}
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
        win.focus();
    }
});

let mainWindow = null;

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

    mainWindow.loadURL(getUiServer());

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
                try {
                    await net.fetch(API_SERVER + "/api/v1/app/exit", { method: "POST" });
                } catch (e) {
                    log(`请求kernel关闭失败 ${e}`);
                }
                const bounds = mainWindow.getBounds();
                transactionsCfg = { ...transactionsCfg, ...bounds }
                mainWindow.close();
                break;
        }
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (kernelProcess) {
            kernelProcess.kill();
        }
        saveTransactionsCfg();
        app.quit();
    }
});
