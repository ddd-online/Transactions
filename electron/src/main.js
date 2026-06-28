const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
                mainWindow.webContents.openDevTools({ mode: 'right' });
            } else {
                mainWindow.webContents.closeDevTools();
            }
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
