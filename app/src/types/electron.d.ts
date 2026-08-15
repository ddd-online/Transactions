export {};

declare global {
    const __BUILD_TIME__: string;

    interface Window {
        electronAPI: {
            minimizeWindow: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;
            openDialog: (options: { properties?: string[]; title?: string }) => Promise<{
                canceled: boolean;
                filePaths: string[];
                error?: string;
            }>;
            saveFile: (relativePath: string) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
            setWorkspace: (workspaceDir: string) => void;
            getWorkspace: () => Promise<string>;
            getAppInfo: (field: string) => Promise<string>;
            getApiServer: () => Promise<string>;
            toggleDevTools: (enabled: boolean) => void;

            getCloseBehavior: () => Promise<string>;
            setCloseBehavior: (behavior: string) => Promise<void>;

            getAppearance: () => Promise<'light' | 'dark' | 'system'>;
            setAppearance: (appearance: 'light' | 'dark' | 'system') => Promise<void>;

            // ── 更新 ──
            checkUpdate: () => Promise<{
                hasUpdate: boolean;
                latestVersion: string;
                downloadUrl: string;
                digest?: string;
                body: string;
                error?: string;
            }>;
            downloadUpdate: (url: string, digest?: string) => Promise<{ success: boolean; error?: string }>;
            cancelDownload: () => void;
            installUpdate: () => Promise<{ success: boolean; error?: string }>;
            onDownloadProgress: (cb: (data: {
                percent: number;
                downloaded: number;
                total: number;
                speed: string;
            }) => void) => () => void;
            onDownloadComplete: (cb: (data: { filePath: string }) => void) => () => void;
            onDownloadError: (cb: (data: { message: string }) => void) => () => void;
            onWindowStateChanged: (cb: (data: { maximized: boolean }) => void) => () => void;
            getKernelStatus: () => Promise<{ state: string; detail?: string }>;
            onKernelStatusChanged: (cb: (data: { state: string; detail?: string }) => void) => () => void;
        };
    }
}
