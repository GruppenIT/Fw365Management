#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Firewall365 Agent - WebSocket Tunnel Module

Este módulo mantém conexão WebSocket persistente com o servidor central
e faz bridge para SSH local quando solicitado.

Autor: Firewall365
Versão: 1.0.0
Licença: MIT
"""

import os
import sys
import json
import time
import socket
import logging
import threading
import subprocess
import configparser
import select
from typing import Dict, Optional, Any

try:
    import websocket
except ImportError:
    print("ERRO: Módulo 'websocket-client' não encontrado.")
    print("Instale com: pkg install py311-websocket-client")
    print("Ou: pip install websocket-client")
    sys.exit(1)

CONFIG_PATH = '/etc/firewall365/agent.conf'


class SSHSession:
    """Gerencia uma sessão SSH individual."""
    
    def __init__(self, session_id: str, host: str, port: int, on_data: callable, on_close: callable, logger: logging.Logger):
        self.session_id = session_id
        self.host = host
        self.port = port
        self.on_data = on_data
        self.on_close = on_close
        self.logger = logger
        self.sock: Optional[socket.socket] = None
        self.running = False
        self.thread: Optional[threading.Thread] = None
    
    def connect(self) -> bool:
        """Conecta ao servidor SSH local."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect((self.host, self.port))
            self.sock.setblocking(False)
            self.running = True
            
            self.thread = threading.Thread(target=self._read_loop, daemon=True)
            self.thread.start()
            
            self.logger.info(f"[SSH] Sessão {self.session_id[:8]} conectada a {self.host}:{self.port}")
            return True
            
        except Exception as e:
            self.logger.error(f"[SSH] Erro ao conectar: {e}")
            return False
    
    def _read_loop(self):
        """Loop de leitura de dados do SSH."""
        while self.running and self.sock:
            try:
                readable, _, _ = select.select([self.sock], [], [], 0.1)
                if readable:
                    data = self.sock.recv(4096)
                    if data:
                        self.on_data(self.session_id, data)
                    else:
                        self.running = False
                        break
            except BlockingIOError:
                continue
            except Exception as e:
                self.logger.debug(f"[SSH] Erro na leitura: {e}")
                self.running = False
                break
        
        self.on_close(self.session_id)
    
    def send(self, data: bytes):
        """Envia dados para o SSH."""
        if self.sock and self.running:
            try:
                self.sock.sendall(data)
            except Exception as e:
                self.logger.error(f"[SSH] Erro ao enviar: {e}")
                self.close()
    
    def close(self):
        """Fecha a sessão SSH."""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
            self.sock = None
        self.logger.info(f"[SSH] Sessão {self.session_id[:8]} encerrada")


