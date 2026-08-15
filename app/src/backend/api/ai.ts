import api from './api-client';

export interface AiConfig {
  base_url: string;
  endpoint: string;
  api_key: string;
  model: string;
  system_prompt: string;
  provider: string;
  thinking: 'auto' | 'enabled' | 'disabled' | string;
}

export interface AiConfigResponse {
  base_url: string;
  endpoint: string;
  model: string;
  has_key: boolean;
  thinking: string;
  system_prompt: string;
  provider: string;
}

export interface ProviderFetchRequest {
  action: 'balance' | 'models';
  api_key?: string;
  provider?: string;
  base_url?: string;
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
  input_schema: Record<string, unknown>
}

export interface RoleToolsResponse {
  role: string
  tools: ToolInfo[]
}

export interface QuickCommand {
  role: string
  label: string
  sort_order: number
}

export interface AiConversation {
  id: string
  role: string
  title: string
  created_at: number
  updated_at?: number
}

export const aiApi = {
  async fetchRoles(): Promise<AiRole[]> {
    return api.get('/v1/ai/roles', '获取角色列表')
  },

  async fetchRoleTools(role: string = 'financial_assistant'): Promise<RoleToolsResponse> {
    return api.get(`/v1/ai/roles/tools?role=${encodeURIComponent(role)}`, '获取工具列表')
  },

  async getConfig(role: string = 'financial_assistant', provider: string = 'deepseek'): Promise<AiConfigResponse> {
    return api.get(`/v1/ai/config?role=${encodeURIComponent(role)}&provider=${encodeURIComponent(provider)}`, '获取AI配置')
  },

  async updateConfig(config: AiConfig & { role?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant' }
    return api.put('/v1/ai/config', body, '保存AI配置')
  },

  async testConnection(config: AiConfig & { role?: string; provider?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant', provider: config.provider || 'deepseek' }
    return api.post('/v1/ai/config/test', body, '测试连接')
  },

  async fetchProvider(action: 'balance' | 'models', apiKey?: string, provider?: string, baseUrl?: string): Promise<BalanceResponse | ModelsResponse> {
    const body: ProviderFetchRequest = { action }
    if (apiKey) body.api_key = apiKey
    if (provider) body.provider = provider
    if (baseUrl) body.base_url = baseUrl
    return api.post('/v1/ai/provider/fetch', body, '获取供应商信息')
  },

  async getMessages(role: string = 'financial_assistant', conversationId?: string): Promise<AiMessage[]> {
    const q = `role=${encodeURIComponent(role)}&conversation_id=${encodeURIComponent(conversationId || 'default')}`
    return api.get(`/v1/ai/messages?${q}`, '获取对话历史')
  },

  async clearMessages(role: string = 'financial_assistant', conversationId?: string): Promise<void> {
    const q = `role=${encodeURIComponent(role)}&conversation_id=${encodeURIComponent(conversationId || 'default')}`
    return api.delete(`/v1/ai/messages?${q}`, '清空对话')
  },

  async listConversations(role: string = 'financial_assistant'): Promise<AiConversation[]> {
    return api.get(`/v1/ai/conversations?role=${encodeURIComponent(role)}`, '获取会话列表')
  },

  async createConversation(role: string = 'financial_assistant', title?: string): Promise<AiConversation> {
    return api.post('/v1/ai/conversations', { role, title }, '新建会话')
  },

  async deleteConversation(id: string): Promise<void> {
    return api.delete(`/v1/ai/conversations/${encodeURIComponent(id)}`, '删除会话')
  },

  async updateConversationTitle(id: string, title: string): Promise<AiConversation> {
    return api.put(`/v1/ai/conversations/${encodeURIComponent(id)}`, { title }, '更新会话标题')
  },

  async getQuickCommands(role: string = 'financial_assistant'): Promise<QuickCommand[]> {
    return api.get(`/v1/ai/quick-commands?role=${encodeURIComponent(role)}`, '获取快捷命令')
  },

  async saveQuickCommands(role: string, commands: { label: string }[]): Promise<void> {
    return api.put('/v1/ai/quick-commands', { role, commands }, '保存快捷命令')
  },
};

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking?: string;
  tool_calls: string;
  tool_call_id: string;
  tool_name: string;
  created_at: number;
}
