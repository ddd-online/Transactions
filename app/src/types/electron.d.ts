export {};

declare global {
    const __BUILD_TIME__: string;

    interface Window {
        electronAPI: {
            minimizeWindow: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;
            openDialog: (options: any) => Promise<any>;
            setWorkspace: (workspaceDir: string) => void;
            getWorkspace: () => Promise<string>;
            getAppInfo: (field: string) => Promise<any>;
            getApiServer: () => Promise<string>;
            toggleDevTools: (enabled: boolean) => void;

            // ── 更新 ──
            checkUpdate: () => Promise<{
                hasUpdate: boolean;
                latestVersion: string;
                downloadUrl: string;
                body: string;
                error?: string;
            }>;
            downloadUpdate: (url: string) => Promise<{ success: boolean; error?: string }>;
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
        };
    }
}