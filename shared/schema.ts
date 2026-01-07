import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Tenants table
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull(),
  status: text("status").notNull().default("active"),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const selectTenantSchema = createSelectSchema(tenants);
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// Firewalls table
export const firewalls = pgTable("firewalls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  status: text("status").notNull().default("offline"),
  version: text("version"),
  ipAddress: text("ip_address"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFirewallSchema = createInsertSchema(firewalls).omit({ id: true, createdAt: true });
export const selectFirewallSchema = createSelectSchema(firewalls);
export type InsertFirewall = z.infer<typeof insertFirewallSchema>;
export type Firewall = typeof firewalls.$inferSelect;

// Telemetry table
export const telemetry = pgTable("telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firewallId: varchar("firewall_id").notNull().references(() => firewalls.id, { onDelete: "cascade" }),
  cpu: real("cpu").notNull(),
  memory: real("memory").notNull(),
  wanThroughput: real("wan_throughput").notNull(),
  interfaces: jsonb("interfaces"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTelemetrySchema = createInsertSchema(telemetry).omit({ id: true, timestamp: true });
export const selectTelemetrySchema = createSelectSchema(telemetry);
export type InsertTelemetry = z.infer<typeof insertTelemetrySchema>;
export type Telemetry = typeof telemetry.$inferSelect;

// API Tokens for agent authentication
export const apiTokens = pgTable("api_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  firewallId: varchar("firewall_id").references(() => firewalls.id, { onDelete: "cascade" }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({ id: true, createdAt: true });
export const selectApiTokenSchema = createSelectSchema(apiTokens);
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type ApiToken = typeof apiTokens.$inferSelect;

// System telemetry (low frequency - every 30-60 min)
export const telemetrySystem = pgTable("telemetry_system", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firewallId: varchar("firewall_id").notNull().references(() => firewalls.id, { onDelete: "cascade" }),
  uptime: real("uptime"),
  loadAvg1: real("load_avg_1"),
  loadAvg5: real("load_avg_5"),
  loadAvg15: real("load_avg_15"),
  diskTotal: real("disk_total"),
  diskUsed: real("disk_used"),
  diskPercent: real("disk_percent"),
  temperature: real("temperature"),
  firmwareVersion: text("firmware_version"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTelemetrySystemSchema = createInsertSchema(telemetrySystem).omit({ id: true, timestamp: true });
export const selectTelemetrySystemSchema = createSelectSchema(telemetrySystem);
export type InsertTelemetrySystem = z.infer<typeof insertTelemetrySystemSchema>;
export type TelemetrySystem = typeof telemetrySystem.$inferSelect;

// Interface telemetry (medium frequency - every 5-10 min)
export const telemetryInterfaces = pgTable("telemetry_interfaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firewallId: varchar("firewall_id").notNull().references(() => firewalls.id, { onDelete: "cascade" }),
  interfaceName: text("interface_name").notNull(),
  description: text("description"),
  status: text("status"),
  macAddress: text("mac_address"),
  ipAddress: text("ip_address"),
  rxBytes: real("rx_bytes"),
  txBytes: real("tx_bytes"),
  rxPackets: real("rx_packets"),
  txPackets: real("tx_packets"),
  rxErrors: real("rx_errors"),
  txErrors: real("tx_errors"),
  linkSpeed: text("link_speed"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTelemetryInterfacesSchema = createInsertSchema(telemetryInterfaces).omit({ id: true, timestamp: true });
export const selectTelemetryInterfacesSchema = createSelectSchema(telemetryInterfaces);
export type InsertTelemetryInterfaces = z.infer<typeof insertTelemetryInterfacesSchema>;
export type TelemetryInterfaces = typeof telemetryInterfaces.$inferSelect;

// Services telemetry (medium frequency - every 5-10 min)
export const telemetryServices = pgTable("telemetry_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firewallId: varchar("firewall_id").notNull().references(() => firewalls.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  serviceDescription: text("service_description"),
  status: text("status"),
  isRunning: text("is_running"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTelemetryServicesSchema = createInsertSchema(telemetryServices).omit({ id: true, timestamp: true });
export const selectTelemetryServicesSchema = createSelectSchema(telemetryServices);
export type InsertTelemetryServices = z.infer<typeof insertTelemetryServicesSchema>;
export type TelemetryServices = typeof telemetryServices.$inferSelect;

// Alerts from firewall
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firewallId: varchar("firewall_id").notNull().references(() => firewalls.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  source: text("source"),
  category: text("category"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, timestamp: true });
export const selectAlertSchema = createSelectSchema(alerts);
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;
