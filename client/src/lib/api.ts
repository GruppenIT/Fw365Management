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
      headers["Authorization"] = `Bearer ${this.token}`;
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
  async getTenants() {
    return this.request("/tenants");
  }

  async getTenant(id: string) {
    return this.request(`/tenants/${id}`);
  }

  async createTenant(data: { name: string; contactEmail: string; status?: string }) {
    return this.request("/tenants", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTenant(id: string, data: Partial<{ name: string; contactEmail: string; status: string }>) {
    return this.request(`/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTenant(id: string) {
    return this.request(`/tenants/${id}`, {
      method: "DELETE",
    });
  }

  // Firewalls
  async getFirewalls(tenantId?: string) {
    const query = tenantId ? `?tenantId=${tenantId}` : "";
    return this.request(`/firewalls${query}`);
  }

  async getFirewall(id: string) {
    return this.request(`/firewalls/${id}`);
  }

  async createFirewall(data: any) {
    return this.request("/firewalls", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateFirewall(id: string, data: any) {
    return this.request(`/firewalls/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteFirewall(id: string) {
    return this.request(`/firewalls/${id}`, {
      method: "DELETE",
    });
  }

  // Telemetry
  async getTelemetry(firewallId: string, hours: number = 24) {
    return this.request(`/telemetry/${firewallId}?hours=${hours}`);
  }
}

export const api = new ApiClient();
