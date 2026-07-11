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

const api = {
    async get<T = any>(url: string, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.get(url);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
            }
            throw error;
        }
    },

    async post<T = any>(url: string, data: object = {}, errorPrefix?: string, config?: Record<string, unknown>): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.post(url, data, config);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
            }
            throw error;
        }
    },

    async patch<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.patch(url, data);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
            }
            throw error;
        }
    },

    async put<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.put(url, data);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
            }
            throw error;
        }
    },

    async delete<T = any>(url: string, errorPrefix?: string): Promise<T> {
        try {
            const client = await getApiClient();
            const response: AxiosResponse<Result<T>> = await client.delete(url);
            checkSuccess(response.data, errorPrefix);
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
            }
            throw error;
        }
    }
};

export default api;
