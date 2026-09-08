export interface AuthStatus {
  success: boolean;
  authenticated: boolean;
  username?: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  redirectTo?: string;
}

export interface Message {
  id: number;
  remote_jid: string;
  is_from_me: boolean;
  message_type?: string;
  content?: string;
  timestamp: number;
  created_at?: string;
  contact_name?: string;
}

export interface MessagesResult {
  success: boolean;
  data: Message[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}

export interface ChatSummary {
  remote_jid: string;
  name: string;
  last_message?: string;
  last_time?: number;
  last_is_from_me?: boolean;
}

export interface Contact {
  id: number;
  name?: string;
  remote_jid: string;
  created_at: string;
}

export interface TopContact {
  name?: string;
  remote_jid: string;
  message_count: number;
}

export interface AutoReply {
  id: number;
  keyword: string;
  response: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WebhookLog {
  id: number;
  sender_jid?: string;
  response_code?: number;
  created_at: string;
}

export interface ChartPoint {
  date: string;
  inbound: number;
  outbound: number;
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T;
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `HTTP ${res.status}`);
  }
  return data;
}

async function get<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url));
}

async function post<T = { success: boolean; message?: string }>(url: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'POST',
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  );
}

async function del<T = { success: boolean; message?: string }>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { method: 'DELETE' }));
}

export const api = {
  login: (username: string, password: string, turnstileToken: string) =>
    post<LoginResult>('/api/auth/login', { username, password, turnstileToken }),

  logout: () => post<{ success: boolean; redirectTo?: string }>('/api/auth/logout'),

  authStatus: () => get<AuthStatus>('/api/auth/status'),

  csrfToken: () => get<{ success: boolean; csrfToken: string }>('/api/csrf-token'),
  turnstileKey: () => get<{ success: boolean; siteKey?: string }>('/api/auth/turnstile-key'),

  messages: (limit = 50, offset = 0, from?: string, to?: string) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return get<MessagesResult>(`/api/messages?${q.toString()}`);
  },

  chart: () => get<{ success: boolean; data: ChartPoint[] }>('/api/messages/chart'),

  contacts: () => get<{ success: boolean; data: Contact[] }>('/api/contacts'),
  topContacts: () => get<{ success: boolean; data: TopContact[] }>('/api/contacts/top'),

  chats: () => get<{ success: boolean; data: ChatSummary[] }>('/api/chats'),
  chatMessages: (jid: string) =>
    get<{ success: boolean; data: Message[] }>(`/api/chats/${encodeURIComponent(jid)}/messages`),
  deleteChat: (jid: string) =>
    del(`/api/chats/${encodeURIComponent(jid)}`),
  deleteAllChats: () => del('/api/chats'),

  autoReplies: () => get<{ success: boolean; data: AutoReply[] }>('/api/auto-replies'),
  saveAutoReply: (payload: { id?: number; keyword: string; response: string; is_active: boolean }) =>
    post('/api/auto-replies', payload),
  deleteAutoReply: (id: number) => del(`/api/auto-replies/${id}`),
  syncAutoReplies: () => post<{ success: boolean; message: string }>('/api/auto-replies/sync'),

  webhookLogs: () => get<{ success: boolean; data: WebhookLog[] }>('/api/webhook/logs'),
  testWebhook: () => post<{ success: boolean; message: string }>('/api/webhook/test'),

  send: (to: string, text: string) => post<{ success: boolean; message?: string }>('/api/send', { to, text }),
  logoutWa: () => post<{ success: boolean; message?: string }>('/api/logout'),
};