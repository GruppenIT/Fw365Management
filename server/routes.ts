import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword, generateToken, authMiddleware, type AuthRequest } from "./auth";
import { insertUserSchema, insertTenantSchema, insertFirewallSchema, insertTelemetrySchema } from "@shared/schema";
import { fromError } from "zod-validation-error";

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
      
      // Update firewall last seen
      if (data.firewallId) {
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

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}
