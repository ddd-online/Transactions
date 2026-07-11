import api from './api-client';

export interface AiConfig {
  base_url: string;
  endpoint: string;
  api_key: string;
  model: string;
  system_prompt: string;
  provider: string;
}

export interface AiConfigResponse {
  base_url: string;
  endpoint: string;
  model: string;
  has_key: boolean;
  system_prompt: string;
  provider: string;
}

export interface ProviderFetchRequest {
  action: 'balance' | 'models';
  api_key?: string;
  provider?: string;
}

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

export interface ModelsResponse {
  models: { id: string }[];
}

export const aiApi = {
  async getConfig(): Promise<AiConfigResponse> {
    return api.get('/v1/ai/config', '获取AI配置');
  },

  async updateConfig(config: AiConfig): Promise<void> {
    return api.put('/v1/ai/config', config, '保存AI配置');
  },

  async testConnection(config: AiConfig): Promise<void> {
    return api.post('/v1/ai/config/test', config, '测试连接');
  },

  async fetchProvider(action: 'balance' | 'models', apiKey?: string, provider?: string): Promise<any> {
    const body: ProviderFetchRequest = { action };
    if (apiKey) {
      body.api_key = apiKey;
    }
    if (provider) {
      body.provider = provider;
    }
    return api.post('/v1/ai/provider/fetch', body, '获取供应商信息');
  },

  async getMessages(): Promise<AiMessage[]> {
    return api.get('/v1/ai/messages', '获取对话历史');
  },

  async clearMessages(): Promise<void> {
    return api.delete('/v1/ai/messages', '清空对话');
  },
};

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: string;
  tool_call_id: string;
  tool_name: string;
  created_at: number;
}
