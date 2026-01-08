import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { storage } from "./storage";
import crypto from "crypto";

interface AgentConnection {
  ws: WebSocket;
  firewallId: string;
  sshSessions: Map<string, WebSocket>;
}

interface TerminalConnection {
  ws: WebSocket;
  userId: string;
  firewallId: string;
  sessionId: string;
}

interface WsSessionToken {
  userId: string;
  firewallId: string;
  username: string;
  password: string;
  expiresAt: number;
}

const agentConnections = new Map<string, AgentConnection>();
const terminalConnections = new Map<string, TerminalConnection>();
const wsSessionTokens = new Map<string, WsSessionToken>();

export function createWsSessionToken(userId: string, firewallId: string, username: string, password: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  wsSessionTokens.set(token, {
    userId,
    firewallId,
    username,
    password,
    expiresAt: Date.now() + 60000,
  });
  
  setTimeout(() => wsSessionTokens.delete(token), 60000);
  
  return token;
}

export function validateWsSessionToken(token: string): WsSessionToken | null {
  const session = wsSessionTokens.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    wsSessionTokens.delete(token);
    return null;
  }
  wsSessionTokens.delete(token);
  return session;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const type = url.searchParams.get("type");
    const token = url.searchParams.get("token");

    if (type === "agent") {
      handleAgentConnection(ws, token);
    } else if (type === "terminal") {
      const firewallId = url.searchParams.get("firewallId");
      const sessionId = url.searchParams.get("sessionId");
      handleTerminalConnection(ws, token, firewallId, sessionId);
    } else {
      ws.close(1008, "Invalid connection type");
    }
  });

  console.log("[websocket] WebSocket server initialized on /ws");
  return wss;
}

async function handleAgentConnection(ws: WebSocket, token: string | null) {
  if (!token) {
    ws.close(1008, "Token required");
    return;
  }

  const apiToken = await storage.getApiToken(token);
  if (!apiToken || !apiToken.firewallId) {
    ws.close(1008, "Invalid token");
    return;
  }

  const firewallId = apiToken.firewallId;
  console.log(`[websocket] Agent connected: ${firewallId}`);

  const connection: AgentConnection = {
    ws,
    firewallId,
    sshSessions: new Map(),
  };

  agentConnections.set(firewallId, connection);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleAgentMessage(connection, message);
    } catch (e) {
      console.error("[websocket] Invalid agent message:", e);
    }
  });

  ws.on("close", () => {
    console.log(`[websocket] Agent disconnected: ${firewallId}`);
    agentConnections.delete(firewallId);
    connection.sshSessions.forEach((termWs) => {
      termWs.close(1000, "Agent disconnected");
    });
  });

  ws.on("error", (err) => {
    console.error(`[websocket] Agent error (${firewallId}):`, err.message);
  });

  ws.send(JSON.stringify({ type: "connected", firewallId }));
}

async function handleTerminalConnection(
  ws: WebSocket,
  token: string | null,
  firewallId: string | null,
  sessionId: string | null
) {
  if (!token || !sessionId) {
    ws.close(1008, "Missing parameters");
    return;
  }

  const session = validateWsSessionToken(token);
  if (!session) {
    ws.close(1008, "Invalid or expired session token");
    return;
  }

  const userId = session.userId;
  const validFirewallId = session.firewallId;
  const sshUsername = session.username;
  const sshPassword = session.password;

  if (firewallId && firewallId !== validFirewallId) {
    ws.close(1008, "Firewall ID mismatch");
    return;
  }

  const firewall = await storage.getFirewall(validFirewallId);
  if (!firewall || firewall.status !== "online") {
    ws.close(1008, "Firewall not found or not online");
    return;
  }
  
  firewallId = validFirewallId;

  const agentConn = agentConnections.get(firewallId);
  if (!agentConn || agentConn.ws.readyState !== WebSocket.OPEN) {
    ws.close(1008, "Agent not connected");
    return;
  }

  console.log(`[websocket] Terminal connected: ${sessionId} -> ${firewallId}`);

  const connection: TerminalConnection = {
    ws,
    userId,
    firewallId,
    sessionId,
  };

  terminalConnections.set(sessionId, connection);
  agentConn.sshSessions.set(sessionId, ws);

  agentConn.ws.send(JSON.stringify({
    type: "ssh_open",
    sessionId,
    username: sshUsername,
    password: sshPassword,
  }));

  ws.on("message", (data) => {
    if (agentConn.ws.readyState === WebSocket.OPEN) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      agentConn.ws.send(JSON.stringify({
        type: "ssh_data",
        sessionId,
        data: buffer.toString("base64"),
      }));
    }
  });

  ws.on("close", () => {
    console.log(`[websocket] Terminal disconnected: ${sessionId}`);
    terminalConnections.delete(sessionId);
    agentConn.sshSessions.delete(sessionId);
    
    if (agentConn.ws.readyState === WebSocket.OPEN) {
      agentConn.ws.send(JSON.stringify({
        type: "ssh_close",
        sessionId,
      }));
    }
  });

  ws.on("error", (err) => {
    console.error(`[websocket] Terminal error (${sessionId}):`, err.message);
  });
}

function handleAgentMessage(connection: AgentConnection, message: any) {
  const { type, sessionId, data } = message;

  if (type === "ssh_data" && sessionId) {
    const termWs = connection.sshSessions.get(sessionId);
    if (termWs && termWs.readyState === WebSocket.OPEN) {
      const buffer = Buffer.from(data, "base64");
      termWs.send(buffer);
    }
  } else if (type === "ssh_error" && sessionId) {
    const termWs = connection.sshSessions.get(sessionId);
    if (termWs) {
      termWs.send(JSON.stringify({ type: "error", message: message.error }));
      termWs.close(1000, message.error);
    }
    connection.sshSessions.delete(sessionId);
  } else if (type === "ssh_closed" && sessionId) {
    const termWs = connection.sshSessions.get(sessionId);
    if (termWs) {
      termWs.close(1000, "SSH session closed");
    }
    connection.sshSessions.delete(sessionId);
  } else if (type === "pong") {
  }
}

export function getAgentStatus(firewallId: string): boolean {
  const conn = agentConnections.get(firewallId);
  return conn !== undefined && conn.ws.readyState === WebSocket.OPEN;
}

export function getConnectedAgents(): string[] {
  return Array.from(agentConnections.keys());
}
