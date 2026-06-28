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
        };
    }
}