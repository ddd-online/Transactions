const { app, BrowserWindow, ipcMain, dialog, net, Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { shell } = require('electron');

process.noAsar = false;

const isDev = !app.isPackaged;
const appPath = isDev ? path.dirname(__dirname) : app.getAppPath();

const API_PORT = isDev ? '28080' : '31943';
const API_SERVER = `http://127.0.0.1:${API_PORT}`;

// 本地 API 令牌：Electron 生成随机令牌并注入 kernel，渲染进程通过 IPC 获取后随请求携带，
// 防止本机任意进程/网页直接读写财务数据（dev 模式下 kernel 由 go run 启动、无令牌，鉴权自动跳过）。
const apiToken = crypto.randomBytes(32).toString('hex');

const getUiServer = () => {
    if (isDev) {
        return 'http://localhost:31945/static';
    } else {
        return `${API_SERVER}/static/index.html`;
    }
};

// 应用日志（按大小轮转：单文件超过 MAX_LOG_SIZE 后滚动为 app.log.1..N，保留 MAX_LOG_BACKUPS 份备份）
const logDir = path.join(appPath, 'logs');
const logFile = path.join(logDir, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 单文件上限 5MB
const MAX_LOG_BACKUPS = 5;            // 最多保留 5 份历史备份

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const rotateLogsIfNeeded = () => {
    let size = 0;
    try {
        size = fs.statSync(logFile).size;
    } catch {
        return; // 文件不存在（首次启动）无需轮转
    }
    if (size < MAX_LOG_SIZE) return;
    // 删除最旧备份
    try {
        fs.unlinkSync(path.join(logDir, `app.log.${MAX_LOG_BACKUPS}`));
    } catch { }
    // 备份逆序顺移：app.log.1 -> app.log.2 ... app.log.N-1 -> app.log.N
    for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
        const from = path.join(logDir, `app.log.${i}`);
        if (fs.existsSync(from)) {
            try {
                fs.renameSync(from, path.join(logDir, `app.log.${i + 1}`));
            } catch (e) {
                console.error(`日志备份顺移失败: ${e.message}`);
            }
        }
    }
    try {
        fs.renameSync(logFile, path.join(logDir, 'app.log.1'));
        console.log(`日志已轮转: ${logFile} (${(size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (e) {
        console.error(`日志轮转失败: ${e.message}`);
    }
};

const log = (message) => {
    try {
        rotateLogsIfNeeded();
        const time = new Date().toISOString();
        fs.appendFileSync(logFile, `[${time}] ${message}\n`);
    } catch (e) {
        console.error(`写日志失败: ${e.message}`);
    }
};

let transactionsCfg = {
    width: 1400, height: 1000, x: undefined, y: undefined, workspaceDir: '',
    closeBehavior: '',
    appearance: 'system', // 'light' | 'dark' | 'system'
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
let kernelQuitting = false;       // 应用主动退出流程标记，抑制“异常退出”弹窗
let kernelAlertActive = false;    // 防止探活与退出事件重复弹窗
let kernelHealthFails = 0;
let kernelHealthTimer = null;
let kernelStartedAt = 0;          // kernel 最近一次启动时间，用于启动宽限期
let kernelStatus = 'unknown';     // 'unknown' | 'starting' | 'ok' | 'down' | 'stopped'
let kernelStatusDetail = '';

const KERNEL_HEALTH_INTERVAL = 5000;      // 健康检查间隔（ms）
const KERNEL_HEALTH_TIMEOUT = 1500;       // 单次探测超时（ms）
const KERNEL_HEALTH_FAIL_THRESHOLD = 3;   // 连续失败多少次判定异常
const KERNEL_START_GRACE_MS = 15000;      // 启动宽限期，期间不判定异常

// 推送 kernel 状态到渲染进程（标题栏红绿灯）。状态无变化时不重复推送。
const setKernelStatus = (state, detail = '') => {
    if (kernelStatus === state && kernelStatusDetail === detail) return;
    kernelStatus = state;
    kernelStatusDetail = detail;
    log(`kernel状态变更: ${state}${detail ? ` (${detail})` : ''}`);
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send('kernel:status', { state, detail });
        }
    }
};

const startKernel = () => {
    if (isDev) return;
    if (kernelProcess) return;
    const kernelExe = path.join(appPath, 'transactions.exe');
    log(`Starting kernel: ${kernelExe}`);
    const cp = require("child_process");
    // 传入上次工作空间目录：kernel 启动即把日志写到工作目录下（后台 stdout 不可见）
    const kernelArgs = ['-mode', 'release', '-port', API_PORT, '-api_token', apiToken];
    if (transactionsCfg.workspaceDir) {
        kernelArgs.push('-workspace', transactionsCfg.workspaceDir);
    }
    const proc = cp.spawn(kernelExe, kernelArgs, {
        detached: false,
        windowsHide: true,
    });
    proc.expectedExit = false; // 该进程是否被主动要求退出（正常退出 / 重启）
    kernelProcess = proc;
    kernelHealthFails = 0;
    kernelStartedAt = Date.now();
    setKernelStatus('starting', '正在启动后台服务');

    proc.stdout.on('data', (data) => {
        log(`[Kernel STDOUT]: ${data.toString()}`);
    });

    proc.stderr.on('data', (data) => {
        log(`[Kernel STDERR]: ${data.toString()}`);
    });

    proc.on('error', (err) => {
        if (kernelProcess !== proc) return;
        kernelProcess = null;
        log(`[Kernel Process] Failed to start: ${err.message}`);
        setKernelStatus('down', `启动失败: ${err.message}`);
        if (!kernelQuitting && !proc.expectedExit) {
            showKernelAlert('后台服务启动失败', `无法启动后台服务：${err.message}`);
        }
    });

    proc.on('exit', (code, signal) => {
        if (kernelProcess !== proc) return;
        kernelProcess = null;
        const detail = `退出码: ${code}${signal ? `, 信号: ${signal}` : ''}`;
        log(`[Kernel Process] kernel [pid=${proc.pid}] exited, ${detail}`);
        setKernelStatus(proc.expectedExit ? 'stopped' : 'down', proc.expectedExit ? '后台服务已停止' : `异常退出 ${detail}`);
        if (!kernelQuitting && !proc.expectedExit) {
            showKernelAlert(
                '后台服务异常退出',
                `后台服务异常退出（${detail}）。\n数据由 SQLite WAL 保护，不会丢失。您可以立即重启后台服务，或退出应用。`
            );
        }
    });

    proc.on('close', (code) => {
        if (kernelProcess === proc) kernelProcess = null;
        log(`[Kernel Process] kernel [pid=${proc.pid}] closed with code ${code}`);
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
            const assetsRoot = path.resolve(transactionsCfg.workspaceDir, 'data', 'assets');
            const srcPath = path.resolve(assetsRoot, relativePath);
            // 防路径遍历：解析后必须仍位于 assets 目录内
            if (srcPath !== assetsRoot && !srcPath.startsWith(assetsRoot + path.sep)) {
                return { success: false, error: '非法文件路径' };
            }
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
            case 'apiToken':
                return apiToken;
            case 'isDev':
                return isDev ? 'true' : 'false';
            default:
                return '';
        }
    });

    // DevTools 开关：handle 返回操作后的真实状态，前端据此校正开关，避免状态脱节。
    // 生产环境保持禁用（isDev 为 false 时只读状态、不真正开关），设置页在非 dev 下隐藏该入口。
    ipcMain.handle('devtools:get-state', () => {
        return mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.isDevToolsOpened() : false;
    });

    ipcMain.handle('devtools:toggle', (event, enabled) => {
        if (isDev && mainWindow && !mainWindow.isDestroyed()) {
            if (enabled) {
                mainWindow.webContents.openDevTools({ mode: 'bottom' });
            } else {
                mainWindow.webContents.closeDevTools();
            }
        }
        return mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.isDevToolsOpened() : false;
    });

    ipcMain.handle('config:get-close-behavior', () => {
        return transactionsCfg.closeBehavior || '';
    });

    ipcMain.handle('config:set-close-behavior', (event, behavior) => {
        transactionsCfg.closeBehavior = behavior;
        saveTransactionsCfg();
    });

    // 外观（浅色/深色/跟随系统）：与 close-behavior 同一持久化模式（~/.transactions.json）。
    // nativeTheme.themeSource 同时驱动系统对话框与渲染进程的 prefers-color-scheme 媒体查询。
    ipcMain.handle('config:get-appearance', () => {
        return transactionsCfg.appearance || 'system';
    });

    ipcMain.handle('config:set-appearance', (event, appearance) => {
        if (!['light', 'dark', 'system'].includes(appearance)) return;
        transactionsCfg.appearance = appearance;
        nativeTheme.themeSource = appearance;
        saveTransactionsCfg();
    });

    ipcMain.handle('kernel:get-status', () => ({
        state: kernelStatus,
        detail: kernelStatusDetail,
    }));

    // 窗口控制与工作空间初始化：统一注册一次，避免 create*Window 被多次调用时重复注册监听器
    ipcMain.on('window-control', async (event, command) => {
        switch (command) {
            case 'minimize':
                if (mainWindow) mainWindow.minimize();
                break;
            case 'maximize':
                if (mainWindow) {
                    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
                }
                break;
            case 'close':
                await handleWindowClose();
                break;
        }
    });

    ipcMain.on('workspace:init', (event, workspaceDir) => {
        transactionsCfg.workspaceDir = workspaceDir;
        saveTransactionsCfg();
        if (initWindow) {
            initWindow.close();
            initWindow = null;
        }
        createMainWindow();
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
                digest: asset?.digest || '',
                body: data.body || '',
            };
        } catch (e) {
            log(`update:check error: ${e.message}`);
            return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '', error: e.message };
        }
    });

    ipcMain.handle('update:download', async (event, downloadUrl, expectedDigest) => {
        try {
            downloadCancelled = false;
            // URL 白名单：仅允许 GitHub Releases 域名，防止渲染进程被注入后下载任意 URL
            let downloadHost = '';
            try {
                downloadHost = new URL(downloadUrl).hostname;
            } catch {
                return { success: false, error: '无效的下载地址' };
            }
            if (!downloadHost.endsWith('github.com') && !downloadHost.endsWith('objects.githubusercontent.com')) {
                return { success: false, error: '下载地址不在白名单内' };
            }
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
            const hash = crypto.createHash('sha256');

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
                    // SHA256 校验：GitHub Release 提供 asset.digest（形如 "sha256:..."）
                    const expected = (expectedDigest || '').replace(/^sha256:/i, '').toLowerCase();
                    if (expected && hash.digest('hex') !== expected) {
                        try { fs.unlinkSync(tmpPath); } catch { }
                        mainWindow.webContents.send('update:download-error', { message: '下载文件校验失败（SHA256 不匹配）' });
                        resolve();
                        return;
                    }
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
                        hash.update(chunk);
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
let forceClose = false; // 标记真正关闭（绕过 close 事件拦截）

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
            forceClose = true;
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
        forceClose = true;
        mainWindow.close();
    }
};

// 优雅停止内核：先请求 /api/v1/app/exit 让其保存并退出，超时再强制结束，
// 避免直接 kill 导致 SQLite WAL 未正常 checkpoint。
const stopKernel = async (waitMs = 3000) => {
    const proc = kernelProcess;
    if (!proc) return;
    proc.expectedExit = true;
    try {
        await net.fetch(API_SERVER + "/api/v1/app/exit", {
            method: "POST",
            headers: { 'X-Api-Token': apiToken },
        });
    } catch (e) {
        log(`请求kernel关闭失败 ${e}`);
    }
    const deadline = Date.now() + waitMs;
    while (kernelProcess === proc && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (kernelProcess === proc) {
        log(`kernel未在 ${waitMs}ms 内正常退出，强制结束 pid=${proc.pid}`);
        try {
            proc.kill();
        } catch (e) {
            log(`强制结束kernel失败: ${e}`);
        }
        // kill 后确认进程真正退出，避免残留进程继续占用端口
        const killDeadline = Date.now() + 2000;
        while (kernelProcess === proc && Date.now() < killDeadline) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (kernelProcess === proc) {
            log('kernel 强制结束后仍未退出，可能存在残留进程');
        }
    }
};

const quitApp = async () => {
    kernelQuitting = true;
    await stopKernel();
};

// 弹窗提醒（异常退出 / 启动失败 / 无响应）。通过 kernelAlertActive 去重，
// 避免退出事件与健康检查同时触发多个弹窗。
const showKernelAlert = async (title, message, options = {}) => {
    const { allowRestart = true } = options;
    if (kernelAlertActive || kernelQuitting) return;
    kernelAlertActive = true;
    try {
        const buttons = allowRestart ? ['重启后台服务', '退出应用'] : ['知道了'];
        const { response } = await dialog.showMessageBox({
            type: 'warning',
            title,
            message,
            buttons,
            defaultId: 0,
            cancelId: buttons.length - 1,
            noLink: true,
        });
        if (allowRestart && response === 0) {
            log('用户选择重启后台服务');
            await restartKernel();
        } else if (response === buttons.length - 1) {
            log('用户选择退出应用');
            kernelQuitting = true;
            app.quit();
        }
    } catch (e) {
        log(`弹窗失败: ${e.message}`);
    } finally {
        kernelAlertActive = false;
    }
};

const restartKernel = async () => {
    log('开始重启后台服务');
    const proc = kernelProcess;
    if (proc) proc.expectedExit = true;
    await stopKernel();
    startKernel();
    setKernelStatus('starting', '正在重启后台服务');
    // 等待健康恢复，最多 10s
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (await pingKernelOnce()) {
            setKernelStatus('ok');
            log('后台服务重启成功');
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log('后台服务重启后仍不可达');
};

const pingKernelOnce = async () => {
    try {
        const res = await net.fetch(`${API_SERVER}/api/v1/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(KERNEL_HEALTH_TIMEOUT),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    } catch (e) {
        log(`kernel健康检查失败: ${e.message}`);
        return false;
    }
};

// 定时探活：连续 KERNEL_HEALTH_FAIL_THRESHOLD 次失败才判定异常，
// 避免 kernel 瞬时繁忙（慢查询 / AI 请求）造成误报。
const pingKernel = async () => {
    if (kernelQuitting) return;
    if (await pingKernelOnce()) {
        kernelHealthFails = 0;
        setKernelStatus('ok');
        return;
    }
    // 启动宽限期内不累计失败，避免慢速机器初始化（AutoMigrate 等）导致误报
    if (Date.now() - kernelStartedAt < KERNEL_START_GRACE_MS) {
        log(`kernel 仍在启动宽限期内（已启动 ${Math.round((Date.now() - kernelStartedAt) / 1000)}s），跳过判定`);
        return;
    }
    kernelHealthFails += 1;
    if (kernelHealthFails < KERNEL_HEALTH_FAIL_THRESHOLD) return;
    kernelHealthFails = 0;
    setKernelStatus('down', `连续 ${KERNEL_HEALTH_FAIL_THRESHOLD} 次健康检查失败`);
    if (kernelProcess) {
        log('kernel 连续健康检查失败但进程仍在，判定为无响应');
        showKernelAlert(
            '后台服务无响应',
            `后台服务连续 ${KERNEL_HEALTH_FAIL_THRESHOLD} 次健康检查失败，可能已卡死。\n您可以重启后台服务，或退出应用。`
        );
    }
};

const startKernelHealthMonitor = () => {
    if (kernelHealthTimer) return;
    log(`启动kernel健康检查（每 ${KERNEL_HEALTH_INTERVAL / 1000}s 一次）`);
    kernelHealthTimer = setInterval(pingKernel, KERNEL_HEALTH_INTERVAL);
};

const stopKernelHealthMonitor = () => {
    if (kernelHealthTimer) {
        clearInterval(kernelHealthTimer);
        kernelHealthTimer = null;
    }
};

// DevTools 状态广播：无论通过设置开关还是 DevTools 自身的关闭按钮改变开合状态，都同步给渲染进程校正开关
const broadcastDevToolsState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('devtools:state-changed', mainWindow.webContents.isDevToolsOpened());
    }
};

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
        width: transactionsCfg.width,
        height: transactionsCfg.height,
        x: transactionsCfg.x,
        y: transactionsCfg.y,
        frame: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f9fafb',
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

    // 同步 DevTools 开合状态给渲染进程（设置页开关），覆盖 DevTools 自身按钮关闭的情况
    mainWindow.webContents.on('devtools-opened', broadcastDevToolsState);
    mainWindow.webContents.on('devtools-closed', broadcastDevToolsState);

    // 阻止主窗口导航到外部地址或新开窗口（纵深防御）
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowed = url.startsWith(API_SERVER) || (isDev && url.startsWith('http://localhost:31945'));
        if (!allowed) {
            event.preventDefault();
            log(`已拦截外部导航: ${url}`);
        }
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // 统一关闭入口：Alt+F4 / 任务栏关闭也走 handleWindowClose（托盘/退出配置）
    mainWindow.on('close', (event) => {
        if (forceClose) return;
        event.preventDefault();
        handleWindowClose();
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
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f9fafb',
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js'),
        },
    });

    const initHtmlPath = path.join(__dirname, 'init.html');
    initWindow.loadFile(initHtmlPath);

    log(`Init window created: ${initHtmlPath}`);
};

// 单实例锁：确保同一台电脑只能运行一个程序实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}

app.whenReady().then(() => {
    readTransactionsCfg();
    nativeTheme.themeSource = transactionsCfg.appearance || 'system';
    startKernel();
    startKernelHealthMonitor();
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

let kernelStopInProgress = false;

app.on('before-quit', (event) => {
    kernelQuitting = true;
    setKernelStatus('stopped', '应用退出中');
    stopKernelHealthMonitor();
    if (tray) {
        tray.destroy();
        tray = null;
    }
    // 兜底：如果走到这里 kernel 还活着（例如直接 app.quit()），
    // 先优雅停止再真正退出，防止子进程残留占用端口。
    if (kernelProcess && !kernelStopInProgress) {
        event.preventDefault();
        kernelStopInProgress = true;
        (async () => {
            await stopKernel();
            kernelStopInProgress = false;
            app.quit();
        })();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        saveTransactionsCfg();
        (async () => {
            await quitApp();
            app.quit();
        })();
    }
});
