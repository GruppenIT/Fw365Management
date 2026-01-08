import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword, generateToken, authMiddleware, type AuthRequest } from "./auth";
import { createWsSessionToken } from "./websocket";
import { 
  insertUserSchema, 
  insertTenantSchema, 
  insertFirewallSchema, 
  insertTelemetrySchema,
  insertTelemetrySystemSchema,
  insertTelemetryInterfacesSchema,
  insertTelemetryServicesSchema,
  insertAlertSchema,
} from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(data.passwordHash);
      const user = await storage.createUser({
        ...data,
        passwordHash,
      });

      const token = generateToken(user.id, user.email);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateToken(user.id, user.email);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tenants Routes
  app.get("/api/tenants", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const tenants = await storage.getTenants(req.userId!);
      res.json(tenants);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tenants/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const tenant = await storage.getTenant(req.params.id);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      res.json(tenant);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tenants", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertTenantSchema.parse({
        ...req.body,
        ownerId: req.userId,
      });

      const tenant = await storage.createTenant(data);
      res.status(201).json(tenant);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/tenants/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const tenant = await storage.updateTenant(req.params.id, req.body);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      res.json(tenant);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/tenants/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteTenant(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Firewalls Routes
  app.get("/api/firewalls", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      const firewalls = await storage.getFirewalls(tenantId);
      res.json(firewalls);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get pending firewalls - MUST be before /:id route
  app.get("/api/firewalls/pending", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const firewalls = await storage.getPendingFirewalls();
      res.json(firewalls);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/firewalls/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const firewall = await storage.getFirewall(req.params.id);
      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }
      res.json(firewall);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firewalls", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertFirewallSchema.parse(req.body);
      
      // Check if serial already exists
      const existing = await storage.getFirewallBySerial(data.serialNumber);
      if (existing) {
        return res.status(400).json({ message: "Firewall with this serial number already exists" });
      }

      const firewall = await storage.createFirewall(data);
      res.status(201).json(firewall);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/firewalls/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const firewall = await storage.updateFirewall(req.params.id, req.body);
      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }
      res.json(firewall);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/firewalls/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFirewall(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Telemetry Routes
  app.get("/api/telemetry/:firewallId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      const data = await storage.getTelemetry(req.params.firewallId, hours);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent endpoint (token-based auth)
  app.post("/api/telemetry", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = authHeader.substring(7);
      const apiToken = await storage.getApiToken(token);

      if (!apiToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const data = insertTelemetrySchema.parse(req.body);
      
      // Update firewall last seen (only if not pending)
      if (data.firewallId) {
        const firewall = await storage.getFirewall(data.firewallId);
        if (firewall && firewall.status === "pending") {
          return res.status(403).json({ message: "Firewall pending approval" });
        }
        await storage.updateFirewall(data.firewallId, {
          lastSeen: new Date(),
          status: "online",
        });
      }

      const telemetryRecord = await storage.createTelemetry(data);
      res.status(201).json(telemetryRecord);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Agent endpoint for system telemetry (low frequency)
  app.post("/api/telemetry/system", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = authHeader.substring(7);
      const apiToken = await storage.getApiToken(token);
      if (!apiToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const data = insertTelemetrySystemSchema.parse(req.body);
      
      const firewall = await storage.getFirewall(data.firewallId);
      if (firewall && firewall.status === "pending") {
        return res.status(403).json({ message: "Firewall pending approval" });
      }

      const record = await storage.createTelemetrySystem(data);
      res.status(201).json(record);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Agent endpoint for interface telemetry (medium frequency)
  app.post("/api/telemetry/interfaces", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = authHeader.substring(7);
      const apiToken = await storage.getApiToken(token);
      if (!apiToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { firewallId, interfaces } = req.body;
      if (!firewallId || !interfaces || !Array.isArray(interfaces)) {
        return res.status(400).json({ message: "firewallId and interfaces array required" });
      }

      const firewall = await storage.getFirewall(firewallId);
      if (firewall && firewall.status === "pending") {
        return res.status(403).json({ message: "Firewall pending approval" });
      }

      // Delete old interface data and insert new
      await storage.deleteTelemetryInterfaces(firewallId);
      const data = interfaces.map((iface: any) => ({
        firewallId,
        ...insertTelemetryInterfacesSchema.omit({ firewallId: true }).parse(iface),
      }));
      
      const records = await storage.createTelemetryInterfaces(data);
      res.status(201).json(records);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Agent endpoint for services telemetry (medium frequency)
  app.post("/api/telemetry/services", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = authHeader.substring(7);
      const apiToken = await storage.getApiToken(token);
      if (!apiToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { firewallId, services } = req.body;
      if (!firewallId || !services || !Array.isArray(services)) {
        return res.status(400).json({ message: "firewallId and services array required" });
      }

      const firewall = await storage.getFirewall(firewallId);
      if (firewall && firewall.status === "pending") {
        return res.status(403).json({ message: "Firewall pending approval" });
      }

      // Delete old service data and insert new
      await storage.deleteTelemetryServices(firewallId);
      const data = services.map((svc: any) => ({
        firewallId,
        ...insertTelemetryServicesSchema.omit({ firewallId: true }).parse(svc),
      }));
      
      const records = await storage.createTelemetryServices(data);
      res.status(201).json(records);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Agent endpoint for alerts
  app.post("/api/alerts", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = authHeader.substring(7);
      const apiToken = await storage.getApiToken(token);
      if (!apiToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { firewallId, alerts: alertsData } = req.body;
      if (!firewallId || !alertsData || !Array.isArray(alertsData)) {
        return res.status(400).json({ message: "firewallId and alerts array required" });
      }

      const firewall = await storage.getFirewall(firewallId);
      if (firewall && firewall.status === "pending") {
        return res.status(403).json({ message: "Firewall pending approval" });
      }

      const data = alertsData.map((alert: any) => ({
        firewallId,
        ...insertAlertSchema.omit({ firewallId: true }).parse(alert),
      }));
      
      const records = await storage.createAlerts(data);
      res.status(201).json(records);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: fromError(error).toString() });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Get system telemetry for a firewall
  app.get("/api/telemetry/:firewallId/system", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = await storage.getTelemetrySystem(req.params.firewallId);
      res.json(data || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get interface telemetry for a firewall
  app.get("/api/telemetry/:firewallId/interfaces", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = await storage.getTelemetryInterfaces(req.params.firewallId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get services telemetry for a firewall
  app.get("/api/telemetry/:firewallId/services", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = await storage.getTelemetryServices(req.params.firewallId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get alerts for a firewall
  app.get("/api/alerts/:firewallId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const data = await storage.getAlerts(req.params.firewallId, limit);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Assign firewall to tenant
  app.post("/api/firewalls/:id/assign", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.body;
      
      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Verify tenant exists
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const firewall = await storage.updateFirewall(req.params.id, { tenantId });
      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }

      res.json(firewall);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate API token for agent
  app.post("/api/tokens", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { firewallId, description } = req.body;

      if (!firewallId) {
        return res.status(400).json({ message: "firewallId is required" });
      }

      // Verify firewall exists
      const firewall = await storage.getFirewall(firewallId);
      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }

      // Generate random token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");

      const apiToken = await storage.createApiToken({
        token,
        firewallId,
        tenantId: firewall.tenantId,
        description: description || `Token for ${firewall.name}`,
      });

      res.status(201).json({
        ...apiToken,
        token, // Return plain token only once
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Agent auto-registration endpoint
  app.post("/api/agent/register", async (req, res) => {
    try {
      const { hostname, serialNumber, version, ipAddress, systemInfo } = req.body;

      if (!hostname || !serialNumber) {
        return res.status(400).json({ message: "hostname and serialNumber are required" });
      }

      // Check if firewall already exists
      let firewall = await storage.getFirewallBySerial(serialNumber);
      
      if (firewall) {
        // Update existing firewall info
        firewall = await storage.updateFirewall(firewall.id, {
          hostname,
          version: version || firewall.version,
          ipAddress: ipAddress || firewall.ipAddress,
          lastSeen: new Date(),
          status: firewall.status === "pending" ? "pending" : "online",
        });

        // Check if token exists
        const existingTokens = await storage.getApiTokensByFirewallId(firewall!.id);
        
        if (existingTokens.length > 0) {
          return res.json({
            message: "Firewall already registered",
            firewallId: firewall!.id,
            status: firewall!.status,
            hasToken: true,
          });
        }
      } else {
        // Create new firewall with pending status
        firewall = await storage.createFirewall({
          name: hostname,
          hostname,
          serialNumber,
          version: version || "Unknown",
          ipAddress: ipAddress || null,
          status: "pending",
          tenantId: null,
        });
      }

      if (!firewall) {
        return res.status(500).json({ message: "Failed to create firewall" });
      }

      // Generate token for this firewall
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");

      await storage.createApiToken({
        token,
        firewallId: firewall.id,
        tenantId: null,
        description: `Auto-generated token for ${hostname}`,
      });

      res.status(201).json({
        message: "Firewall registered successfully",
        firewallId: firewall.id,
        token,
        status: "pending",
        note: "Firewall is pending approval. An administrator needs to approve it in the console.",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Approve firewall and assign to tenant
  app.post("/api/firewalls/:id/approve", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { tenantId, name } = req.body;

      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Verify tenant exists
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const firewall = await storage.updateFirewall(req.params.id, {
        tenantId,
        status: "online",
        name: name || undefined,
      });

      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }

      // Update token with tenant
      await storage.updateApiTokensByFirewallId(firewall.id, { tenantId });

      res.json({
        message: "Firewall approved successfully",
        firewall,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create WebSocket session token for SSH terminal
  app.post("/api/firewalls/:id/ssh-session", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const firewallId = req.params.id;
      const userId = req.userId!;
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const firewall = await storage.getFirewall(firewallId);
      if (!firewall) {
        return res.status(404).json({ message: "Firewall not found" });
      }

      if (firewall.status !== "online") {
        return res.status(400).json({ message: "Firewall is not online" });
      }

      const sessionToken = createWsSessionToken(userId, firewallId, username, password);

      res.json({
        sessionToken,
        expiresIn: 60,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
