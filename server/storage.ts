import { db } from "./db";
import { 
  users, 
  tenants, 
  firewalls, 
  telemetry, 
  apiTokens,
  type User, 
  type InsertUser,
  type Tenant,
  type InsertTenant,
  type Firewall,
  type InsertFirewall,
  type Telemetry,
  type InsertTelemetry,
  type ApiToken,
  type InsertApiToken,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Tenants
  getTenants(ownerId: string): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: string): Promise<void>;

  // Firewalls
  getFirewalls(tenantId?: string): Promise<(Firewall & { tenantName?: string })[]>;
  getFirewall(id: string): Promise<Firewall | undefined>;
  getFirewallBySerial(serialNumber: string): Promise<Firewall | undefined>;
  createFirewall(firewall: InsertFirewall): Promise<Firewall>;
  updateFirewall(id: string, data: Partial<InsertFirewall>): Promise<Firewall | undefined>;
  deleteFirewall(id: string): Promise<void>;

  // Telemetry
  getTelemetry(firewallId: string, hours?: number): Promise<Telemetry[]>;
  createTelemetry(data: InsertTelemetry): Promise<Telemetry>;

  // API Tokens
  getApiToken(token: string): Promise<ApiToken | undefined>;
  createApiToken(data: InsertApiToken): Promise<ApiToken>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  // Tenants
  async getTenants(ownerId: string): Promise<Tenant[]> {
    return await db.select().from(tenants).where(eq(tenants.ownerId, ownerId));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const result = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return result[0];
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const result = await db.insert(tenants).values(tenant).returning();
    return result[0];
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const result = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return result[0];
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  // Firewalls
  async getFirewalls(tenantId?: string): Promise<(Firewall & { tenantName?: string })[]> {
    if (tenantId) {
      const result = await db
        .select({
          firewall: firewalls,
          tenant: tenants,
        })
        .from(firewalls)
        .leftJoin(tenants, eq(firewalls.tenantId, tenants.id))
        .where(eq(firewalls.tenantId, tenantId));

      return result.map(({ firewall, tenant }) => ({
        ...firewall,
        tenantName: tenant?.name,
      }));
    }

    const result = await db
      .select({
        firewall: firewalls,
        tenant: tenants,
      })
      .from(firewalls)
      .leftJoin(tenants, eq(firewalls.tenantId, tenants.id));

    return result.map(({ firewall, tenant }) => ({
      ...firewall,
      tenantName: tenant?.name,
    }));
  }

  async getFirewall(id: string): Promise<Firewall | undefined> {
    const result = await db.select().from(firewalls).where(eq(firewalls.id, id)).limit(1);
    return result[0];
  }

  async getFirewallBySerial(serialNumber: string): Promise<Firewall | undefined> {
    const result = await db.select().from(firewalls).where(eq(firewalls.serialNumber, serialNumber)).limit(1);
    return result[0];
  }

  async createFirewall(firewall: InsertFirewall): Promise<Firewall> {
    const result = await db.insert(firewalls).values(firewall).returning();
    return result[0];
  }

  async updateFirewall(id: string, data: Partial<InsertFirewall>): Promise<Firewall | undefined> {
    const result = await db.update(firewalls).set(data).where(eq(firewalls.id, id)).returning();
    return result[0];
  }

  async deleteFirewall(id: string): Promise<void> {
    await db.delete(firewalls).where(eq(firewalls.id, id));
  }

  // Telemetry
  async getTelemetry(firewallId: string, hours: number = 24): Promise<Telemetry[]> {
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);

    return await db
      .select()
      .from(telemetry)
      .where(and(
        eq(telemetry.firewallId, firewallId),
        gte(telemetry.timestamp, hoursAgo)
      ))
      .orderBy(desc(telemetry.timestamp));
  }

  async createTelemetry(data: InsertTelemetry): Promise<Telemetry> {
    const result = await db.insert(telemetry).values(data).returning();
    return result[0];
  }

  // API Tokens
  async getApiToken(token: string): Promise<ApiToken | undefined> {
    const result = await db.select().from(apiTokens).where(eq(apiTokens.token, token)).limit(1);
    return result[0];
  }

  async createApiToken(data: InsertApiToken): Promise<ApiToken> {
    const result = await db.insert(apiTokens).values(data).returning();
    return result[0];
  }
}

export const storage = new DbStorage();
