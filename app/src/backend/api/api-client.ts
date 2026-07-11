import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type { Result } from "@/types/billadm";

let apiClient: AxiosInstance | null = null;

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

    apiClient = axios.create({
        baseURL,
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
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
            return `${errorPrefix || '请求失败'}: ${backendMsg}`;
        }
        return `${errorPrefix || '请求失败'}: ${error.message}`;
    }
    throw error;
}

const api = {
    async get<T = any>(url: string, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.get(url);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            throw new Error(extractErrorMessage(error, errorPrefix));
        }
    },

    async post<T = any>(url: string, data: object = {}, errorPrefix?: string, config?: Record<string, unknown>): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.post(url, data, config);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            throw new Error(extractErrorMessage(error, errorPrefix));
        }
    },

    async patch<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.patch(url, data);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            throw new Error(extractErrorMessage(error, errorPrefix));
        }
    },

    async put<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.put(url, data);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            throw new Error(extractErrorMessage(error, errorPrefix));
        }
    },

    async delete<T = any>(url: string, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.delete(url);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            throw new Error(extractErrorMessage(error, errorPrefix));
        }
    }
};

export default api;