class TunnelClient:
    """Cliente de túnel WebSocket para o servidor central."""
    
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.config = self._load_config()
        self._setup_logging()
        self.running = True
        self.ws: Optional[websocket.WebSocketApp] = None
        self.ssh_sessions: Dict[str, SSHSession] = {}
        self.reconnect_delay = 5
        self.max_reconnect_delay = 60
    
    def _load_config(self) -> configparser.ConfigParser:
        """Carrega configuração."""
        config = configparser.ConfigParser()
        if os.path.exists(self.config_path):
            config.read(self.config_path)
        return config
    
    def _setup_logging(self):
        """Configura logging."""
        log_level = getattr(logging, self.config.get('agent', 'log_level', fallback='INFO'))
        log_file = self.config.get('agent', 'log_file', fallback='/var/log/firewall365/agent.log')
        
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger('firewall365-tunnel')
    
    def _get_ws_url(self) -> str:
        """Constrói URL do WebSocket."""
        endpoint = self.config.get('firewall365', 'endpoint', fallback='https://opn.gruppen.com.br/api')
        token = self.config.get('firewall365', 'bearer_token', fallback='')
        
        ws_base = endpoint.replace('https://', 'wss://').replace('http://', 'ws://')
        ws_base = ws_base.replace('/api', '')
        
        return f"{ws_base}/ws?type=agent&token={token}"
    
    def _on_message(self, ws, message: str):
        """Processa mensagem do servidor."""
        try:
            msg = json.loads(message)
            msg_type = msg.get('type')
            
            if msg_type == 'connected':
                self.logger.info(f"[TUNNEL] Conectado ao servidor")
                self.reconnect_delay = 5
            
            elif msg_type == 'ssh_open':
                session_id = msg.get('sessionId')
                host = msg.get('host', '127.0.0.1')
                port = msg.get('port', 22)
                self._open_ssh_session(session_id, host, port)
            
            elif msg_type == 'ssh_data':
                session_id = msg.get('sessionId')
                data = msg.get('data', '')
                if session_id in self.ssh_sessions:
                    import base64
                    raw_data = base64.b64decode(data)
                    self.ssh_sessions[session_id].send(raw_data)
            
            elif msg_type == 'ssh_close':
                session_id = msg.get('sessionId')
                if session_id in self.ssh_sessions:
                    self.ssh_sessions[session_id].close()
                    del self.ssh_sessions[session_id]
            
            elif msg_type == 'ping':
                ws.send(json.dumps({'type': 'pong'}))
        
        except Exception as e:
            self.logger.error(f"[TUNNEL] Erro ao processar mensagem: {e}")
    
    def _open_ssh_session(self, session_id: str, host: str, port: int):
        """Abre uma nova sessão SSH."""
        if session_id in self.ssh_sessions:
            self.logger.warning(f"[SSH] Sessão {session_id[:8]} já existe")
            return
        
        session = SSHSession(
            session_id=session_id,
            host=host,
            port=port,
            on_data=self._ssh_data_callback,
            on_close=self._ssh_close_callback,
            logger=self.logger
        )
        
        if session.connect():
            self.ssh_sessions[session_id] = session
        else:
            self._send_message({
                'type': 'ssh_error',
                'sessionId': session_id,
                'error': 'Failed to connect to SSH'
            })
    
    def _ssh_data_callback(self, session_id: str, data: bytes):
        """Callback quando há dados do SSH."""
        import base64
        self._send_message({
            'type': 'ssh_data',
            'sessionId': session_id,
            'data': base64.b64encode(data).decode('utf-8')
        })
    
    def _ssh_close_callback(self, session_id: str):
        """Callback quando a sessão SSH fecha."""
        self._send_message({
            'type': 'ssh_closed',
            'sessionId': session_id
        })
        if session_id in self.ssh_sessions:
            del self.ssh_sessions[session_id]
    
    def _send_message(self, msg: dict):
        """Envia mensagem ao servidor."""
        if self.ws:
            try:
                self.ws.send(json.dumps(msg))
            except Exception as e:
                self.logger.error(f"[TUNNEL] Erro ao enviar: {e}")
    
    def _on_error(self, ws, error):
        """Handler de erro."""
        self.logger.error(f"[TUNNEL] Erro WebSocket: {error}")
    
    def _on_close(self, ws, close_status_code, close_msg):
        """Handler de fechamento."""
        self.logger.warning(f"[TUNNEL] Conexão fechada: {close_status_code} - {close_msg}")
        for session in list(self.ssh_sessions.values()):
            session.close()
        self.ssh_sessions.clear()
    
    def _on_open(self, ws):
        """Handler de abertura."""
        self.logger.info("[TUNNEL] WebSocket conectado")
    
    def run(self):
        """Loop principal do túnel."""
        self.logger.info("[TUNNEL] Iniciando Firewall365 Tunnel v1.0.0")
        
        token = self.config.get('firewall365', 'bearer_token', fallback='')
        if not token:
            self.logger.error("[TUNNEL] Token não configurado. Execute o agente principal primeiro.")
            return
        
        verify_ssl = self.config.getboolean('firewall365', 'verify_ssl', fallback=True)
        
        while self.running:
            try:
                ws_url = self._get_ws_url()
                self.logger.info(f"[TUNNEL] Conectando a {ws_url[:50]}...")
                
                sslopt = {} if verify_ssl else {"cert_reqs": 0, "check_hostname": False}
                
                self.ws = websocket.WebSocketApp(
                    ws_url,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                    on_open=self._on_open
                )
                
                self.ws.run_forever(sslopt=sslopt, ping_interval=30, ping_timeout=10)
                
            except Exception as e:
                self.logger.error(f"[TUNNEL] Exceção: {e}")
            
            if self.running:
                self.logger.info(f"[TUNNEL] Reconectando em {self.reconnect_delay}s...")
                time.sleep(self.reconnect_delay)
                self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
        
        self.logger.info("[TUNNEL] Encerrado")
    
    def stop(self):
        """Para o túnel."""
        self.running = False
        if self.ws:
            self.ws.close()


def main():
    """Função principal."""
    client = TunnelClient()
    
    import signal
    def signal_handler(signum, frame):
        print("\nEncerrando túnel...")
        client.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    client.run()


if __name__ == '__main__':
    main()
