const BASE_URL =
  (typeof window !== 'undefined'
    ? (window as any).NEXT_PUBLIC_API_BASE_URL
    : undefined)
  || 'http://localhost:3001';

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
  getOrders: (filters?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return request<any[]>(`/orders${qs ? `?${qs}` : ''}`);
  },

  getOrderById: (id: string) => request<any>(`/orders/${id}`),

  // Finance
  getLedger: (partyId?: string) =>
    request<any[]>(`/finance/ledger${partyId ? `?party_identifier=${partyId}` : ''}`),

  getSummary: (partyId?: string) =>
    request<any[]>(`/finance/summary${partyId ? `?party_identifier=${partyId}` : ''}`),

  createManualEntry: (party_identifier: string, entry_type: 'DEBIT' | 'CREDIT', amount: number) =>
    request<any>('/finance/manual-entry', {
      method: 'POST',
      body: JSON.stringify({ party_identifier, entry_type, amount }),
    }),

  // WhatsApp Pairing
  requestPairCode: (whatsapp_number: string) =>
    request<{ pairing_code: string; message: string }>('/tenants/whatsapp-numbers/pair-code', {
      method: 'POST',
      body: JSON.stringify({ whatsapp_number }),
    }),

  // Inventory
  getInventory: () => request<any[]>('/inventory'),

  createProduct: (sku: string, name: string, unit_price: number, cost_price: number, current_stock: number) =>
    request<any>('/inventory', {
      method: 'POST',
      body: JSON.stringify({ sku, name, unit_price, cost_price, current_stock }),
    }),

  // Sales
  getSales: () => request<any[]>('/sales'),

  getSaleById: (id: string) => request<any>(`/sales/${id}`),

  createSale: (dto: {
    customer_identifier: string;
    sale_type: 'CASH' | 'CREDIT';
    paid_amount?: number;
    items: Array<{ product_id: string; quantity: number; selling_price?: number }>;
  }) =>
    request<any>('/sales', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  cancelSale: (id: string) =>
    request<any>(`/sales/${id}/cancel`, {
      method: 'POST',
    }),

  addSalePayment: (id: string, amount: number) =>
    request<any>(`/sales/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  // Employees
  getEmployees: () => request<any[]>('/employees'),

  getEmployeeById: (id: string) => request<any>(`/employees/${id}`),

  createEmployee: (dto: {
    name: string;
    phone?: string;
    job_title?: string;
    salary_type: 'MONTHLY' | 'DAILY';
    base_rate: number;
    auto_attendance?: boolean;
  }) =>
    request<any>('/employees', {
      method: 'POST',
      body: JSON.stringify({ ...dto, auto_attendance: dto.auto_attendance ?? true }),
    }),

  recordAttendance: (id: string, dto: {
    date: string;
    status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
    overtime_hours?: number;
    notes?: string;
  }) =>
    request<any>(`/employees/${id}/attendance`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  addEmployeeTransaction: (id: string, dto: {
    type: 'ADVANCE' | 'DEDUCTION' | 'BONUS' | 'PAYROLL_PAYMENT';
    amount: number;
    notes?: string;
  }) =>
    request<any>(`/employees/${id}/transactions`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  // Customers
  getCustomers: () => request<any[]>('/customers'),

  getCustomerById: (id: string) => request<any>(`/customers/${id}`),

  createCustomer: (dto: {
    name: string;
    phone: string;
    whatsapp?: string;
    location_address?: string;
    notes?: string;
  }) =>
    request<any>('/customers', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  // AI Chat
  getChatHistory: () => request<any[]>('/chat/history'),

  sendChatMessage: (message: string, attachments?: Array<{ mimeType: string; base64Data: string; originalName?: string }>) =>
    request<{
      reply: string;
      intent: string;
      requiresConfirmation: boolean;
      pendingAction?: {
        type: string;
        data: Record<string, unknown>;
      };
    }>('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message, attachments }),
    }),

  confirmChatAction: (actionType: string, actionData: Record<string, unknown>, msgId?: string) =>
    request<{ reply: string; success: boolean }>('/chat/confirm', {
      method: 'POST',
      body: JSON.stringify({ actionType, actionData, msgId }),
    }),
};
