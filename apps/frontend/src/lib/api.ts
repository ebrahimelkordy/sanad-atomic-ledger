const BASE_URL = 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cipher_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error?.message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Auth
export const api = {
  login: (name: string, password: string) =>
    request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),

  register: (businessName: string, verticalType: string, whatsappNumber: string, numberRole = 'PUBLIC_SALES', password?: string) =>
    request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ businessName, verticalType, whatsappNumber, numberRole, password }),
    }),

  // Tenant
  getMe: () => request<any>('/tenants/me'),

  getWhatsappNumbers: () => request<any[]>('/tenants/whatsapp-numbers'),

  addWhatsappNumber: (whatsapp_number: string, number_role: string) =>
    request<any>('/tenants/whatsapp-numbers', {
      method: 'POST',
      body: JSON.stringify({ whatsapp_number, number_role }),
    }),

  // Orders
  getOrders: () => request<any[]>('/orders'),

  getOrderById: (id: string) => request<any>(`/orders/${id}`),

  // Finance
  getLedger: (partyId?: string) =>
    request<any[]>(`/finance/ledger${partyId ? `?party_identifier=${partyId}` : ''}`),

  getSummary: (partyId?: string) =>
    request<any[]>(`/finance/summary${partyId ? `?party_identifier=${partyId}` : ''}`),
};
