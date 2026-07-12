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

export interface AiRole {
  name: string
  display_name: string
}

export interface ToolInfo {
  name: string
  description: string
  input_schema: Record<string, any>
}

export interface RoleToolsResponse {
  role: string
  tools: ToolInfo[]
}

export const aiApi = {
  async fetchRoles(): Promise<AiRole[]> {
    return api.get('/v1/ai/roles', '获取角色列表')
  },

  async fetchRoleTools(role: string = 'financial_assistant'): Promise<RoleToolsResponse> {
    return api.get(`/v1/ai/roles/tools?role=${encodeURIComponent(role)}`, '获取工具列表')
  },

  async getConfig(role: string = 'financial_assistant'): Promise<AiConfigResponse> {
    return api.get(`/v1/ai/config?role=${encodeURIComponent(role)}`, '获取AI配置')
  },

  async updateConfig(config: AiConfig & { role?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant' }
    return api.put('/v1/ai/config', body, '保存AI配置')
  },

  async testConnection(config: AiConfig & { role?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant' }
    return api.post('/v1/ai/config/test', body, '测试连接')
  },

  async fetchProvider(action: 'balance' | 'models', apiKey?: string, provider?: string): Promise<any> {
    const body: ProviderFetchRequest = { action }
    if (apiKey) body.api_key = apiKey
    if (provider) body.provider = provider
    return api.post('/v1/ai/provider/fetch', body, '获取供应商信息')
  },

  async getMessages(role: string = 'financial_assistant'): Promise<AiMessage[]> {
    return api.get(`/v1/ai/messages?role=${encodeURIComponent(role)}`, '获取对话历史')
  },

  async clearMessages(role: string = 'financial_assistant'): Promise<void> {
    return api.delete(`/v1/ai/messages?role=${encodeURIComponent(role)}`, '清空对话')
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
