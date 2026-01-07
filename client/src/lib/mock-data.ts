import { addDays, subDays, format } from "date-fns";

export interface Tenant {
  id: string;
  name: string;
  contactEmail: string;
  firewallCount: number;
  status: "active" | "inactive";
}

export interface Firewall {
  id: string;
  name: string;
  hostname: string;
  serialNumber: string;
  tenantId: string;
  status: "online" | "offline" | "maintenance";
  lastSeen: string;
  version: string;
  ipAddress: string;
}

export interface TelemetryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  wanThroughput: number; // Mbps
}

export const mockTenants: Tenant[] = [
  { id: "t1", name: "Acme Corp", contactEmail: "admin@acme.com", firewallCount: 3, status: "active" },
  { id: "t2", name: "CyberDyne Systems", contactEmail: "ops@cyberdyne.net", firewallCount: 12, status: "active" },
  { id: "t3", name: "Massive Dynamic", contactEmail: "bell@massive.com", firewallCount: 1, status: "inactive" },
  { id: "t4", name: "Hooli", contactEmail: "gavin@hooli.com", firewallCount: 5, status: "active" },
];

export const mockFirewalls: Firewall[] = [
  { id: "fw1", name: "HQ Primary", hostname: "fw-hq-01", serialNumber: "OPN-2024-001", tenantId: "t1", status: "online", lastSeen: "Just now", version: "24.1.1", ipAddress: "203.0.113.10" },
  { id: "fw2", name: "HQ Backup", hostname: "fw-hq-02", serialNumber: "OPN-2024-002", tenantId: "t1", status: "online", lastSeen: "Just now", version: "24.1.1", ipAddress: "203.0.113.11" },
  { id: "fw3", name: "Branch NY", hostname: "fw-ny-01", serialNumber: "OPN-2024-003", tenantId: "t1", status: "offline", lastSeen: "2 hours ago", version: "23.7.10", ipAddress: "198.51.100.4" },
  { id: "fw4", name: "Skynet Core", hostname: "fw-sky-01", serialNumber: "OPN-AI-9000", tenantId: "t2", status: "online", lastSeen: "Just now", version: "25.0.0-DEV", ipAddress: "192.0.2.1" },
];

export const generateTelemetry = (hours: number = 24): TelemetryPoint[] => {
  const data: TelemetryPoint[] = [];
  const now = new Date();
  for (let i = hours; i >= 0; i--) {
    data.push({
      timestamp: format(subDays(now, i/24), "HH:mm"), // Simplified for chart
      cpu: Math.floor(Math.random() * 60) + 10,
      memory: Math.floor(Math.random() * 40) + 30,
      wanThroughput: Math.floor(Math.random() * 1000) + 100,
    });
  }
  return data;
};
