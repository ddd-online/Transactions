import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { Result } from "@/types/transactions";

const DEFAULT_TIMEOUT = 10000;

let apiClient: AxiosInstance | null = null;
let cachedBaseUrl = 'http://127.0.0.1:28080';
let cachedApiToken = '';

// 生产环境从 Electron 主进程获取本地 API 令牌（dev 下 kernel 无令牌，返回空串）。
// 导出供不走 axios 的请求（如 AI 对话 SSE 原生 fetch）复用同一令牌。
export async function getApiToken(): Promise<string> {
    if (cachedApiToken) return cachedApiToken;
    if (window.electronAPI?.getAppInfo) {
        try {
            const token = await window.electronAPI.getAppInfo('apiToken');
            if (typeof token === 'string' && token) cachedApiToken = token;
        } catch (e) {
            console.warn('Failed to get API token from Electron:', e);
        }
    }
    return cachedApiToken;
}

async function getApiClient(): Promise<AxiosInstance> {
    if (apiClient) {
        return apiClient;
    }

    let baseURL = 'http://127.0.0.1:28080/api';

    // In Electron, get the actual port from the main process
    if (window.electronAPI?.getApiServer) {
        try {
            const server = await window.electronAPI.getApiServer();
            baseURL = `${server}/api`;
        } catch (e) {
            console.warn('Failed to get API server from Electron, using default:', e);
        }
    }

    cachedBaseUrl = baseURL.replace(/\/api$/, '');

    const apiToken = await getApiToken();

    apiClient = axios.create({
        baseURL,
        timeout: DEFAULT_TIMEOUT,
        headers: {
            'Content-Type': 'application/json',
            ...(apiToken ? { 'X-Api-Token': apiToken } : {}),
        },
    });

    return apiClient;
}

/**
 * Check if the response indicates an error (code !== 0).
 * Throws an Error with the message if so.
 */
function checkSuccess(result: Result, prefix?: string): void {
    if (result.code !== 0) {
        throw new Error(`${prefix || ''}响应失败: ${result.msg}`);
    }
}

/**
 * Extract a user-friendly error message from an Axios error.
 * Prefers the backend's `msg` field from the response body when available
 * (e.g. 500 errors from middleware), falls back to Axios's generic message.
 */
function extractErrorMessage(error: unknown, errorPrefix?: string): string {
    if (axios.isAxiosError(error)) {
        const backendMsg = (error.response?.data as Result)?.msg;
        if (backendMsg) {
            if (backendMsg === '未打开工作空间') {
                window.dispatchEvent(new CustomEvent('workspace-required'));
            }
            return `${errorPrefix || '请求失败'}: ${backendMsg}`;
        }
        return `${errorPrefix || '请求失败'}: ${error.message}`;
    }
    throw error;
}

/**
 * 统一请求核心：获取 client → 发起请求 → 校验 Result 信封 → 返回 data。
 * 五个动词方法只是传入不同的 axios 调用，避免重复 try/catch 与错误转换。
 */
async function request<T>(
    fn: (client: AxiosInstance) => Promise<AxiosResponse<Result<T>>>,
    errorPrefix?: string
): Promise<T> {
    try {
        const client = await getApiClient();
        const response = await fn(client);
        checkSuccess(response.data, errorPrefix);
        return response.data.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, errorPrefix));
    }
}

const api = {
    get<T = any>(url: string, errorPrefix?: string): Promise<T> {
        return request<T>((client) => client.get(url), errorPrefix);
    },

    post<T = any>(url: string, data: object = {}, errorPrefix?: string, config?: Record<string, unknown>): Promise<T> {
        return request<T>((client) => client.post(url, data, config), errorPrefix);
    },

    patch<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        return request<T>((client) => client.patch(url, data), errorPrefix);
    },

    put<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        return request<T>((client) => client.put(url, data), errorPrefix);
    },

    delete<T = any>(url: string, errorPrefix?: string): Promise<T> {
        return request<T>((client) => client.delete(url), errorPrefix);
    }
};

export function getImageBaseUrl(): string {
    return cachedBaseUrl;
}

export default api;
