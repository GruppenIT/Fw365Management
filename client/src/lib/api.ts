const API_BASE = "/api";

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  token: string;
}

export interface RegisterData {
  email: string;
  name: string;
  passwordHash: string;
  role?: string;
}

export interface Tenant {
  id: string;
  name: string;
  contactEmail: string;
  status: string;
  ownerId: string;
  createdAt: string;
}

export interface Firewall {
  id: string;
  name: string;
  hostname: string;
  serialNumber: string;
  tenantId: string | null;
  tenantName?: string;
  status: string;
  version: string | null;
  ipAddress: string | null;
  lastSeen: string | null;
  createdAt: string;
}

export interface Telemetry {
  id: string;
  firewallId: string;
  cpu: number;
  memory: number;
  wanThroughput: number;
  interfaces: unknown;
  timestamp: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem("auth_token");
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("auth_token", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("auth_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(response.token);
    return response;
  }

  async register(data: RegisterData): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  async getMe() {
    return this.request("/auth/me");
  }

  // Tenants
  async getTenants(): Promise<Tenant[]> {
    return this.request("/tenants");
  }

  async getTenant(id: string): Promise<Tenant> {
    return this.request(`/tenants/${id}`);
  }

  async createTenant(data: { name: string; contactEmail: string; status?: string }): Promise<Tenant> {
    return this.request("/tenants", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTenant(id: string, data: Partial<{ name: string; contactEmail: string; status: string }>): Promise<Tenant> {
    return this.request(`/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTenant(id: string): Promise<void> {
    return this.request(`/tenants/${id}`, {
      method: "DELETE",
    });
  }

  // Firewalls
  async getFirewalls(tenantId?: string): Promise<Firewall[]> {
    const query = tenantId ? `?tenantId=${tenantId}` : "";
    return this.request(`/firewalls${query}`);
  }

  async getFirewall(id: string): Promise<Firewall> {
    return this.request(`/firewalls/${id}`);
  }

  async createFirewall(data: Partial<Firewall>): Promise<Firewall> {
    return this.request("/firewalls", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateFirewall(id: string, data: Partial<Firewall>): Promise<Firewall> {
    return this.request(`/firewalls/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteFirewall(id: string): Promise<void> {
    return this.request(`/firewalls/${id}`, {
      method: "DELETE",
    });
  }

  async assignFirewallToTenant(firewallId: string, tenantId: string): Promise<Firewall> {
    return this.request(`/firewalls/${firewallId}/assign`, {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    });
  }

  async getPendingFirewalls(): Promise<Firewall[]> {
    return this.request("/firewalls/pending");
  }

  async approveFirewall(firewallId: string, tenantId: string, name?: string): Promise<{ message: string; firewall: Firewall }> {
    return this.request(`/firewalls/${firewallId}/approve`, {
      method: "POST",
      body: JSON.stringify({ tenantId, name }),
    });
  }

  async generateApiToken(firewallId: string, description?: string) {
    return this.request("/tokens", {
      method: "POST",
      body: JSON.stringify({ firewallId, description }),
    });
  }

  // Telemetry
  async getTelemetry(firewallId: string, hours: number = 24): Promise<Telemetry[]> {
    return this.request(`/telemetry/${firewallId}?hours=${hours}`);
  }

  async getTelemetrySystem(firewallId: string) {
    return this.request<any>(`/telemetry/${firewallId}/system`);
  }

  async getTelemetryInterfaces(firewallId: string) {
    return this.request<any[]>(`/telemetry/${firewallId}/interfaces`);
  }

  async getTelemetryServices(firewallId: string) {
    return this.request<any[]>(`/telemetry/${firewallId}/services`);
  }

  async getAlerts(firewallId: string, limit: number = 50) {
    return this.request<any[]>(`/alerts/${firewallId}?limit=${limit}`);
  }
}

export const api = new ApiClient();
