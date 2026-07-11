import api from './api-client';

export interface AiConfig {
  base_url: string;
  endpoint: string;
  api_key: string;
  model: string;
}

export const aiApi = {
  async getConfig(): Promise<{ base_url: string; endpoint: string; model: string; has_key: boolean }> {
    return api.get('/v1/ai/config', '获取AI配置');
  },

  async updateConfig(config: AiConfig): Promise<void> {
    return api.put('/v1/ai/config', config, '保存AI配置');
  },

  async testConnection(config: AiConfig): Promise<void> {
    return api.post('/v1/ai/config/test', config, '测试连接');
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
