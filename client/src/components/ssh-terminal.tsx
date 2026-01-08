import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "@/lib/api";

interface SSHTerminalProps {
  firewallId: string;
  onClose?: () => void;
  onError?: (error: string) => void;
}

export function SSHTerminal({ firewallId, onClose, onError }: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"init" | "connecting" | "connected" | "error" | "closed">("init");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#32344a",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#ad8ee6",
        cyan: "#449dab",
        white: "#787c99",
        brightBlack: "#444b6a",
        brightRed: "#ff7a93",
        brightGreen: "#b9f27c",
        brightYellow: "#ff9e64",
        brightBlue: "#7da6ff",
        brightMagenta: "#bb9af7",
        brightCyan: "#0db9d7",
        brightWhite: "#acb0d0",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[33mObtendo sessao...\x1b[0m");

    const initConnection = async () => {
      try {
        const { sessionToken } = await api.createSshSession(firewallId);
        
        setStatus("connecting");
        term.writeln("\x1b[33mConectando ao firewall...\x1b[0m");

        const sessionId = crypto.randomUUID();
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws?type=terminal&token=${encodeURIComponent(sessionToken)}&firewallId=${encodeURIComponent(firewallId)}&sessionId=${encodeURIComponent(sessionId)}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          setStatus("connected");
          term.writeln("\x1b[32mConectado! Aguardando SSH...\x1b[0m\r\n");
          term.focus();
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const text = new TextDecoder().decode(event.data);
            term.write(text);
          } else if (typeof event.data === "string") {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "error") {
                term.writeln(`\r\n\x1b[31mErro: ${msg.message}\x1b[0m`);
                setStatus("error");
                setErrorMessage(msg.message);
                onError?.(msg.message);
              }
            } catch {
              term.write(event.data);
            }
          }
        };

        ws.onerror = () => {
          setStatus("error");
          setErrorMessage("Erro de conexao WebSocket");
          term.writeln("\r\n\x1b[31mErro de conexao\x1b[0m");
          onError?.("Erro de conexao WebSocket");
        };

        ws.onclose = (event) => {
          setStatus("closed");
          term.writeln(`\r\n\x1b[33mConexao encerrada: ${event.reason || "Desconectado"}\x1b[0m`);
          onClose?.();
        };

        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

      } catch (error: any) {
        setStatus("error");
        const msg = error.message || "Falha ao criar sessao";
        setErrorMessage(msg);
        term.writeln(`\r\n\x1b[31mErro: ${msg}\x1b[0m`);
        onError?.(msg);
      }
    };

    initConnection();

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, [firewallId, onClose, onError]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-green-500"
                : status === "connecting" || status === "init"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-sm text-zinc-400">
            {status === "init" && "Iniciando..."}
            {status === "connecting" && "Conectando..."}
            {status === "connected" && "Conectado"}
            {status === "error" && `Erro: ${errorMessage}`}
            {status === "closed" && "Desconectado"}
          </span>
        </div>
        <span className="text-xs text-zinc-500 font-mono">{firewallId.slice(0, 8)}</span>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 bg-[#1a1b26]" data-testid="ssh-terminal" />
    </div>
  );
}
