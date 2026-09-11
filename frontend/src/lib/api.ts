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

export interface ChartPoint {
  date: string;
  inbound: number;
  outbound: number;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { success: false, message: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    const defaultMsg = res.status === 431 ? 'Ukuran header terlalu besar. Silakan refresh halaman.' : `HTTP ${res.status}`;
    throw new Error(data && typeof data === 'object' && data.message ? data.message : defaultMsg);
  }
  return data as T;
}

async function get<T>(url: string): Promise<T> {
  return parse<T>(
    await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }),
  );
}

async function post<T = { success: boolean; message?: string }>(url: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }),
  );
}

async function del<T = { success: boolean; message?: string }>(url: string): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }),
  );
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
  getBotChatStatus: (jid: string) =>
    get<{ success: boolean; jid: string; is_muted: boolean; muted_until: number; reason: string; is_opt_out: boolean }>(
      `/api/chats/${encodeURIComponent(jid)}/bot-status`,
    ),
  toggleBotChat: (jid: string) =>
    post<{ success: boolean; jid: string; is_muted: boolean; message: string }>(
      `/api/chats/${encodeURIComponent(jid)}/bot-toggle`,
    ),
  deleteChat: (jid: string) =>
    del(`/api/chats/${encodeURIComponent(jid)}`),
  deleteAllChats: () => del('/api/chats'),

  autoReplies: () => get<{ success: boolean; data: AutoReply[] }>('/api/auto-replies'),
  saveAutoReply: (payload: { id?: number; keyword: string; response: string; is_active: boolean }) =>
    post('/api/auto-replies', payload),
  deleteAutoReply: (id: number) => del(`/api/auto-replies/${id}`),
  syncAutoReplies: () => post<{ success: boolean; message: string }>('/api/auto-replies/sync'),

  send: (to: string, text: string) => post<{ success: boolean; message?: string }>('/api/send', { to, text }),
  sendChatMedia: async (jid: string, file: File, caption?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);
    const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/media`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Gagal mengirim media (HTTP ${res.status})`);
    }
    return res.json() as Promise<{ success: boolean; message: string; file_name?: string }>;
  },
  connectWa: () => post<{ success: boolean; message?: string }>('/api/connect'),
  logoutWa: () => post<{ success: boolean; message?: string }>('/api/logout'),
};